// Sealed-bid auction resolution.
//
// Inputs: the arrows on offer, plus each player's allocation map
// {arrowId: chips}. Each allocation must be ≥1 chip per arrow to be
// considered for that arrow (spec). Players cannot allocate more chips
// than they own.
//
// For each arrow:
//   - the highest bid wins
//   - tie-break: player with more Pieces wins; if still tied, fall back to
//     the player whose id sorts smaller (deterministic)
//   - winner pays their bid; losers' chips are refunded (sealed-bid in spec
//     reads as you only spend the winning bid; everyone else keeps theirs)

import type { ArrowOffer, AuctionResult } from './types.js';

export interface BidEntry {
  playerId: string;
  arrowId: string;
  chips: number;
}

export interface BidderContext {
  playerId: string;
  pieces: number;
}

export interface AuctionInput {
  offers: ArrowOffer[];
  bids: BidEntry[]; // flattened, may be empty for a player who didn't bid
  bidders: BidderContext[];
}

export interface AuctionOutput {
  results: AuctionResult[];
  // chipsSpent[playerId] = total chips deducted (only winning bids).
  chipsSpent: Map<string, number>;
  // arrowsWon[playerId] = list of arrow ids awarded.
  arrowsWon: Map<string, string[]>;
}

export function resolveAuction(input: AuctionInput): AuctionOutput {
  const { offers, bids, bidders } = input;
  const piecesByPlayer = new Map<string, number>();
  for (const b of bidders) piecesByPlayer.set(b.playerId, b.pieces);

  const results: AuctionResult[] = [];
  const chipsSpent = new Map<string, number>();
  const arrowsWon = new Map<string, string[]>();

  for (const offer of offers) {
    // gather all valid bids on this arrow (chips >= 1)
    const candidates = bids.filter((b) => b.arrowId === offer.id && b.chips >= 1);
    if (candidates.length === 0) {
      results.push({ arrowId: offer.id, winnerId: null, winningBid: 0 });
      continue;
    }
    candidates.sort((a, b) => {
      if (b.chips !== a.chips) return b.chips - a.chips;
      const ap = piecesByPlayer.get(a.playerId) ?? 0;
      const bp = piecesByPlayer.get(b.playerId) ?? 0;
      if (bp !== ap) return bp - ap;
      return a.playerId.localeCompare(b.playerId);
    });
    const winner = candidates[0];
    results.push({
      arrowId: offer.id,
      winnerId: winner.playerId,
      winningBid: winner.chips,
    });
    chipsSpent.set(
      winner.playerId,
      (chipsSpent.get(winner.playerId) ?? 0) + winner.chips,
    );
    const won = arrowsWon.get(winner.playerId) ?? [];
    won.push(offer.id);
    arrowsWon.set(winner.playerId, won);
  }

  return { results, chipsSpent, arrowsWon };
}

// helper used by the engine + CPU when offering a fresh batch of arrows.
// Roughly 11–13 arrows mixing length 1, 2, and 3 (more short than long).
export function generateAuctionOffers(round: number, idStart: number): ArrowOffer[] {
  // Deterministic by (round, idStart): three of length 1, three of length 2,
  // up to two of length 3, then pad with a few short arrows. Always >=11, <=13.
  const offers: ArrowOffer[] = [];
  const distribution: number[] = [
    1, 1, 1, 1, // four short
    2, 2, 2, 2, // four mid
    3, 3, // two long
    1, 2, 3, // bonus mix
  ];
  const count = 11 + (round % 3); // 11, 12, or 13
  for (let i = 0; i < count; i += 1) {
    const len = distribution[i % distribution.length];
    offers.push({
      id: `arr-r${round}-${idStart + i}`,
      length: len,
      offeredInRound: round,
    });
  }
  return offers;
}
