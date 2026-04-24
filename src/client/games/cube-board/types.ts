// Client-side mirror of the server's cube-board state shape. Kept in sync
// with src/games/cube-board/types.ts by hand. Only public-facing fields
// are needed for rendering.

export type CubeColor = 'red' | 'yellow' | 'blue' | 'green' | 'purple' | 'white';
export type CubeFace = CubeColor | 'face';
export type Direction = 'N' | 'E' | 'S' | 'W';

export type SquareKind = 'color' | 'gray' | 'goal';

export interface SquareDef {
  index: number;
  x: number;
  y: number;
  kind: SquareKind;
  color: CubeColor | null;
}

export interface BoardDef {
  width: number;
  height: number;
  squares: SquareDef[];
  goalIndex: number;
  grayStartIndices: number[];
}

export type CubeBoardPhase = 'waiting' | 'practice' | 'real' | 'finished';

export type RuleId =
  | 'banishment-1'
  | 'banishment-2'
  | 'push-out'
  | 'color-match'
  | 'move-another'
  | 'bonus-turn';

export interface RuleReveal {
  ruleId: RuleId;
  revealedAtRound: number;
  triggeredBy: string;
}

export interface PlayerPublic {
  id: string;
  name: string;
  squareIndex: number;
  topColor: CubeFace;
  banishments: number;
  pieceDelta: number;
  isFinished: boolean;
  finishRank: number | null;
}

export interface CubeOrientation {
  top: CubeFace;
  bottom: CubeFace;
  north: CubeFace;
  south: CubeFace;
  east: CubeFace;
  west: CubeFace;
}

export interface PlayerPrivate {
  orientation: CubeOrientation;
  mustReorient: boolean;
  moveAnotherTargets: string[];
  bonusPending: boolean;
  notes: string;
}

export interface CubeBoardPublicState {
  phase: CubeBoardPhase;
  round: number;
  practiceRoundsRemaining: number;
  turnIndex: number;
  turnOrder: string[];
  board: BoardDef;
  players: PlayerPublic[];
  revealedRules: RuleReveal[];
  pendingReveal: RuleReveal | null;
  lastEvent: { kind: string; playerId: string; detail?: string } | null;
  finalRanking: { playerId: string; rank: number; squareIndex: number }[] | null;
  hiddenRulesActive: boolean;
}

export interface CubeBoardStateForPlayer extends CubeBoardPublicState {
  me: { playerId: string; private: PlayerPrivate } | null;
}

// CSS color values for each tile color, used by both the main screen and
// phone components.
export const COLOR_HEX: Record<CubeColor, string> = {
  red: '#ef4444',
  yellow: '#eab308',
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#a855f7',
  white: '#f4f4f5',
};

export function colorOf(face: CubeFace): string {
  if (face === 'face') return '#000';
  return COLOR_HEX[face];
}
