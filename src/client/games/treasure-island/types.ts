// Client-side mirror of the server's Treasure Island state shape.
// Kept in sync with src/games/treasure-island/types.ts by hand for now.

export type TreasureIslandPhase =
  | 'waiting'
  | 'auction'
  | 'auction-reveal'
  | 'exploration'
  | 'exploration-reveal'
  | 'finished';

export interface CellDef {
  x: number;
  y: number;
  terrain: 'land' | 'water';
}

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

export interface ArrowOffer {
  id: string;
  length: number;
  offeredInRound: number;
}

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
}

export interface AuctionResult {
  arrowId: string;
  winnerId: string | null;
  winningBid: number;
}

export interface PlayerPrivate {
  arrowIds: string[];
  currentBid: { arrowId: string; chips: number }[] | null;
  hints: string[];
}

export interface TreasureIslandPublicState {
  phase: TreasureIslandPhase;
  round: number;
  totalRounds: number;
  phaseDeadline: number | null;
  board: BoardLayout;
  players: PlayerPublic[];
  auctionOffers: ArrowOffer[] | null;
  lastAuctionResults: AuctionResult[] | null;
  explorationPaths: PlayerPath[];
  openedBoxes: OpenedBox[];
  ruleLog: string[];
  hiddenRuleDiscovered: boolean;
  treasureFinderId: string | null;
  treasureSteals: { fromPlayerId: string; amount: number }[] | null;
}

export interface TreasureIslandStateForPlayer extends TreasureIslandPublicState {
  me: { playerId: string; private: PlayerPrivate } | null;
}
