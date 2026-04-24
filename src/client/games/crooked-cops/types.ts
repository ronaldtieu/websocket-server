// Client-side mirror of src/games/crooked-cops/types.ts. Kept in sync by hand.

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

export type NodeId = string;

export interface SubwayGraph {
  nodes: NodeId[];
  edges: Array<[NodeId, NodeId]>;
  adjacency: Record<NodeId, NodeId[]>;
  pieceNodes: NodeId[];
  layout: Record<NodeId, { x: number; y: number }>;
}

export interface RadioMessage {
  team: TeamColor;
  from: string;
  fromName: string;
  text: string;
  ts: number;
}

export interface InvestigationResult {
  round: number;
  node: NodeId;
  thiefPassed: boolean;
}

export interface PlayerPublic {
  id: string;
  name: string;
  isConnected: boolean;
  publicRole: 'thief' | 'cop' | 'spectator';
  team: TeamColor | null;
  node: NodeId | null;
  arrestedThisRound?: boolean;
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

export interface CrookedCopsPublicState {
  phase: CrookedCopsPhase;
  round: number;
  totalRounds: number;
  phaseDeadline: number | null;
  graph: SubwayGraph;
  players: PlayerPublic[];
  publicPieceCount: number | null;
  lastArrest: {
    by: string;
    byName: string;
    targetNode: NodeId;
    success: boolean;
    nullifiedByCrookedCop: boolean;
    arrestedThiefId: string | null;
  } | null;
  radio: RadioMessage[];
  outcome: GameOutcome | null;
  pieceAwards: Array<{ playerId: string; amount: number }>;
}

export interface PrivateView {
  playerId: string;
  role: Role;
  team: TeamColor | null;
  visiblePieceNodes: NodeId[] | null;
  partnerId: string | null;
  partnerName: string | null;
  partnerNode: NodeId | null;
  privatePings: Array<{ round: number; text: string; ts: number }>;
  lastInvestigation: InvestigationResult | null;
  hasVoted: boolean;
}

export interface CrookedCopsStateForPlayer extends CrookedCopsPublicState {
  me: PrivateView | null;
}
