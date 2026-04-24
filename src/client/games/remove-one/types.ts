// client-side mirror of the server's remove-one state shape.
// kept in sync with src/games/remove-one/types.ts by hand for now —
// when a game is added, copy its public/for-player shape here.

export type Card = number;

export type RemoveOnePhase =
  | 'waiting'
  | 'selecting'
  | 'peek-reveal'
  | 'choosing'
  | 'play-reveal'
  | 'scoring'
  | 'checkpoint'
  | 'finished';

export interface RemoveOnePlayerPublic {
  id: string;
  name: string;
  handSize: number;
  score: number;
  victoryTokens: number;
  isSafe: boolean;
  isEliminated: boolean;
  peekCards: [Card, Card] | null;
  playedCard: Card | null;
  hasSubmittedSelection: boolean;
  hasSubmittedChoice: boolean;
}

export interface RemoveOnePublicState {
  phase: RemoveOnePhase;
  round: number;
  totalRounds: number;
  phaseDeadline: number | null;
  players: RemoveOnePlayerPublic[];
  lastScoring: {
    roundWinner: string | null;
    cardValue: number | null;
    clashed: Card[];
  } | null;
  checkpointRounds: number[];
}

export interface RemoveOnePrivate {
  hand: Card[];
  lockedNextRound: Card | null;
  selection: [Card, Card] | null;
  chosen: Card | null;
}

export interface RemoveOneStateForPlayer extends RemoveOnePublicState {
  me: { playerId: string; private: RemoveOnePrivate } | null;
}
