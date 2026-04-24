// CPU driver for time auction.
//
// Real-time bidding makes the CPU shape a bit unusual: instead of choosing
// one move per phase, each CPU schedules a press immediately and then a
// release after a chosen hold duration. The "best move" is a target hold
// duration (in ms) computed from a simple value-per-token heuristic.
//
// Easy/medium/hard divergence (via pickWithDifficulty over a discrete set
// of candidate bids):
//   - easy   → 80% chance of a random legal bid (often wastes bank)
//   - medium → 40% random, 60% near the evaluator's pick
//   - hard   →  5% random, 95% near the evaluator's pick

import type { CpuDriver } from '../registry.js';
import { pickWithDifficulty } from '../cpu/difficulty.js';

interface CpuView {
  timeAuction?: {
    phase: string;
    round: number;
    totalRounds: number;
    biddingStartedAt: number | null;
    me?: {
      pressStartedAt: number | null;
      lockedBidMs: number | null;
    } | null;
    players?: { id: string; tokens: number; timeBankMs: number }[];
  };
}

// evaluator: how long should a CPU hold given the current state?
//   - value-per-remaining-token = bank / roundsRemaining
//   - target bid hovers around that value, with a little jitter so two
//     CPUs don't bid identically every round
//   - clamped to [0, bank]
function evaluateTargetBidMs(
  bankMs: number,
  roundsRemaining: number,
  myTokens: number,
  maxOpponentTokens: number,
): number {
  if (bankMs <= 0 || roundsRemaining <= 0) return 0;
  const baseValue = bankMs / Math.max(1, roundsRemaining);
  // if I'm trailing on tokens, push harder; if I'm ahead, conserve.
  const aggression = myTokens >= maxOpponentTokens ? 0.7 : 1.15;
  const jitter = 0.85 + Math.random() * 0.3; // ±15%
  const target = baseValue * aggression * jitter;
  return Math.max(0, Math.min(bankMs, Math.round(target)));
}

// build a small ladder of candidate bids around the evaluator's pick so
// pickWithDifficulty has a meaningful "legal moves" set to choose from.
function candidateBids(bankMs: number): number[] {
  if (bankMs <= 0) return [0];
  const ladder = [
    0,
    Math.round(bankMs * 0.05),
    Math.round(bankMs * 0.1),
    Math.round(bankMs * 0.2),
    Math.round(bankMs * 0.35),
    Math.round(bankMs * 0.5),
    Math.round(bankMs * 0.75),
    bankMs,
  ];
  // dedupe (small banks collapse the ladder).
  return Array.from(new Set(ladder)).sort((a, b) => a - b);
}

export const driveTimeAuctionCpus: CpuDriver = ({
  game,
  cpuPlayerIds,
  difficulty,
  schedule,
}) => {
  for (const cpuId of cpuPlayerIds) {
    const state = game.getStateForPlayer?.(cpuId) as CpuView | undefined;
    const ta = state?.timeAuction;
    if (!ta) continue;
    if (ta.phase !== 'bidding') continue;
    const me = ta.me;
    if (!me) continue;
    // already locked or already holding for this round? skip — we only
    // schedule once per round.
    if (me.lockedBidMs !== null) continue;
    if (me.pressStartedAt !== null) continue;

    const myPublic = ta.players?.find((p) => p.id === cpuId);
    if (!myPublic) continue;
    const bankMs = myPublic.timeBankMs;
    if (bankMs <= 0) continue;

    const roundsRemaining = Math.max(1, ta.totalRounds - ta.round + 1);
    const opponents = (ta.players ?? []).filter((p) => p.id !== cpuId);
    const maxOpponentTokens = opponents.reduce(
      (m, p) => Math.max(m, p.tokens),
      0,
    );
    const target = evaluateTargetBidMs(bankMs, roundsRemaining, myPublic.tokens, maxOpponentTokens);

    const ladder = candidateBids(bankMs);
    // pick the ladder rung closest to the evaluator's target as the
    // "best move", then let difficulty inject randomness.
    const best = ladder.reduce((a, b) =>
      Math.abs(b - target) < Math.abs(a - target) ? b : a,
    );
    const chosen = pickWithDifficulty(ladder, best, difficulty);

    // schedule the press immediately, release after `chosen` ms.
    schedule(() => {
      // re-check before pressing — phase may have ended while we waited.
      const fresh = game.getStateForPlayer?.(cpuId) as CpuView | undefined;
      if (fresh?.timeAuction?.phase !== 'bidding') return;
      if (fresh.timeAuction.me?.lockedBidMs !== null) return;
      try {
        game.handleAction(cpuId, { type: 'time-auction/press', payload: {} });
      } catch {
        return;
      }
      // release after the chosen hold duration. setTimeout inside a
      // schedule callback is fine — the registry's `schedule` only
      // applies the up-front delay; the release timing is governed by
      // the bid we picked.
      setTimeout(() => {
        try {
          game.handleAction(cpuId, { type: 'time-auction/release', payload: {} });
        } catch {
          // game may have ended; ignore.
        }
      }, chosen);
    });
  }
};
