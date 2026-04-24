// pure helpers for claim ranking, raise validation, and doubt resolution.
// kept side-effect-free so the CPU evaluator can call them too.

import {
  ALL_COLORS,
  COLOR_RANK,
  type CardColor,
  type Claim,
  type DoubtColor,
} from './types.js';

// total cards on the table (sum of all live players' cards). used as the upper
// bound on a legal claim's `n`.
export function tableSize(handsByPlayer: Map<string, CardColor[]>): number {
  let total = 0;
  for (const hand of handsByPlayer.values()) total += hand.length;
  return total;
}

// strictly higher than `prev` per the spec:
// - raise N (any color), OR
// - keep N and move to a strictly stricter color (Yellow < Green < Blue < Red).
// tied escalation (same N, same color) is illegal — must strictly raise N.
export function isLegalRaise(prev: Claim, next: Pick<Claim, 'n' | 'color'>): boolean {
  if (next.n < 1) return false;
  if (next.n > prev.n) return true;
  if (next.n === prev.n) {
    return COLOR_RANK[next.color] > COLOR_RANK[prev.color];
  }
  return false;
}

// enumerate all legal raises against `prev` capped by `maxN`. used by CPU and
// by the server to validate / enumerate the choice space.
export function enumerateLegalRaises(prev: Claim, maxN: number): Array<{ n: number; color: DoubtColor }> {
  const out: Array<{ n: number; color: DoubtColor }> = [];
  // same N, stricter color
  for (const c of ALL_COLORS) {
    if (COLOR_RANK[c] > COLOR_RANK[prev.color]) {
      out.push({ n: prev.n, color: c });
    }
  }
  // higher N, any color
  for (let n = prev.n + 1; n <= maxN; n += 1) {
    for (const c of ALL_COLORS) {
      out.push({ n, color: c });
    }
  }
  return out;
}

// count cards on the table matching the claim's color. rainbows always count
// as the claimed color (favoring "claim is true").
export function countMatching(handsByPlayer: Map<string, CardColor[]>, color: DoubtColor): number {
  let n = 0;
  for (const hand of handsByPlayer.values()) {
    for (const card of hand) {
      if (card === color || card === 'rainbow') n += 1;
    }
  }
  return n;
}

// CPU helper: given my own hand, the number of unknown cards still on the
// table, the claimed color, and the deck color distribution, estimate the
// expected total count of matching cards (including rainbows). this is the
// E[X] of a binomial across unknown cards plus my own deterministic count.
export function estimateClaimMatches(
  myHand: CardColor[],
  unknownCards: number,
  color: DoubtColor,
  numColors: number,
  rainbowFraction: number,
): number {
  const myMatches = myHand.filter((c) => c === color || c === 'rainbow').length;
  const probColor = (1 - rainbowFraction) / numColors + rainbowFraction;
  return myMatches + unknownCards * probColor;
}
