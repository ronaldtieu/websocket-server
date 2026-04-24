// Balance Mancala — type definitions for the ring of 14 dishes,
// per-player score buckets, and the wire-level state shapes.

// the three scoring colors plus the two special dishes
export type DishColor = 'R' | 'B' | 'G' | 'W' | 'K';

// a single stone sitting in a dish, tagged with its owner so the engine
// can credit scoring to the right player when the last-placed stone lands.
export interface Stone {
  ownerId: string;
}

export interface Dish {
  index: number;
  color: DishColor;
  stones: Stone[];
}

// per-player breakdown of the three scoring colors. `final` is the
// derived `min(R,B,G) − (max(R,B,G) − min(R,B,G))` formula, recomputed
// after every score update.
export interface ColorTotals {
  R: number;
  B: number;
  G: number;
}

export interface MancalaPlayerPublic {
  id: string;
  name: string;
  isConnected: boolean;
  stonesToPlace: number; // remaining unplaced stones (placement phase)
  totals: ColorTotals;
  finalScore: number;
}

export type MancalaPhase = 'waiting' | 'placement' | 'playing' | 'finished';

export interface MancalaPublicState {
  phase: MancalaPhase;
  dishes: Dish[]; // length 14
  players: MancalaPlayerPublic[];
  turnOrder: string[]; // ordered player ids
  currentPlayerId: string | null;
  phaseDeadline: number | null; // ms epoch for the current turn timer
  winnerId: string | null; // set when game ends
  // tag of the most recent move so the UI can highlight what happened.
  // populated after a successful place-initial or pick-dish action.
  lastMove: {
    playerId: string;
    type: 'place-initial' | 'pick-dish';
    dishIndex: number;
    landedAt: number | null; // final dish index for sowing moves
    scored: { color: DishColor; amount: number; ownerId: string } | null;
  } | null;
}

export interface MancalaStateForPlayer extends MancalaPublicState {
  // game is perfect info; this just tags which player is "me" for the phone UI.
  me: { playerId: string } | null;
}

export type MancalaAction =
  | { type: 'mancala/place-initial'; payload: { dishIndex: number } }
  | { type: 'mancala/pick-dish'; payload: { dishIndex: number } };

// fixed dish layout — interleaved RBG with W and K wedged in. exact
// position of the special dishes is arbitrary but has to be stable for
// CPU minimax to be deterministic across calls.
export const DISH_LAYOUT: DishColor[] = [
  'R', 'B', 'G', // 0-2
  'R', 'B', 'G', // 3-5
  'W',           // 6 (Angel)
  'R', 'B', 'G', // 7-9
  'R', 'B', 'G', // 10-12
  'K',           // 13 (Devil)
];

export const RING_SIZE = DISH_LAYOUT.length; // 14
export const STONES_PER_PLAYER = 4;
export const SCORE_END_THRESHOLD = 30;
export const TURN_DURATION_MS = 60_000;
