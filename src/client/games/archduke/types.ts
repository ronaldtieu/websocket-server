// client-side mirror of archduke's state shape.
// kept in sync with src/games/archduke/src/types.ts by hand for now.

export type Suit = 'red' | 'blue' | 'green' | 'yellow';
export type FaceAction = 'peek' | 'give' | 'swap';

export type CardKind =
  | { kind: 'number'; value: number; suit: Suit }
  | { kind: 'face'; action: FaceAction; suit: Suit }
  | { kind: 'eclipse'; value: 0 | 13 }
  | { kind: 'archduke' };

export interface Card {
  id: number;
  kind: CardKind;
}

export type SlotId = 0 | 1 | 2 | 3;

export type ArchdukePhase =
  | 'waiting'
  | 'initial-peek'
  | 'turn-draw'
  | 'turn-decide'
  | 'resolving-action'
  | 'round-end'
  | 'scoring-break'
  | 'finished';

export interface ArchdukePlayerPublic {
  id: string;
  name: string;
  slots: { id: number; empty: boolean }[];
  roundScore: number | null;
  totalScore: number;
  isEliminated: boolean;
  lastRevealedSlot: number | null;
}

export interface ArchdukeTurnInfo {
  activePlayerId: string;
  drawnCardPublic: null | { visible: boolean; card: Card | null };
  pendingAction: FaceAction | null;
}

export interface ArchdukeRoundSummary {
  round: number;
  revealed: {
    playerId: string;
    cards: (Card | null)[];
    roundScore: number;
  }[];
}

export interface ArchdukePublicState {
  phase: ArchdukePhase;
  round: number;
  totalRounds: number;
  phaseDeadline: number | null;
  turnsTakenThisRound: number;
  turnsPerRound: number;
  deckRemaining: number;
  discardTop: Card | null;
  players: ArchdukePlayerPublic[];
  turn: ArchdukeTurnInfo | null;
  lastRoundSummary: ArchdukeRoundSummary | null;
  winnerId: string | null;
}

export interface ArchdukeStateForPlayer extends ArchdukePublicState {
  me: {
    playerId: string;
    knownSlots: (Card | null)[];
    myDrawnCard: Card | null;
    peekedForeignCard: null | {
      targetPlayerId: string;
      slot: number;
      card: Card;
    };
  } | null;
}

// utility: a human-friendly short label for a card face (e.g. "7", "A", "PK", "EC").
export function cardLabel(card: Card): string {
  switch (card.kind.kind) {
    case 'number':
      return String(card.kind.value);
    case 'face':
      return card.kind.action === 'peek'
        ? 'PK'
        : card.kind.action === 'give'
          ? 'GV'
          : 'SW';
    case 'eclipse':
      return card.kind.value === 0 ? 'E0' : 'E13';
    case 'archduke':
      return 'AD';
  }
}

export function cardValue(card: Card): number {
  switch (card.kind.kind) {
    case 'number':
      return card.kind.value;
    case 'face':
      return 0;
    case 'eclipse':
      return card.kind.value;
    case 'archduke':
      return -3;
  }
}

export function cardTint(card: Card): string {
  if (card.kind.kind === 'archduke') return 'border-purple-400 bg-purple-500/10 text-purple-200';
  if (card.kind.kind === 'eclipse') return 'border-yellow-400 bg-yellow-500/10 text-yellow-200';
  if (card.kind.kind === 'face') return 'border-cyan-400 bg-cyan-500/10 text-cyan-200';
  return 'border-white/10 bg-zinc-900 text-white';
}
