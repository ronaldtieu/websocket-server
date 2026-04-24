// CPU driver for archduke. plugs into the shared CPU registry.
// the evaluator scores candidate moves by projected set-value impact
// (since archduke wants to MINIMIZE the sum of their set), using only
// the CPU's own private knowledge. pickWithDifficulty swaps the best
// move for a random legal one at easy/medium rates — easy feels sloppy,
// medium feels human, hard nearly always plays the evaluator's pick.

import type { CpuDriver } from '../../registry.js';
import { pickWithDifficulty } from '../../cpu/difficulty.js';
import { cardValue, cardsMatch, faceActionOf } from './cards.js';
import type { ArchdukeGame } from './ArchdukeGame.js';
import type { Card, FaceAction, SlotId } from './types.js';

// ---- public archduke state envelope as seen by the CPU ----

type CpuView = {
  archduke?: {
    phase: string;
    turn?: {
      activePlayerId: string;
      pendingAction: FaceAction | null;
    } | null;
    players?: { id: string; slots: { id: number; empty: boolean }[]; isEliminated: boolean }[];
    me?: {
      playerId: string;
      knownSlots: (Card | null)[];
      myDrawnCard: Card | null;
    };
  };
};

// the estimated value of an unknown slot, used when we don't know what's there.
// 6.5 roughly matches the deck average of number cards 1..13 shifted a bit
// toward the faces-are-zero contribution. tune after playtests.
const UNKNOWN_SLOT_ESTIMATE = 6.0;

// score a SLOT card (or estimate) for the CPU's own set.
// lower = better (we want the lowest total).
function scoreSlotCard(card: Card | null): number {
  if (!card) return UNKNOWN_SLOT_ESTIMATE;
  return cardValue(card);
}

// evaluate replacing a slot with `drawn`: delta = new - old. negative is good.
function swapDelta(drawn: Card, existing: Card | null): number {
  return cardValue(drawn) - scoreSlotCard(existing);
}

// ---- decide-phase move generator ----

type DecideMove =
  | { decision: 'swap'; slot: SlotId }
  | { decision: 'discard' }
  | { decision: 'match'; slot: SlotId };

function legalDecideMoves(knownSlots: (Card | null)[], drawn: Card): DecideMove[] {
  const moves: DecideMove[] = [{ decision: 'discard' }];
  // swap into any of the 4 slots
  for (let i = 0; i < Math.min(knownSlots.length, 4); i += 1) {
    moves.push({ decision: 'swap', slot: i as SlotId });
  }
  // match requires a KNOWN card that matches — we only propose matches we can
  // verify from our private knowledge (the rules let you attempt blind matches,
  // but a good CPU wouldn't risk it).
  for (let i = 0; i < knownSlots.length; i += 1) {
    const existing = knownSlots[i];
    if (existing && cardsMatch(drawn, existing)) {
      moves.push({ decision: 'match', slot: i as SlotId });
    }
  }
  return moves;
}

function scoreDecide(move: DecideMove, knownSlots: (Card | null)[], drawn: Card): number {
  // the evaluator returns a utility (HIGHER = better), because
  // pickWithDifficulty does straight comparison via argmax.
  // we express everything as "reduction in expected set total" (higher = more reduction).
  switch (move.decision) {
    case 'match': {
      const existing = knownSlots[move.slot];
      if (!existing) return 0;
      // both cards leave the set; we save their combined value
      return scoreSlotCard(existing) + cardValue(drawn);
    }
    case 'swap': {
      const existing = knownSlots[move.slot];
      const delta = swapDelta(drawn, existing);
      // "reduction" is negative of delta (swapping in a lower card is good)
      return -delta;
    }
    case 'discard': {
      // discarding a face card fires its action — worth a small bonus because
      // actions can be used offensively. we don't project far ahead here.
      const face = faceActionOf(drawn);
      // if drawn is itself a high-value card, discarding it is neutral (we save
      // ourselves from having added it). if it's the archduke (-3), discarding
      // it is a small mistake (we'd rather keep it).
      const base = cardValue(drawn) >= 0 ? 0 : cardValue(drawn); // negative if we discard a low-value card
      return (face ? 0.5 : 0) - base;
    }
  }
}

function pickBestDecide(
  moves: DecideMove[],
  knownSlots: (Card | null)[],
  drawn: Card,
): DecideMove {
  let best = moves[0];
  let bestScore = scoreDecide(best, knownSlots, drawn);
  for (let i = 1; i < moves.length; i += 1) {
    const s = scoreDecide(moves[i], knownSlots, drawn);
    if (s > bestScore) {
      bestScore = s;
      best = moves[i];
    }
  }
  return best;
}

// ---- action-resolution heuristics ----

