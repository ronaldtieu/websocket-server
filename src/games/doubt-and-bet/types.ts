// types for doubt-and-bet (Perudo / Liar's Dice variant with colored cards).
// the deck consists of cards with one of four colors (Yellow, Green, Blue, Red)
// plus a Rainbow wildcard that counts as the claimed color whenever a doubt
// resolves. each player begins with a fixed number of slots (cards) — slots
// are permanent capacity, cards are redealt each round.

export type DoubtColor = 'yellow' | 'green' | 'blue' | 'red';
export type CardColor = DoubtColor | 'rainbow';

// fixed escalation ranking. matching the spec: Yellow < Green < Blue < Red.
// rainbow is intentionally NOT a legal claim color — it's a wildcard only.
export const COLOR_RANK: Record<DoubtColor, number> = {
  yellow: 0,
  green: 1,
  blue: 2,
  red: 3,
};

export const ALL_COLORS: DoubtColor[] = ['yellow', 'green', 'blue', 'red'];

export type DoubtPhase =
  | 'waiting'
  | 'claiming' // active player makes opening claim
  | 'responding' // neighbor must raise or doubt
  | 'reveal' // doubt resolution: cards flipping
  | 'round-end' // brief pause showing the loser/result
  | 'buy-slot' // window for players to buy back a slot
  | 'finished';

export const PHASE_DURATIONS: Record<Exclude<DoubtPhase, 'waiting' | 'finished'>, number> = {
  claiming: 20_000,
  responding: 20_000,
  reveal: 4_000,
  'round-end': 4_000,
  'buy-slot': 8_000,
};

export interface Claim {
  playerId: string;
  n: number;
  color: DoubtColor;
}

export interface DoubtPlayerPublic {
  id: string;
  name: string;
  slots: number; // permanent slot capacity (starts at 5, drops on losses)
  pieces: number; // current piece total
  isEliminated: boolean;
  isConnected: boolean;
  // active during reveal: cards are revealed face-up to everyone.
  revealedCards: CardColor[] | null;
  // when not revealing, just expose the back count so the ring renders.
  cardCount: number;
}

export interface DoubtPublicState {
  phase: DoubtPhase;
  round: number;
  // 1-indexed seat index of the active player (the claimant). responder is
  // computed clockwise.
  activeSeat: number;
  // 1-indexed seat index of the responder when in 'responding' phase.
  responderSeat: number | null;
  phaseDeadline: number | null;
  // current claim chain (for context). null when in 'claiming' phase before
  // an opening claim has been made.
  currentClaim: Claim | null;
  // history of all claims made this round, in order. cleared at round start.
  claimHistory: Claim[];
  // ordered seating (player ids in clockwise seating). this rotates every
  // 10 rounds. 0-indexed in the array but seat numbers shown to UI are 1-based.
  seating: string[];
  // fields populated when a doubt resolves
  lastResolution: {
    doubterId: string;
    claimantId: string;
    claim: Claim;
    actualCount: number; // including rainbows
    claimWasTrue: boolean;
    loserId: string;
    pieceTransfer: number;
    eliminatedIds: string[];
  } | null;
  players: DoubtPlayerPublic[];
  attritionEvery: number; // = 5
  rotateEvery: number; // = 10
  totalEliminations: number;
}

export interface DoubtPlayerPrivate {
  cards: CardColor[]; // your own face-down cards (visible only to you)
  // whether you have already paid into the buy-slot window this round
  boughtSlotThisRound: boolean;
}

export interface DoubtStateForPlayer extends DoubtPublicState {
  me: {
    playerId: string;
    seat: number; // 1-based
    private: DoubtPlayerPrivate;
    // the seat number of your clockwise neighbor (the player you must respond to,
    // or who must respond to you). useful for the phone UI to highlight them.
    neighborSeat: number;
    neighborId: string | null;
  } | null;
}

export type DoubtAction =
  | { type: 'doubt/claim'; payload: { n: number; color: DoubtColor } }
  | { type: 'doubt/raise'; payload: { n: number; color: DoubtColor } }
  | { type: 'doubt/doubt'; payload: Record<string, never> }
  | { type: 'doubt/buy-slot'; payload: Record<string, never> };
