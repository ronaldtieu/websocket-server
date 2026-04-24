// Treasure Island — types shared between server, client, and CPU.
//
// The board is a flat 9x9 grid (we render the spec's "3D-aware" layout as a
// top-down 2D map with fence icons). Cells are land or water; some cell-edges
// have fences. A handful of fixed red-dot anchors and 10 boxes sit on land.
//
// Two rule families gate path placement:
//   - public rule: every arrow must start AND end on a red dot.
//   - hidden rule: arrows may also be placed diagonally and over fences.
// The hidden rule is "discovered" once any player attempts a diagonal/fence-
// crossing path. After discovery, all players may use diagonal/3D placements
// freely, and the public rule log on the main screen mentions the new mode.

export const BOARD_SIZE = 9;
export const TOTAL_ROUNDS = 9;
export const STARTING_CHIPS = 20;
export const STARTING_ARROWS = 1;
export const STARTING_PIECES = 5;
export const PEEK_PIECE_COST = 1;
export const TREASURE_STEAL_TOTAL = 4;

export type CellTerrain = 'land' | 'water';

export interface CellDef {
  x: number;
  y: number;
  terrain: CellTerrain;
}

// A fence sits between two adjacent cells. Stored as {a,b} where both are
// cell indices y*BOARD_SIZE+x, sorted ascending so the lookup key is unique.
export interface FenceDef {
  a: number;
  b: number;
}

export interface RedDotDef {
  id: string;
  x: number;
  y: number;
}

export interface BoxDef {
  id: string;
  x: number;
  y: number;
  isTreasure: boolean;
  vp: number;
}

export interface BoardLayout {
  size: number;
  cells: CellDef[];
  fences: FenceDef[];
  redDots: RedDotDef[];
  boxes: BoxDef[];
}

// arrow length is in chebyshev steps (max of |dx|,|dy|). a length-1 arrow
// reaches an orthogonally or diagonally adjacent square. lengths 1..3 cover
// every red-dot pair on our 9x9 board.
export interface ArrowDef {
  id: string;
  length: number;
}

export interface ArrowOffer extends ArrowDef {
  // fresh per auction round — the id is unique across the whole game.
  offeredInRound: number;
}

export type TreasureIslandPhase =
  | 'waiting'
  | 'auction'
  | 'auction-reveal'
  | 'exploration'
  | 'exploration-reveal'
  | 'finished';

export const PHASE_DURATIONS: Record<
  Exclude<TreasureIslandPhase, 'waiting' | 'finished'>,
  number
> = {
  auction: 25_000,
  'auction-reveal': 5_000,
  exploration: 30_000,
  'exploration-reveal': 6_000,
};

export const AUCTION_ROUNDS = [1, 2, 3, 5, 7] as const;
export const EXPLORATION_ROUNDS = [4, 6, 8, 9] as const;

export interface PlayerPublic {
  id: string;
  name: string;
  isConnected: boolean;
  vp: number;
  pieces: number;
  arrowCount: number;
  chipCount: number;
  hasSubmitted: boolean;
}

// path placed during exploration. from/to are cell indices.
export interface PlacedArrow {
  arrowId: string;
  fromIdx: number;
  toIdx: number;
  diagonal: boolean;
  crossesFence: boolean;
}

export interface PlayerPath {
  playerId: string;
  arrows: PlacedArrow[];
}

export interface OpenedBox {
  boxId: string;
  openerId: string;
  vp: number;
  isTreasure: boolean;
  // hint shown publicly: just "opened"; private hint goes to opener only.
}

export interface AuctionResult {
  arrowId: string;
  winnerId: string | null;
  winningBid: number;
}

export interface TreasureIslandPublicState {
  phase: TreasureIslandPhase;
  round: number;
  totalRounds: number;
  phaseDeadline: number | null;
  board: BoardLayout;
  players: PlayerPublic[];
  // arrows currently on offer this auction round (or null in non-auction phases).
  auctionOffers: ArrowOffer[] | null;
  // resolution of the latest auction; surfaced in 'auction-reveal'.
  lastAuctionResults: AuctionResult[] | null;
  // every path placed this exploration round, by player id, surfaced in
  // 'exploration' (after a player commits) and 'exploration-reveal'.
  explorationPaths: PlayerPath[];
  openedBoxes: OpenedBox[];
  // public rule log — entries appended as rules are revealed.
  ruleLog: string[];
  hiddenRuleDiscovered: boolean;
  treasureFinderId: string | null;
  // populated once treasure is found; players choose how to allocate steals
  // through the treasure/steal action. null until the steal action lands.
  treasureSteals: { fromPlayerId: string; amount: number }[] | null;
}

// per-player private slice — hidden bids, hints, and the player's arrow ids.
export interface PlayerPrivate {
  arrowIds: string[];
  // current bid this auction (locked at submit time; cleared between rounds)
  currentBid: { arrowId: string; chips: number }[] | null;
  // accumulating hints the player has earned by opening boxes
  hints: string[];
}

export interface TreasureIslandStateForPlayer extends TreasureIslandPublicState {
  me: { playerId: string; private: PlayerPrivate } | null;
}

export type TreasureIslandAction =
  | {
      type: 'treasure/bid';
      payload: { allocations: { arrowId: string; chips: number }[] };
    }
  | {
      type: 'treasure/place-path';
      payload: {
        arrows: { arrowId: string; fromIdx: number; toIdx: number }[];
      };
    }
  | { type: 'treasure/peek'; payload: { boxId: string } }
  | {
      type: 'treasure/steal';
      payload: { allocations: { fromPlayerId: string; amount: number }[] };
    };