// choose a target for a peek: prefer a slot we don't know from our own set
// first (info gain on ourselves); else peek an opponent with the most unknowns.
function choosePeekTarget(
  game: ArchdukeGame,
  cpuId: string,
): { targetPlayerId: string; slot: number } | null {
  const known = game.getKnownSlotsFor(cpuId);
  const mySlots = game.listPlayers().find((p) => p.id === cpuId)?.slots;
  if (mySlots) {
    for (let i = 0; i < mySlots.length; i += 1) {
      if (mySlots[i].kind === 'card' && !known.has(i)) {
        return { targetPlayerId: cpuId, slot: i };
      }
    }
  }
  // fall back: peek at an opponent's slot
  for (const p of game.listPlayers()) {
    if (p.id === cpuId) continue;
    for (let i = 0; i < p.slots.length; i += 1) {
      if (p.slots[i].kind === 'card') return { targetPlayerId: p.id, slot: i };
    }
  }
  return null;
}

function chooseGiveTarget(game: ArchdukeGame, cpuId: string): string | null {
  // give to the opponent with the lowest projected score (hurt the leader)
  const opponents = game.listPlayers().filter((p) => p.id !== cpuId);
  if (opponents.length === 0) return null;
  // project by counting non-empty slots; we don't know their identities.
  opponents.sort((a, b) => {
    const aCards = a.slots.filter((s) => s.kind === 'card').length;
    const bCards = b.slots.filter((s) => s.kind === 'card').length;
    return aCards - bCards; // fewer cards now = leader → penalize
  });
  return opponents[0].id;
}

function chooseSwapTargets(
  game: ArchdukeGame,
  cpuId: string,
): {
  aPlayerId: string;
  aSlot: number;
  bPlayerId: string;
  bSlot: number;
} | null {
  // try to swap our WORST known card with an opponent's unknown card
  const known = game.getKnownSlotsFor(cpuId);
  let myWorstSlot: number | null = null;
  let myWorstValue = -Infinity;
  for (const [slot, card] of known.entries()) {
    const v = cardValue(card);
    if (v > myWorstValue) {
      myWorstValue = v;
      myWorstSlot = slot;
    }
  }
  if (myWorstSlot === null) return null;
  const opponents = game.listPlayers().filter((p) => p.id !== cpuId);
  for (const opp of opponents) {
    for (let i = 0; i < opp.slots.length; i += 1) {
      if (opp.slots[i].kind === 'card') {
        return {
          aPlayerId: cpuId,
          aSlot: myWorstSlot,
          bPlayerId: opp.id,
          bSlot: i,
        };
      }
    }
  }
  return null;
}

// ---- driver ----

export const driveArchdukeCpus: CpuDriver = ({ game, cpuPlayerIds, difficulty, schedule }) => {
  const anyGame = game as ArchdukeGame;
  for (const cpuId of cpuPlayerIds) {
    const view = game.getStateForPlayer?.(cpuId) as CpuView | undefined;
    const ad = view?.archduke;
    if (!ad) continue;
    const phase = ad.phase;

    // only act when it's THIS CPU's turn (or action to resolve)
    const myTurn = ad.turn?.activePlayerId === cpuId;

    if (phase === 'turn-draw' && myTurn) {
      schedule(() => {
        game.handleAction(cpuId, { type: 'archduke/draw', payload: {} });
      });
      continue;
    }

    if (phase === 'turn-decide' && myTurn) {
      const knownSlots = ad.me?.knownSlots ?? [];
      const drawn = ad.me?.myDrawnCard;
      if (!drawn) continue;
      const legal = legalDecideMoves(knownSlots, drawn);
      const best = pickBestDecide(legal, knownSlots, drawn);
      const pick = pickWithDifficulty(legal, best, difficulty);
      schedule(() => {
        game.handleAction(cpuId, { type: 'archduke/decide', payload: pick });
      });
      continue;
    }

    if (phase === 'resolving-action' && ad.turn?.activePlayerId === cpuId) {
      const action = ad.turn.pendingAction;
      if (!action) continue;
      schedule(() => {
        if (action === 'peek') {
          const tgt = choosePeekTarget(anyGame, cpuId);
          if (!tgt) {
            game.handleAction(cpuId, { type: 'archduke/skip-action', payload: {} });
            return;
          }
          game.handleAction(cpuId, {
            type: 'archduke/resolve-action',
            payload: { action: 'peek', ...tgt },
          });
        } else if (action === 'give') {
          const targetPlayerId = chooseGiveTarget(anyGame, cpuId);
          if (!targetPlayerId) {
            game.handleAction(cpuId, { type: 'archduke/skip-action', payload: {} });
            return;
          }
          game.handleAction(cpuId, {
            type: 'archduke/resolve-action',
            payload: { action: 'give', targetPlayerId },
          });
        } else if (action === 'swap') {
          const swap = chooseSwapTargets(anyGame, cpuId);
          if (!swap) {
            game.handleAction(cpuId, { type: 'archduke/skip-action', payload: {} });
            return;
          }
          game.handleAction(cpuId, {
            type: 'archduke/resolve-action',
            payload: { action: 'swap', ...swap },
          });
        }
      });
      continue;
    }
  }
};
