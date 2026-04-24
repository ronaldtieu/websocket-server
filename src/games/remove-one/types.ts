// types for remove one

export type Card = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type RemoveOnePhase =
  | 'waiting'
  | 'selecting'
  | 'peek-reveal'
  | 'choosing'
  | 'play-reveal'
  | 'scoring'
  | 'checkpoint'
  | 'finished';

// phase durations in ms. short for testing; spec values in parens.
export const PHASE_DURATIONS: Record<Exclude<RemoveOnePhase, 'waiting' | 'finished'>, number> = {
  selecting: 20_000, // spec: 30_000
  'peek-reveal': 3_000, // spec: 5_000
  choosing: 10_000, // spec: 15_000
  'play-reveal': 3_000,
  scoring: 3_000,
  checkpoint: 5_000,
};

export interface PlayerPublic {
  id: string;
  name: string;
  handSize: number;
  score: number;
  victoryTokens: number;
  isSafe: boolean; // left the danger bracket at an earlier checkpoint
  isEliminated: boolean;
  // populated during peek/play phases
  peekCards: [Card, Card] | null;
  playedCard: Card | null;
  hasSubmittedSelection: boolean;
  hasSubmittedChoice: boolean;
}

export interface PlayerPrivate {
  hand: Card[]; // cards still available
  lockedNextRound: Card | null; // carryover lockout
  selection: [Card, Card] | null; // pair picked in Selection
  chosen: Card | null; // final play
}

export interface RemoveOnePublicState {
  phase: RemoveOnePhase;
  round: number;
  totalRounds: number; // 3 in test mode, 18 in full
  phaseDeadline: number | null; // ms epoch, or null when manually paused
  players: PlayerPublic[];
  // fires on round transitions. seeded from the last scored round.
  lastScoring: {
    roundWinner: string | null; // player id who scored
    cardValue: number | null;
    clashed: Card[]; // cards that clashed (useful for reveal UI)
  } | null;
  checkpointRounds: number[]; // e.g. [3, 6, 9, 12, 18] or [3] in test mode
}

export interface RemoveOneStateForPlayer extends RemoveOnePublicState {
  me: {
    playerId: string;
    private: PlayerPrivate;
  } | null;
}

export type RemoveOneAction =
  | { type: 'remove-one/select-pair'; payload: { a: Card; b: Card } }
  | { type: 'remove-one/choose-play'; payload: { card: Card } };
