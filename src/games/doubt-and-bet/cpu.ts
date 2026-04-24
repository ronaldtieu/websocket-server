// CPU driver for doubt-and-bet. evaluator estimates probability that the
// current claim is true given the CPU's own cards + expected matches among
// unknown cards. high probability → raise (smallest legal raise to keep
// options open); low probability → doubt. on a fresh round (no claim yet),
// the CPU opens with a conservative claim near its own count of the most
// common color in hand.

import type { CpuDriver } from '../registry.js';
import { pickWithDifficulty } from '../cpu/difficulty.js';
import {
  ALL_COLORS,
  type CardColor,
  type Claim,
  type DoubtColor,
  type DoubtStateForPlayer,
} from './types.js';
import { enumerateLegalRaises, estimateClaimMatches } from './claims.js';

type CpuView = {
  doubtAndBet?: DoubtStateForPlayer;
};

const RAINBOW_FRACTION = 0.1;
const NUM_COLORS = 4;

// crude truth-probability proxy. we estimate expected matches and check how
// far the claim's `n` sits from that expectation, scaled by a notional spread.
// returns a probability in [0, 1].
function probClaimTrue(
  myHand: CardColor[],
  unknownCards: number,
  claim: Claim,
): number {
  const expected = estimateClaimMatches(
    myHand,
    unknownCards,
    claim.color,
    NUM_COLORS,
    RAINBOW_FRACTION,
  );
  // standard deviation proxy: sqrt(unknown * p * (1 - p))
  const p = (1 - RAINBOW_FRACTION) / NUM_COLORS + RAINBOW_FRACTION;
  const sd = Math.sqrt(Math.max(1, unknownCards) * p * (1 - p));
  // P(X >= n) approximated by logistic of (expected - n) / sd
  const z = (expected - claim.n) / Math.max(0.5, sd);
  return 1 / (1 + Math.exp(-z));
}

function countByColor(hand: CardColor[]): Record<DoubtColor, number> {
  const counts: Record<DoubtColor, number> = { yellow: 0, green: 0, blue: 0, red: 0 };
  let rainbows = 0;
  for (const c of hand) {
    if (c === 'rainbow') rainbows += 1;
    else counts[c] += 1;
  }
  // rainbows boost every color
  for (const c of ALL_COLORS) counts[c] += rainbows;
  return counts;
}

// pick an opening claim. use the color in which we have the most cards (incl.
// rainbows) and bid roughly our count + a fraction of expected unknown matches.
function chooseOpeningClaim(myHand: CardColor[], unknownCards: number): { n: number; color: DoubtColor } {
  const counts = countByColor(myHand);
  let best: DoubtColor = 'yellow';
  for (const c of ALL_COLORS) if (counts[c] > counts[best]) best = c;
  const probColor = (1 - RAINBOW_FRACTION) / NUM_COLORS + RAINBOW_FRACTION;
  const expectedFromOthers = unknownCards * probColor;
  // bid slightly below expected total so the opening claim is plausible.
  const target = Math.max(1, Math.round(counts[best] + expectedFromOthers * 0.6));
  return { n: target, color: best };
}

export const driveDoubtAndBetCpus: CpuDriver = ({ game, cpuPlayerIds, difficulty, schedule }) => {
  for (const cpuId of cpuPlayerIds) {
    const state = (game.getStateForPlayer?.(cpuId) as CpuView | undefined)?.doubtAndBet;
    if (!state || !state.me) continue;

    const { phase } = state;
    const myHand = state.me.private.cards;

    if (phase === 'claiming') {
      const activeId = state.seating[state.activeSeat - 1];
      if (activeId !== cpuId) continue;
      schedule(() => {
        const totalTable = state.players
          .filter((p) => !p.isEliminated)
          .reduce((sum, p) => sum + p.cardCount, 0);
        const unknownCards = Math.max(0, totalTable - myHand.length);
        const best = chooseOpeningClaim(myHand, unknownCards);
        // legal opening claims: n in [1, totalTable], any non-rainbow color.
        const legal: Array<{ n: number; color: DoubtColor }> = [];
        for (let n = 1; n <= totalTable; n += 1) {
          for (const c of ALL_COLORS) legal.push({ n, color: c });
        }
        if (legal.length === 0) return;
        const choice = pickWithDifficulty(legal, best, difficulty);
        game.handleAction(cpuId, { type: 'doubt/claim', payload: choice });
      });
    } else if (phase === 'responding') {
      const responderId = state.responderSeat ? state.seating[state.responderSeat - 1] : null;
      if (responderId !== cpuId) continue;
      const claim = state.currentClaim;
      if (!claim) continue;
      schedule(() => {
        const totalTable = state.players
          .filter((p) => !p.isEliminated)
          .reduce((sum, p) => sum + p.cardCount, 0);
        const unknownCards = Math.max(0, totalTable - myHand.length);
        const probTrue = probClaimTrue(myHand, unknownCards, claim);
        // legal moves: every legal raise, plus doubt. expressed as a tagged
        // union so pickWithDifficulty can pick a random one.
        type Move =
          | { kind: 'doubt' }
          | { kind: 'raise'; n: number; color: DoubtColor };
        const raises = enumerateLegalRaises(claim, totalTable);
        const legal: Move[] = [{ kind: 'doubt' }, ...raises.map((r) => ({ kind: 'raise' as const, ...r }))];
        let bestMove: Move;
        if (probTrue > 0.55 && raises.length > 0) {
          // believe the claim — make the smallest legal raise to keep
          // options open.
          const cheapest = [...raises].sort((a, b) => a.n - b.n || 0)[0];
          bestMove = { kind: 'raise', ...cheapest };
        } else {
          bestMove = { kind: 'doubt' };
        }
        const choice = pickWithDifficulty(legal, bestMove, difficulty);
        if (choice.kind === 'doubt') {
          game.handleAction(cpuId, { type: 'doubt/doubt', payload: {} });
        } else {
          game.handleAction(cpuId, {
            type: 'doubt/raise',
            payload: { n: choice.n, color: choice.color },
          });
        }
      });
    } else if (phase === 'buy-slot') {
      // buy a slot back if we can afford it and we're below max. simple
      // heuristic: hard CPUs buy when slots <= 2 and pieces >= 3; medium
      // when slots <= 1; easy randomly skips.
      const me = state.players.find((p) => p.id === cpuId);
      if (!me || me.isEliminated) continue;
      if (state.me.private.boughtSlotThisRound) continue;
      if (me.slots >= 5 || me.pieces < 1) continue;
      const want =
        (difficulty === 'hard' && me.slots <= 2 && me.pieces >= 3) ||
        (difficulty === 'medium' && me.slots <= 1) ||
        (difficulty === 'easy' && Math.random() < 0.2);
      if (!want) continue;
      schedule(() => {
        game.handleAction(cpuId, { type: 'doubt/buy-slot', payload: {} });
      });
    }
  }
};
