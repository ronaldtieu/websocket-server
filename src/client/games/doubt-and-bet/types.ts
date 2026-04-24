// client-side mirror of the server's doubt-and-bet state shape.
// kept in sync with src/games/doubt-and-bet/types.ts by hand for now.

export type DoubtColor = 'yellow' | 'green' | 'blue' | 'red';
export type CardColor = DoubtColor | 'rainbow';

export const ALL_COLORS: DoubtColor[] = ['yellow', 'green', 'blue', 'red'];

export const COLOR_RANK: Record<DoubtColor, number> = {
  yellow: 0,
  green: 1,
  blue: 2,
  red: 3,
};

export type DoubtPhase =
  | 'waiting'
  | 'claiming'
  | 'responding'
  | 'reveal'
  | 'round-end'
  | 'buy-slot'
  | 'finished';

export interface Claim {
  playerId: string;
  n: number;
  color: DoubtColor;
}

export interface DoubtPlayerPublic {
  id: string;
  name: string;
  slots: number;
  pieces: number;
  isEliminated: boolean;
  isConnected: boolean;
  revealedCards: CardColor[] | null;
  cardCount: number;
}

export interface DoubtPublicState {
  phase: DoubtPhase;
  round: number;
  activeSeat: number; // 1-based
  responderSeat: number | null; // 1-based
  phaseDeadline: number | null;
  currentClaim: Claim | null;
  claimHistory: Claim[];
  seating: string[];
  lastResolution: {
    doubterId: string;
    claimantId: string;
    claim: Claim;
    actualCount: number;
    claimWasTrue: boolean;
    loserId: string;
    pieceTransfer: number;
    eliminatedIds: string[];
  } | null;
  players: DoubtPlayerPublic[];
  attritionEvery: number;
  rotateEvery: number;
  totalEliminations: number;
}

export interface DoubtPlayerPrivate {
  cards: CardColor[];
  boughtSlotThisRound: boolean;
}

export interface DoubtStateForPlayer extends DoubtPublicState {
  me: {
    playerId: string;
    seat: number;
    private: DoubtPlayerPrivate;
    neighborSeat: number;
    neighborId: string | null;
  } | null;
}

// styling helper for color tokens
export const COLOR_HEX: Record<CardColor, string> = {
  yellow: '#facc15',
  green: '#4ade80',
  blue: '#60a5fa',
  red: '#f87171',
  rainbow: '#a78bfa',
};

export const COLOR_LABEL: Record<CardColor, string> = {
  yellow: 'YELLOW',
  green: 'GREEN',
  blue: 'BLUE',
  red: 'RED',
  rainbow: 'RAINBOW',
};

// pure helper duplicated from server claims.ts: enumerate all legal raises
// against `prev` capped by `maxN`. used by the phone UI to populate the
// number+color picker.
export function isLegalRaise(prev: Claim, next: { n: number; color: DoubtColor }): boolean {
  if (next.n < 1) return false;
  if (next.n > prev.n) return true;
  if (next.n === prev.n) return COLOR_RANK[next.color] > COLOR_RANK[prev.color];
  return false;
}
