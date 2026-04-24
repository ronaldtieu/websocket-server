// Types for Crooked Cops — social-deduction subway-graph game.
// Roles, phases, action payloads. Mirrors src/client/games/crooked-cops/types.ts
// (kept in sync by hand — copy any shape changes there).

export type TeamColor = 'red' | 'blue' | 'green';

export type Role = 'thief' | 'cop' | 'crooked-cop';

export type CrookedCopsPhase =
  | 'waiting'
  | 'thief-phase'
  | 'police-phase'
  | 'arrest-resolution'
  | 'checkpoint'
  | 'whistleblower-vote'
  | 'finished';

// Phase durations in ms. Spec values commented; we use short defaults so
// playtesting is bearable and CPUs/timeouts move things along.
export const PHASE_DURATIONS: Record<
  Exclude<CrookedCopsPhase, 'waiting' | 'finished'>,
  number
> = {
  'thief-phase': 30_000, // spec: 180_000
  'police-phase': 45_000, // spec: 300_000
  'arrest-resolution': 5_000,
  checkpoint: 6_000,
  'whistleblower-vote': 30_000,
};

export const MAX_ROUNDS = 15;
export const CHECKPOINT_ROUNDS = [5, 10];
export const PIECES_TO_WIN = 12;
export const THIEF_MAX_STEPS = 2;
export const COP_MAX_STEPS = 1;

// Subway-graph node id — string for readability in payloads.
export type NodeId = string;

export interface SubwayGraph {
  nodes: NodeId[];
  edges: Array<[NodeId, NodeId]>;
  // adjacency list, derived from edges. Always symmetric (undirected).
  adjacency: Record<NodeId, NodeId[]>;
  // initial piece-bearing nodes.
  pieceNodes: NodeId[];
  // suggested visual layout (0..1 unit square) — purely for the main screen.
  layout: Record<NodeId, { x: number; y: number }>;
}

export interface RadioMessage {
  team: TeamColor;
  from: string; // playerId
  fromName: string;
  text: string;
  ts: number;
}

// Per-cop investigation result, surfaced privately on their next state pull.
export interface InvestigationResult {
  round: number;
  node: NodeId;
  thiefPassed: boolean;
}

// Public per-player view (everyone sees this row for every player).
export interface PlayerPublic {
  id: string;
  name: string;
  isConnected: boolean;
  // Role is public ONLY for thieves (per spec: "public identities — everyone
  // knows who they are"). For cops the role appears as 'cop' regardless of
  // whether they're crooked.
  publicRole: 'thief' | 'cop' | 'spectator';
  team: TeamColor | null;
  // Current node — police positions are always public, thief positions are
  // hidden from ordinary cops (filtered out in getStateForPlayer).
  node: NodeId | null;
  // Whether this thief is currently arrested-out (sits a round).
  arrestedThisRound?: boolean;
  // Whether the player has submitted their move/action this phase.
  hasActedThisPhase: boolean;
}

export type WinnerKind = 'thieves' | 'police' | 'timeout-thieves' | 'timeout-police';

export interface VoteResult {
  team: TeamColor;
  suspectId: string | null;
  suspectName: string | null;
  tally: Array<{ playerId: string; playerName: string; votes: number }>;
  caughtCrookedCop: boolean;
}

export interface GameOutcome {
  winner: WinnerKind;
  piecesCollected: number;
  voteResults: VoteResult[];
}

export interface PublicState {
  phase: CrookedCopsPhase;
  round: number;
  totalRounds: number;
  phaseDeadline: number | null;
  graph: SubwayGraph;
  players: PlayerPublic[];
  // Piece-collection counter is hidden between checkpoints; null when hidden,
  // a number when revealed at checkpoints / endgame.
  publicPieceCount: number | null;
  // Latest arrest event (for the banner). Cleared when the next round begins.
  lastArrest: {
    by: string; // copId
    byName: string;
    targetNode: NodeId;
    success: boolean; // false when crooked cop nullified, or invalid arrest
    nullifiedByCrookedCop: boolean;
    arrestedThiefId: string | null;
  } | null;
  // Team radio. Visible only to teammates — filtered in getStateForPlayer.
  // Empty in the public broadcast (main screen sees nothing).
  radio: RadioMessage[];
  // Final-game outcome (filled at 'finished').
  outcome: GameOutcome | null;
  // Pieces awarded at end of game (per the spec's reward table). Empty
  // before 'finished'.
  pieceAwards: Array<{ playerId: string; amount: number }>;
}

export interface PrivateView {
  playerId: string;
  role: Role;
  team: TeamColor | null;
  // Thieves see all piece locations, partner thief, etc.
  // Crooked cops also see piece locations and the other crooked cop.
  // Ordinary cops see none of this.
  visiblePieceNodes: NodeId[] | null;
  partnerId: string | null; // thief partner, or other crooked cop
  partnerName: string | null;
  partnerNode: NodeId | null;
  // Crooked-cop private channel — system pings whenever a thief moves.
  privatePings: Array<{ round: number; text: string; ts: number }>;
  // Latest investigation result for this cop (resets at the start of each round).
  lastInvestigation: InvestigationResult | null;
  // Whether this player has already voted in the whistleblower phase.
  hasVoted: boolean;
}

export interface CrookedCopsStateForPlayer extends PublicState {
  me: PrivateView | null;
}

export type CrookedCopsAction =
  | { type: 'crooked-cops/move'; payload: { toNode: NodeId } }
  | { type: 'crooked-cops/investigate'; payload: { node: NodeId } }
  | { type: 'crooked-cops/arrest'; payload: { targetNode: NodeId } }
  | { type: 'crooked-cops/radio'; payload: { team: TeamColor; text: string } }
  | { type: 'crooked-cops/vote'; payload: { suspectId: string } };
