// client-side mirror of the server's time-auction state shape.
// kept in sync with src/games/time-auction/types.ts by hand.

export type TimeAuctionPhase =
  | 'waiting'
  | 'countdown'
  | 'bidding'
  | 'reveal'
  | 'finished';

export interface TimeAuctionPlayerPublic {
  id: string;
  name: string;
  isConnected: boolean;
  timeBankMs: number;
  tokens: number;
  isHolding: boolean;
  hasReleased: boolean;
  isTopTokens: boolean;
  isEliminated: boolean;
  pieceDelta: number;
}

export interface TimeAuctionRoundLogEntry {
  round: number;
  winnerId: string | null;
  winnerName: string | null;
  winningBidMs: number | null;
  awardedRandomly: boolean;
}

export interface TimeAuctionPublicState {
  phase: TimeAuctionPhase;
  round: number;
  totalRounds: number;
  phaseDeadline: number | null;
  biddingStartedAt: number | null;
  players: TimeAuctionPlayerPublic[];
  log: TimeAuctionRoundLogEntry[];
  lastReveal: TimeAuctionRoundLogEntry | null;
}

export interface TimeAuctionStateForPlayer extends TimeAuctionPublicState {
  me: {
    playerId: string;
    pressStartedAt: number | null;
    lockedBidMs: number | null;
  } | null;
}
