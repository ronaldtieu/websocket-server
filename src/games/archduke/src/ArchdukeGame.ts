// ArchdukeGame — first-playable implementation of archduke.
// implements GameInterface and exposes getStateForPlayer so each player's
// knowledge of their own set (peeked cards, just-drawn card) stays private.
//
// phase machine:
//   waiting → initial-peek
//          → turn-draw → turn-decide → [resolving-action] → (next turn) → turn-draw
//          → round-end → scoring-break → (next round) → turn-draw
//          → finished (after final round)
//
// timer transitions are owned by the Game itself (via onPhaseChange callback);
// the socket handler just surfaces the game and listens for per-action broadcasts.

import type {
  GameInterface,
  GameState,
  PlayerAction,
  PlayerState,
} from '../../GameInterface.js';
import {
  PHASE_DURATIONS,
  type ArchdukePhase,
  type ArchdukePlayerPublic,
  type ArchdukePublicState,
  type ArchdukeRoundSummary,
  type ArchdukeStateForPlayer,
  type ArchdukeTurnInfo,
  type Card,
  type FaceAction,
  type SlotId,
  type SlotState,
} from './types.js';
import { buildDeck, cardsMatch, faceActionOf } from './cards.js';
import { pickRoundWinner, scoreSet, slotsToRevealed } from './scoring.js';

const SLOTS_PER_PLAYER = 4;
const TURNS_PER_ROUND_DEFAULT = 12; // total turns (rotated across players)
const TURNS_PER_ROUND_TEST = 6;
const ROUNDS_DEFAULT = 3;
const ROUNDS_TEST = 1;
const INITIAL_PEEK_SLOTS: SlotId[] = [2, 3]; // peek your two bottom cards at setup

interface InternalPlayer {
  id: string;
  name: string;
  isConnected: boolean;
  slots: SlotState[];
  totalScore: number;
  roundScore: number | null;
  // which slot ids this player has currently peeked (known privately).
  // reset whenever the slot changes (swap, give, eclipse-swap, round boundary).
  // slot indices are numbers — they can exceed 3 after GIVE extends the set.
  knownSlots: Map<number, Card>;
  // transient: foreign card this player last peeked via PEEK action.
  peekedForeignCard: null | { targetPlayerId: string; slot: number; card: Card };
  // transient: last revealed slot to surface "just peeked" animation
  lastRevealedSlot: number | null;
  isEliminated: boolean;
}

export class ArchdukeGame implements GameInterface {
  readonly gameId: string;
  private players: Map<string, InternalPlayer> = new Map();
  private seatOrder: string[] = []; // insertion order → turn rotation
  private phase: ArchdukePhase = 'waiting';
  private phaseDeadline: number | null = null;
  private phaseTimer: NodeJS.Timeout | null = null;
  private gameStarted = false;

  private round = 0;
  private totalRounds: number;
  private turnsPerRound: number;
  private turnsTakenThisRound = 0;
  private activeSeatIndex = 0;

  private deck: Card[] = [];
  private discard: Card[] = [];
  private drawnCard: Card | null = null; // card held by active player during turn-decide
  private pendingAction: FaceAction | null = null;
  private pendingActionSource: string | null = null; // player id whose action is resolving

  private lastRoundSummary: ArchdukeRoundSummary | null = null;
  private winnerId: string | null = null;

  onPhaseChange: (() => void) | null = null;

  constructor(gameId: string, opts: { testMode?: boolean } = {}) {
    this.gameId = gameId;
    this.totalRounds = opts.testMode ? ROUNDS_TEST : ROUNDS_DEFAULT;
    this.turnsPerRound = opts.testMode ? TURNS_PER_ROUND_TEST : TURNS_PER_ROUND_DEFAULT;
  }

  // --- GameInterface ---

  getState(): GameState {
    return {
      players: this.publicPlayerStates(),
      status:
        this.phase === 'waiting'
          ? 'waiting'
          : this.phase === 'finished'
            ? 'finished'
            : 'in_progress',
      archduke: this.publicArchdukeState(),
    };
  }

  getStateForPlayer(playerId: string): GameState {
    const base = this.publicArchdukeState();
    const me = this.players.get(playerId);
    const stateForPlayer: ArchdukeStateForPlayer = {
      ...base,
      me: me
        ? {
            playerId: me.id,
            knownSlots: this.knownSlotsArray(me),
            myDrawnCard:
              this.phase === 'turn-decide' && this.activePlayerId() === me.id
                ? this.drawnCard
                : null,
            peekedForeignCard: me.peekedForeignCard,
          }
        : null,
    };
    return {
      players: this.publicPlayerStates(),
      status:
        this.phase === 'waiting'
          ? 'waiting'
          : this.phase === 'finished'
            ? 'finished'
            : 'in_progress',
      archduke: stateForPlayer,
    };
  }

