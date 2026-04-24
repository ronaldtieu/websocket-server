// types for time auction.
// per-spec (GAMES_SPEC.md §3.2): hidden sealed-bid auction over 19 rounds.
// each player has a 600s Time Bank; bids are measured server-side from the
// gap between `time-auction/press` and `time-auction/release` events. losing
// bids are NEVER revealed.

export type TimeAuctionPhase =
  | 'waiting'
  | 'countdown' // 5-second "get ready" before bidding opens
  | 'bidding' // hold-to-bid window
  | 'reveal' // winner announcement
  | 'finished';

export const TIME_BANK_MS = 600_000; // 10 minutes
export const TOTAL_ROUNDS = 19;
export const COUNTDOWN_MS = 5_000;
export const REVEAL_MS = 4_000;
// hard cap on a single bidding window. without this, a held button could
// drain the entire 10-minute bank into one round and the round timer would
// be useless. 60s matches the spec's intent that rounds feel paced.
export const MAX_ROUND_MS = 60_000;

export interface TimeAuctionPlayerPublic {
  id: string;
  name: string;
  isConnected: boolean;
  // remaining time bank in ms (server-authoritative).
  timeBankMs: number;
  // tokens won so far.
  tokens: number;
  // true while the player is actively holding the bid button this round.
  // safe to expose: just a binary "still in" indicator, not the bid value.
  isHolding: boolean;
  // true once the player has released this round (locked in).
  hasReleased: boolean;
  // session-level outcome flags, only meaningful at finished phase.
  isTopTokens: boolean;
  isEliminated: boolean;
  pieceDelta: number;
}

export interface TimeAuctionRoundLogEntry {
  round: number;
  winnerId: string | null;
  winnerName: string | null;
  // winning bid in ms — public per spec.
  winningBidMs: number | null;
  // true if no one pressed at all this round (random award).
  awardedRandomly: boolean;
}

export interface TimeAuctionPublicState {
  phase: TimeAuctionPhase;
  round: number; // 1..TOTAL_ROUNDS, or 0 before start
  totalRounds: number;
  // ms-epoch deadline for the current phase, or null when paused/idle.
  // for the bidding phase this is set to MAX_ROUND_MS from the start so
  // clients can render a visible cap; the round is allowed to end early.
  phaseDeadline: number | null;
  // ms-epoch when the current bidding window opened. clients can use it
  // to render a count-up "round clock" without trusting any local timer.
  // null outside bidding phase.
  biddingStartedAt: number | null;
  players: TimeAuctionPlayerPublic[];
  // log of completed rounds (winner + winning bid only, never losing bids).
  log: TimeAuctionRoundLogEntry[];
  // current round's winner reveal (only populated during 'reveal' phase).
  // mirrors the latest log entry; convenient for the main-screen banner.
  lastReveal: TimeAuctionRoundLogEntry | null;
}

// per-player view layered on top of public state. only "me" carries any
// private-ish info; even then it's only my own bid for the current round
// (I'm allowed to know what I bid; nobody else is).
export interface TimeAuctionStateForPlayer extends TimeAuctionPublicState {
  me: {
    playerId: string;
    // ms my own button is currently registered as pressed; null if not
    // currently holding. computed from server-side press timestamp so the
    // client doesn't need to keep its own clock in sync.
    pressStartedAt: number | null;
    // bid I locked in this round, or null if I haven't released yet (or
    // never pressed). cleared at the start of each new round.
    lockedBidMs: number | null;
  } | null;
}

export type TimeAuctionAction =
  | { type: 'time-auction/press'; payload: Record<string, never> }
  | { type: 'time-auction/release'; payload: Record<string, never> };
