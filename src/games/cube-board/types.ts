// Server-side types for "Unknown" (cube-board).
// The game id is `cube-board`; the user-facing title is "UNKNOWN".

export type CubeColor = 'red' | 'yellow' | 'blue' | 'green' | 'purple' | 'white';
export type SquareKind = 'color' | 'gray' | 'goal';

export type Direction = 'N' | 'E' | 'S' | 'W';

// Six cube faces, labelled by orientation (not by sticker).
export type FaceSlot = 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';

// Each face slot carries either one of the six colors OR the player's "face".
// The starting orientation places the player face on a randomly-chosen slot
// and distributes the six colors over the remaining slots; the cube is
// effectively a 6-sided die where one side is the player's face. Internally
// we pick which slot holds the face and which side gets which color.
export interface CubeOrientation {
  // exactly one of these will be 'face'; the other five are the six colors
  // minus one (we pick which color is dropped to make room for the face).
  top: CubeFace;
  bottom: CubeFace;
  north: CubeFace;
  south: CubeFace;
  east: CubeFace;
  west: CubeFace;
}

export type CubeFace = CubeColor | 'face';

export interface SquareDef {
  index: number; // printed number, 1..N (used for ranking)
  x: number;
  y: number;
  kind: SquareKind;
  color: CubeColor | null; // present when kind === 'color'
}

export interface BoardDef {
  width: number;
  height: number;
  squares: SquareDef[];
  goalIndex: number; // index in `squares`
  grayStartIndices: number[]; // indices into `squares`
}

export type CubeBoardPhase =
  | 'waiting'
  | 'practice' // first 3 rounds; rules silent
  | 'real' // rules revealed on first trigger
  | 'finished';

export type RuleId =
  | 'banishment-1'
  | 'banishment-2'
  | 'push-out'
  | 'color-match'
  | 'move-another'
  | 'bonus-turn';

export const ALL_RULE_IDS: RuleId[] = [
  'banishment-1',
  'banishment-2',
  'push-out',
  'color-match',
  'move-another',
  'bonus-turn',
];

export interface RuleReveal {
  ruleId: RuleId;
  revealedAtRound: number;
  triggeredBy: string; // playerId
}

export interface PlayerPublic {
  id: string;
  name: string;
  squareIndex: number; // current square index
  topColor: CubeFace; // public — the top is visible to everyone
  banishments: number;
  pieceDelta: number; // session ledger
  isFinished: boolean; // reached goal
  finishRank: number | null; // 1 = first to goal
}

export interface PlayerPrivate {
  // Full cube orientation — only visible to the owning player.
  orientation: CubeOrientation;
  // Whether the server has marked this player as needing to re-orient before
  // their next move (Color Match rule).
  mustReorient: boolean;
  // Whether this player currently has the option to move another player's
  // cube (Move-Another rule). populated when it's their turn.
  moveAnotherTargets: string[]; // candidate target playerIds
  // Bonus-turn flag: server keeps it; phone shows "you go again".
  bonusPending: boolean;
  // Freeform notes the player typed on their phone (kept server-side so
  // they survive reconnects within a single game).
  notes: string;
}

export interface CubeBoardPublicState {
  phase: CubeBoardPhase;
  round: number;
  practiceRoundsRemaining: number;
  turnIndex: number; // index into turnOrder
  turnOrder: string[]; // fixed at game start
  board: BoardDef;
  players: PlayerPublic[];
  revealedRules: RuleReveal[];
  // a short banner that fades in when a rule first triggers
  pendingReveal: RuleReveal | null;
  // last action log entry, for main-screen flavor
  lastEvent: { kind: string; playerId: string; detail?: string } | null;
  finalRanking: { playerId: string; rank: number; squareIndex: number }[] | null;
  hiddenRulesActive: boolean; // false during practice (still enforced!)
}

export interface CubeBoardStateForPlayer extends CubeBoardPublicState {
  me: {
    playerId: string;
    private: PlayerPrivate;
  } | null;
}

// Action payloads
export type CubeBoardAction =
  | { type: 'unknown/move'; payload: { direction: Direction } }
  | {
      type: 'unknown/move-other';
      payload: { targetPlayerId: string; direction: Direction };
    }
  | { type: 'unknown/reorient'; payload: { topColor: CubeColor } }
  | { type: 'unknown/notes'; payload: { text: string } };