  addPlayer(playerId: string, playerName: string): boolean {
    if (this.players.has(playerId)) return false;
    if (this.players.size >= 6) return false;
    if (this.gameStarted) return false;
    this.players.set(playerId, this.freshPlayer(playerId, playerName));
    this.seatOrder.push(playerId);
    return true;
  }

  removePlayer(playerId: string): void {
    const p = this.players.get(playerId);
    if (p) p.isConnected = false;
  }

  handleAction(playerId: string, action: PlayerAction): GameState {
    const player = this.players.get(playerId);
    if (!player) throw new Error('player not in game');
    if (player.isEliminated) throw new Error('eliminated players cannot act');

    switch (action.type) {
      case 'archduke/ack-peek': {
        // purely advisory — player has seen their peek. we don't block on it.
        // actual advance happens on timer.
        return this.getState();
      }
      case 'archduke/draw': {
        if (this.phase !== 'turn-draw') throw new Error('not in draw phase');
        if (this.activePlayerId() !== playerId) throw new Error('not your turn');
        this.performDraw();
        break;
      }
      case 'archduke/decide': {
        if (this.phase !== 'turn-decide') throw new Error('not in decide phase');
        if (this.activePlayerId() !== playerId) throw new Error('not your turn');
        const payload = action.payload as
          | { decision: 'swap'; slot: SlotId }
          | { decision: 'discard' }
          | { decision: 'match'; slot: SlotId };
        this.performDecision(player, payload);
        break;
      }
      case 'archduke/resolve-action': {
        if (this.phase !== 'resolving-action') throw new Error('no action to resolve');
        if (this.pendingActionSource !== playerId) throw new Error('not your action');
        const payload = action.payload as
          | { action: 'peek'; targetPlayerId: string; slot: SlotId }
          | { action: 'give'; targetPlayerId: string }
          | {
              action: 'swap';
              aPlayerId: string;
              aSlot: SlotId;
              bPlayerId: string;
              bSlot: SlotId;
            };
        this.performResolveAction(player, payload);
        break;
      }
      case 'archduke/skip-action': {
        if (this.phase !== 'resolving-action') throw new Error('no action to resolve');
        if (this.pendingActionSource !== playerId) throw new Error('not your action');
        this.pendingAction = null;
        this.pendingActionSource = null;
        this.finishTurn();
        break;
      }
      default:
        throw new Error(`unknown action ${action.type}`);
    }
    return this.getState();
  }

  isFull(): boolean {
    return this.players.size >= 6;
  }

