// pure helpers for time auction round + end-of-game scoring.
// kept side-effect-free so they're easy to unit-test later.

export interface BidEntry {
  playerId: string;
  // bid duration in ms. 0 if the player never pressed this round.
  bidMs: number;
  // remaining time bank in ms — used for tiebreaks.
  timeBankMs: number;
}

export interface RoundResult {
  winnerId: string | null;
  winningBidMs: number | null;
  // true iff nobody bid anything > 0 and we picked at random.
  awardedRandomly: boolean;
}

// resolve a round per spec §3.2:
// - highest bid wins
// - tie → among tied, more remaining time bank wins
// - still tied → first by id (stable global tiebreak)
// - if nobody bid > 0 → award to a random eligible player
export function resolveRound(bids: BidEntry[], rng: () => number = Math.random): RoundResult {
  if (bids.length === 0) {
    return { winnerId: null, winningBidMs: null, awardedRandomly: false };
  }

  const positiveBidders = bids.filter((b) => b.bidMs > 0);
  if (positiveBidders.length === 0) {
    // nobody pressed — random award. spec wants this logged.
    const pick = bids[Math.floor(rng() * bids.length)];
    return { winnerId: pick.playerId, winningBidMs: 0, awardedRandomly: true };
  }

  const sorted = [...positiveBidders].sort((a, b) => {
    if (b.bidMs !== a.bidMs) return b.bidMs - a.bidMs;
    if (b.timeBankMs !== a.timeBankMs) return b.timeBankMs - a.timeBankMs;
    return a.playerId.localeCompare(b.playerId);
  });

  return {
    winnerId: sorted[0].playerId,
    winningBidMs: sorted[0].bidMs,
    awardedRandomly: false,
  };
}

export interface EndGameOutcome {
  topPlayerId: string | null; // +1 piece
  bottomPlayerId: string | null; // -1 piece, eliminated
}

// end-of-game per spec §3.2:
// most tokens → +1 piece, fewest → eliminated (-1 piece). tiebreak: more
// remaining time bank, then global (id) tiebreak. with only one player
// active we can't both reward and eliminate the same person — top wins,
// nothing else happens.
export function resolveEndGame(
  bids: { playerId: string; tokens: number; timeBankMs: number }[],
): EndGameOutcome {
  if (bids.length === 0) return { topPlayerId: null, bottomPlayerId: null };

  const sortedDesc = [...bids].sort((a, b) => {
    if (b.tokens !== a.tokens) return b.tokens - a.tokens;
    if (b.timeBankMs !== a.timeBankMs) return b.timeBankMs - a.timeBankMs;
    return a.playerId.localeCompare(b.playerId);
  });
  const sortedAsc = [...bids].sort((a, b) => {
    if (a.tokens !== b.tokens) return a.tokens - b.tokens;
    if (a.timeBankMs !== b.timeBankMs) return a.timeBankMs - b.timeBankMs;
    return a.playerId.localeCompare(b.playerId);
  });

  const top = sortedDesc[0];
  const bottom = sortedAsc[0];

  if (bids.length === 1 || top.playerId === bottom.playerId) {
    return { topPlayerId: top.playerId, bottomPlayerId: null };
  }
  return { topPlayerId: top.playerId, bottomPlayerId: bottom.playerId };
}
