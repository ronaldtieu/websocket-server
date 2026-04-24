// archduke specific types and interfaces
// defines the data structures used throughout the game.
//
// this is a first-playable interpretation of ryan tibbitts' archduke.
// the design docs in ../design/ are intentionally sparse, so we lean on
// what cards.md describes and fill the rest in with conservative rules
// that keep the game turn-based and legible over a websocket.

export type Suit = 'red' | 'blue' | 'green' | 'yellow';

// face-card action types (cards.md: PEEK / GIVE / SWAP)
export type FaceAction = 'peek' | 'give' | 'swap';

export type CardKind =
  | { kind: 'number'; value: number; suit: Suit }
  | { kind: 'face'; action: FaceAction; suit: Suit }
  | { kind: 'eclipse'; value: 0 | 13 } // same "symbol" — match by kind, not suit
  | { kind: 'archduke' }; // sole -3 card

export interface Card {
  id: number; // stable id within the deck for reveal tracking
  kind: CardKind;
}

export type SlotId = 0 | 1 | 2 | 3;

export type SlotState =
  | { kind: 'card'; card: Card }
  | { kind: 'empty' }; // created by a match

export type ArchdukePhase =
  | 'waiting'
  | 'initial-peek' // each player peeks their 2 bottom cards
  | 'turn-draw' // active player must draw from pile
  | 'turn-decide' // drew a card; choose swap/discard/match
  | 'resolving-action' // a face-card action requires a target
  | 'round-end' // round over; show set reveal + score
  | 'scoring-break' // brief pause before next round
  | 'finished';

// durations in ms. intentionally short for first-playable.
export const PHASE_DURATIONS: Record<
  Exclude<ArchdukePhase, 'waiting' | 'finished'>,
  number
> = {
  'initial-peek': 8_000,
  'turn-draw': 12_000,
  'turn-decide': 15_000,
  'resolving-action': 12_000,
  'round-end': 6_000,
  'scoring-break': 5_000,
};

// ---- state shapes broadcast to clients ----

export interface ArchdukePlayerPublic {
  id: string;
  name: string;
  // slot occupancy only — actual card identities are hidden unless revealed at round end.
  // slot count can exceed 4 when GIVE hands out a penalty and no empty slot exists.
  slots: { id: number; empty: boolean }[];
  roundScore: number | null; // null until round ends
  totalScore: number;
  isEliminated: boolean;
  // if this player just revealed a card via PEEK/round-end, pin it here briefly.
  // numeric because slot ids are not bounded once GIVE extends the set.
  lastRevealedSlot: number | null;
}

export interface ArchdukeTurnInfo {
  activePlayerId: string;
  // when in turn-decide, this is what the active player just drew.
  // hidden from everyone except the active player.
  drawnCardPublic: null | {
    // public-facing: only reveals the CATEGORY of the card, not its identity,
    // unless the phase already shows it (e.g., mid-resolution)
    visible: boolean;
    card: Card | null;
  };
  // when a face-card action is resolving, what kind
  pendingAction: FaceAction | null;
}

export interface ArchdukeRoundSummary {
  round: number;
  // per-player score reveal for the finished round
  revealed: {
    playerId: string;
    cards: (Card | null)[]; // null for empty slots
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
  discardTop: Card | null; // only top card shown
  players: ArchdukePlayerPublic[];
  turn: ArchdukeTurnInfo | null;
  lastRoundSummary: ArchdukeRoundSummary | null;
  winnerId: string | null; // set when phase === 'finished'
}

export interface ArchdukeStateForPlayer extends ArchdukePublicState {
  me: {
    playerId: string;
    // what i privately know about my own set.
    // slots i've peeked recently get filled in; cards i've never peeked stay null.
    knownSlots: (Card | null)[];
    // when it's my turn to decide, the drawn card's identity
    myDrawnCard: Card | null;
    // if i just peeked another player's card via PEEK, surface it for rendering.
    // slot is numeric because GIVE may extend a player's set beyond 4.
    peekedForeignCard: null | {
      targetPlayerId: string;
      slot: number;
      card: Card;
    };
  } | null;
}

// ---- action payloads ----

export type ArchdukeAction =
  // setup
  | { type: 'archduke/ack-peek'; payload: Record<string, never> }
  // main turn
  | { type: 'archduke/draw'; payload: Record<string, never> }
  | {
      type: 'archduke/decide';
      payload:
        | { decision: 'swap'; slot: SlotId }
        | { decision: 'discard' }
        | { decision: 'match'; slot: SlotId };
    }
  // face-card resolution
  | {
      type: 'archduke/resolve-action';
      payload:
        | { action: 'peek'; targetPlayerId: string; slot: SlotId }
        | { action: 'give'; targetPlayerId: string }
        | { action: 'swap'; aPlayerId: string; aSlot: SlotId; bPlayerId: string; bSlot: SlotId };
    }
  // pass on an action (e.g., no valid target)
  | { type: 'archduke/skip-action'; payload: Record<string, never> };