  hasStarted(): boolean {
    return this.gameStarted;
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  start(_playerId: string): boolean {
    if (this.gameStarted) return false;
    if (this.players.size < 2) return false;
    this.gameStarted = true;
    this.beginRound(1);
    return true;
  }

  destroy(): void {
    this.clearTimer();
  }

  // --- optional host controls ---

  skipPhase(): void {
    if (this.phase === 'waiting' || this.phase === 'finished') return;
    this.clearTimer();
    this.advanceFromPhase(this.phase);
  }

  // --- CPU helpers (read-only views for the cpu driver) ---

  // expose the active player so the CPU driver can gate turn-based actions.
  getActivePlayerId(): string | null {
    return this.activePlayerId();
  }

  getPhase(): ArchdukePhase {
    return this.phase;
  }

  // legal target slots for a peek target (any player's 4 slots).
  // helpful for the CPU evaluator.
  listPlayers(): { id: string; slots: SlotState[] }[] {
    return Array.from(this.players.values())
      .filter((p) => !p.isEliminated)
      .map((p) => ({ id: p.id, slots: [...p.slots] }));
  }

  getDrawnCardFor(playerId: string): Card | null {
    if (this.activePlayerId() !== playerId) return null;
    return this.drawnCard;
  }

  getKnownSlotsFor(playerId: string): Map<number, Card> {
    const p = this.players.get(playerId);
    return p ? new Map(p.knownSlots) : new Map();
  }

  getPendingAction(): FaceAction | null {
    return this.pendingAction;
  }

  // --- internals: setup & round lifecycle ---

  private freshPlayer(id: string, name: string): InternalPlayer {
    return {
      id,
      name,
      isConnected: true,
      slots: [],
      totalScore: 0,
      roundScore: null,
      knownSlots: new Map(),
      peekedForeignCard: null,
      lastRevealedSlot: null,
      isEliminated: false,
    };
  }

  private beginRound(round: number): void {
    this.round = round;
    this.turnsTakenThisRound = 0;
    this.activeSeatIndex = (round - 1) % Math.max(1, this.seatOrder.length);
    this.drawnCard = null;
    this.pendingAction = null;
    this.pendingActionSource = null;
    this.lastRoundSummary = null;
    this.deck = buildDeck();
    this.discard = [];
    // one card flipped up on the discard pile to seed matching intuition
    const seed = this.deck.pop();
    if (seed) this.discard.push(seed);

    for (const p of this.players.values()) {
      if (p.isEliminated) continue;
      p.slots = [];
      for (let i = 0; i < SLOTS_PER_PLAYER; i += 1) {
        const c = this.deck.pop();
        p.slots.push(c ? { kind: 'card', card: c } : { kind: 'empty' });
      }
      p.knownSlots = new Map();
      p.peekedForeignCard = null;
      p.lastRevealedSlot = null;
      p.roundScore = null;
      // initial peek of the two bottom slots (per common first-flip rules)
      for (const slotId of INITIAL_PEEK_SLOTS) {
        const slot = p.slots[slotId];
        if (slot?.kind === 'card') p.knownSlots.set(slotId, slot.card);
      }
    }
    this.setPhase('initial-peek');
  }

  private activePlayerId(): string | null {
    if (this.seatOrder.length === 0) return null;
    // skip eliminated seats
    for (let i = 0; i < this.seatOrder.length; i += 1) {
      const idx = (this.activeSeatIndex + i) % this.seatOrder.length;
      const pid = this.seatOrder[idx];
      const p = this.players.get(pid);
      if (p && !p.isEliminated) return pid;
    }
    return null;
  }

  private advanceSeat(): void {
    if (this.seatOrder.length === 0) return;
    this.activeSeatIndex = (this.activeSeatIndex + 1) % this.seatOrder.length;
  }

  private setPhase(phase: ArchdukePhase): void {
    this.phase = phase;
    this.clearTimer();
    if (phase === 'waiting' || phase === 'finished') {
      this.phaseDeadline = null;
    } else {
      const duration = PHASE_DURATIONS[phase];
      this.phaseDeadline = Date.now() + duration;
      this.phaseTimer = setTimeout(() => this.advanceFromPhase(phase), duration);
    }
    this.onPhaseChange?.();
  }

  private clearTimer(): void {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  private advanceFromPhase(from: ArchdukePhase): void {
    switch (from) {
      case 'initial-peek':
        this.setPhase('turn-draw');
        break;
      case 'turn-draw':
        // auto-draw for the active player if they stalled
        this.autoDrawIfIdle();
        break;
      case 'turn-decide':
        // auto-discard if the active player stalled
        this.autoDecideIfIdle();
        break;
      case 'resolving-action':
        // timeout on an action → skip it
        this.pendingAction = null;
        this.pendingActionSource = null;
        this.finishTurn();
        break;
      case 'round-end':
        this.setPhase('scoring-break');
        break;
      case 'scoring-break':
        this.afterScoring();
        break;
      default:
        break;
    }
  }

  private autoDrawIfIdle(): void {
    // active player didn't draw in time → auto-draw for them
    const pid = this.activePlayerId();
    if (!pid) return;
    this.performDraw();
  }

  private autoDecideIfIdle(): void {
    const pid = this.activePlayerId();
    if (!pid) return;
    const p = this.players.get(pid);
    if (!p || !this.drawnCard) return;
    // default fallback: just discard (keeps set unchanged, triggers face action on autopilot)
    this.performDecision(p, { decision: 'discard' });
  }

  // --- internals: turn actions ---

  private performDraw(): void {
    const card = this.deck.pop();
    if (!card) {
      // deck empty — force round end
      this.endRound();
      return;
    }
    this.drawnCard = card;
    this.setPhase('turn-decide');
  }

  private performDecision(
    player: InternalPlayer,
    decision:
      | { decision: 'swap'; slot: SlotId }
      | { decision: 'discard' }
      | { decision: 'match'; slot: SlotId },
  ): void {
    const drawn = this.drawnCard;
    if (!drawn) throw new Error('no card drawn');

    if (decision.decision === 'swap') {
      const slot = player.slots[decision.slot];
      if (!slot) throw new Error('invalid slot');
      const displaced: Card | null = slot.kind === 'card' ? slot.card : null;
      player.slots[decision.slot] = { kind: 'card', card: drawn };
      // the drawer now KNOWS the newly-placed card (they literally just put it in)
      player.knownSlots.set(decision.slot, drawn);
      player.lastRevealedSlot = decision.slot;
      this.drawnCard = null;

      if (displaced) {
        this.discard.push(displaced);
        const action = faceActionOf(displaced);
        if (action) {
          this.beginPendingAction(player.id, action);
          return;
        }
      }
      this.finishTurn();
      return;
    }

    if (decision.decision === 'discard') {
      this.discard.push(drawn);
      this.drawnCard = null;
      const action = faceActionOf(drawn);
      if (action) {
        this.beginPendingAction(player.id, action);
        return;
      }
      this.finishTurn();
      return;
    }

    if (decision.decision === 'match') {
      const slot = player.slots[decision.slot];
      if (!slot || slot.kind !== 'card') throw new Error('no card in that slot');
      if (!cardsMatch(drawn, slot.card)) throw new Error('cards do not match');
      const matched = slot.card;
      // remove both — drawn goes straight to discard; slot becomes empty
      this.discard.push(matched);
      this.discard.push(drawn);
      player.slots[decision.slot] = { kind: 'empty' };
      player.knownSlots.delete(decision.slot);
      player.lastRevealedSlot = decision.slot;
      this.drawnCard = null;
      // if the set card was a face card, its action fires on match
      const matchedAction = faceActionOf(matched);
      if (matchedAction) {
        this.beginPendingAction(player.id, matchedAction);
        return;
      }
      this.finishTurn();
      return;
    }
  }

  private beginPendingAction(sourceId: string, action: FaceAction): void {
    this.pendingAction = action;
    this.pendingActionSource = sourceId;
    this.setPhase('resolving-action');
  }

  private performResolveAction(
    player: InternalPlayer,
    payload:
      | { action: 'peek'; targetPlayerId: string; slot: SlotId }
      | { action: 'give'; targetPlayerId: string }
      | {
          action: 'swap';
          aPlayerId: string;
          aSlot: SlotId;
          bPlayerId: string;
          bSlot: SlotId;
        },
  ): void {
    if (this.pendingAction !== payload.action) {
      throw new Error('action mismatch');
    }

    if (payload.action === 'peek') {
      const target = this.players.get(payload.targetPlayerId);
      if (!target) throw new Error('no such player');
      const slot = target.slots[payload.slot];
      if (!slot || slot.kind !== 'card') throw new Error('slot has no card');
      // peek reveals to the source player only. store on their private view.
      if (target.id === player.id) {
        player.knownSlots.set(payload.slot, slot.card);
        player.lastRevealedSlot = payload.slot;
      } else {
        player.peekedForeignCard = {
          targetPlayerId: target.id,
          slot: payload.slot,
          card: slot.card,
        };
      }
    } else if (payload.action === 'give') {
      const target = this.players.get(payload.targetPlayerId);
      if (!target) throw new Error('no such player');
      const penalty = this.deck.pop();
      if (!penalty) {
        // deck empty — no penalty to give
        this.pendingAction = null;
        this.pendingActionSource = null;
        this.finishTurn();
        return;
      }
      // find first empty slot, else append a bonus slot
      let placed = false;
      for (let i = 0; i < target.slots.length; i += 1) {
        if (target.slots[i].kind === 'empty') {
          target.slots[i] = { kind: 'card', card: penalty };
          // target doesn't peek at it — it's penalty
          target.knownSlots.delete(i as SlotId);
          placed = true;
          break;
        }
      }
      if (!placed) {
        target.slots.push({ kind: 'card', card: penalty });
      }
    } else if (payload.action === 'swap') {
      const a = this.players.get(payload.aPlayerId);
      const b = this.players.get(payload.bPlayerId);
      if (!a || !b) throw new Error('no such player');
      if (payload.aPlayerId === payload.bPlayerId && payload.aSlot === payload.bSlot) {
        throw new Error('cannot swap a slot with itself');
      }
      const slotA = a.slots[payload.aSlot];
      const slotB = b.slots[payload.bSlot];
      if (!slotA || !slotB) throw new Error('invalid slot');
      // swap positions; no one peeks at the result (per rules)
      a.slots[payload.aSlot] = slotB;
      b.slots[payload.bSlot] = slotA;
      // any prior knowledge of these slots is now stale for the slot owners.
      // foreign-peek knowledge lives on `peekedForeignCard` which is transient
      // and cleared at end-of-turn anyway, so no extra bookkeeping needed.
      a.knownSlots.delete(payload.aSlot);
      b.knownSlots.delete(payload.bSlot);
    }

    this.pendingAction = null;
    this.pendingActionSource = null;
    this.finishTurn();
  }

  private finishTurn(): void {
    // clear transient per-turn peek reveal on the ACTIVE player after a short cycle;
    // but keep peekedForeignCard for the active player to see in the next tick.
    this.turnsTakenThisRound += 1;
    if (this.turnsTakenThisRound >= this.turnsPerRound) {
      this.endRound();
      return;
    }
    // rotate to the next seat (skip eliminated)
    this.advanceSeat();
    // ensure we're pointed at a live player
    const nextActive = this.activePlayerId();
    if (!nextActive) {
      this.endRound();
      return;
    }
    // clear per-turn transient display state
    for (const p of this.players.values()) {
      p.lastRevealedSlot = null;
      // peek banners fade as soon as the peeker's turn ends (they had a full
      // turn + the action-resolution window to read their own card).
      p.peekedForeignCard = null;
    }
    this.setPhase('turn-draw');
  }

  private endRound(): void {
    // reveal all sets, compute round scores, accumulate totals
    const revealed: ArchdukeRoundSummary['revealed'] = [];
    const roundScores: { playerId: string; score: number }[] = [];
    for (const p of this.players.values()) {
      if (p.isEliminated) continue;
      const score = scoreSet(p.slots);
      p.roundScore = score;
      p.totalScore += score;
      revealed.push({
        playerId: p.id,
        cards: slotsToRevealed(p.slots),
        roundScore: score,
      });
      roundScores.push({ playerId: p.id, score });
      // clear any transient peek state
      p.peekedForeignCard = null;
    }
    this.lastRoundSummary = { round: this.round, revealed };
    // tie-breaking: lowest round score wins the round (informational only)
    pickRoundWinner(roundScores);
    this.drawnCard = null;
    this.pendingAction = null;
    this.pendingActionSource = null;
    this.setPhase('round-end');
  }

  private afterScoring(): void {
    if (this.round >= this.totalRounds) {
      this.finishGame();
      return;
    }
    this.beginRound(this.round + 1);
  }

  private finishGame(): void {
    // the winner is the player with the LOWEST total score.
    let best: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const p of this.players.values()) {
      if (p.isEliminated) continue;
      if (p.totalScore < bestScore) {
        bestScore = p.totalScore;
        best = p.id;
      }
    }
    this.winnerId = best;
    this.setPhase('finished');
  }

  // --- internals: serialization ---

  private publicPlayerStates(): PlayerState[] {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isConnected: p.isConnected,
    }));
  }

  private publicArchdukeState(): ArchdukePublicState {
    const players: ArchdukePlayerPublic[] = Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      slots: p.slots.map((s, i) => ({
        id: i,
        empty: s.kind === 'empty',
      })),
      roundScore: p.roundScore,
      totalScore: p.totalScore,
      isEliminated: p.isEliminated,
      lastRevealedSlot: p.lastRevealedSlot,
    }));
    const turn: ArchdukeTurnInfo | null =
      this.phase === 'turn-draw' || this.phase === 'turn-decide' || this.phase === 'resolving-action'
        ? {
            activePlayerId: this.activePlayerId() ?? '',
            drawnCardPublic:
              this.phase === 'turn-decide' && this.drawnCard
                ? { visible: false, card: null } // identity hidden to others
                : null,
            pendingAction: this.pendingAction,
          }
        : null;

    const discardTop = this.discard.length > 0 ? this.discard[this.discard.length - 1] : null;

    return {
      phase: this.phase,
      round: this.round,
      totalRounds: this.totalRounds,
      phaseDeadline: this.phaseDeadline,
      turnsTakenThisRound: this.turnsTakenThisRound,
      turnsPerRound: this.turnsPerRound,
      deckRemaining: this.deck.length,
      discardTop,
      players,
      turn,
      lastRoundSummary: this.lastRoundSummary,
      winnerId: this.winnerId,
    };
  }

  private knownSlotsArray(me: InternalPlayer): (Card | null)[] {
    return me.slots.map((s, i) => {
      if (s.kind !== 'card') return null;
      const known = me.knownSlots.get(i as SlotId);
      return known ?? null;
    });
  }
}
