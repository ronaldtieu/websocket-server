// client-side mirror of the server's Balance Mancala state shape.
// kept in sync with src/games/balance-mancala/types.ts by hand for now.

export type DishColor = 'R' | 'B' | 'G' | 'W' | 'K';

export interface Stone {
  ownerId: string;
}

export interface Dish {
  index: number;
  color: DishColor;
  stones: Stone[];
}

export interface ColorTotals {
  R: number;
  B: number;
  G: number;
}

export interface MancalaPlayerPublic {
  id: string;
  name: string;
  isConnected: boolean;
  stonesToPlace: number;
  totals: ColorTotals;
  finalScore: number;
}

export type MancalaPhase = 'waiting' | 'placement' | 'playing' | 'finished';

export interface MancalaPublicState {
  phase: MancalaPhase;
  dishes: Dish[];
  players: MancalaPlayerPublic[];
  turnOrder: string[];
  currentPlayerId: string | null;
  phaseDeadline: number | null;
  winnerId: string | null;
  lastMove: {
    playerId: string;
    type: 'place-initial' | 'pick-dish';
    dishIndex: number;
    landedAt: number | null;
    scored: { color: DishColor; amount: number; ownerId: string } | null;
  } | null;
}

export interface MancalaStateForPlayer extends MancalaPublicState {
  me: { playerId: string } | null;
}

export const RING_SIZE = 14;
