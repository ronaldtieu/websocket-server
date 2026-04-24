// deck construction for archduke.
// design/cards.md describes the card mix in broad strokes — numbers -3..13,
// face cards for actions, archduke (-3), eclipse (0 or 13). we pick a
// concrete composition below to keep the first-playable balanced.

import type { Card, FaceAction, Suit } from './types.js';

const SUITS: Suit[] = ['red', 'blue', 'green', 'yellow'];
const FACE_ACTIONS: FaceAction[] = ['peek', 'give', 'swap'];

// simple mulberry32 so games can be deterministic in tests if we pass a seed later
function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// deck composition (~60 cards, generous for 2-6 players x 4 slots + draw buffer):
//   number cards 1..13 in 4 suits (52), MINUS the archduke slot (-3) which we add separately
//   number card values: 1,2,3,4,5,6,7,8,9,10,11,12,13 across 4 suits → 52
//   face cards: 3 actions x 4 suits = 12
//   eclipse: 2 x 0, 2 x 13 (same "symbol" — we match by kind)
//   archduke: 1 at -3
//
// matching:
//  - number cards: same value
//  - face cards: same suit
//  - eclipse: any two eclipses match (they share a symbol)
//  - archduke: cannot match (unique)
export function buildDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;

  // numbers 1..13
  for (let v = 1; v <= 13; v += 1) {
    for (const suit of SUITS) {
      cards.push({ id: id++, kind: { kind: 'number', value: v, suit } });
    }
  }
  // faces: 3 actions x 4 suits
  for (const action of FACE_ACTIONS) {
    for (const suit of SUITS) {
      cards.push({ id: id++, kind: { kind: 'face', action, suit } });
    }
  }
  // eclipses: 2x0, 2x13
  cards.push({ id: id++, kind: { kind: 'eclipse', value: 0 } });
  cards.push({ id: id++, kind: { kind: 'eclipse', value: 0 } });
  cards.push({ id: id++, kind: { kind: 'eclipse', value: 13 } });
  cards.push({ id: id++, kind: { kind: 'eclipse', value: 13 } });
  // archduke
  cards.push({ id: id++, kind: { kind: 'archduke' } });

  return shuffle(cards);
}

export function cardValue(card: Card): number {
  switch (card.kind.kind) {
    case 'number':
      return card.kind.value;
    case 'face':
      // face cards carry 0 points (they matter as actions, not score)
      return 0;
    case 'eclipse':
      return card.kind.value;
    case 'archduke':
      return -3;
  }
}

// true if two cards are a legal match (for discard-on-match).
// the archduke cannot be matched.
export function cardsMatch(a: Card, b: Card): boolean {
  if (a.kind.kind === 'archduke' || b.kind.kind === 'archduke') return false;
  if (a.kind.kind === 'number' && b.kind.kind === 'number') {
    return a.kind.value === b.kind.value;
  }
  if (a.kind.kind === 'face' && b.kind.kind === 'face') {
    return a.kind.suit === b.kind.suit;
  }
  if (a.kind.kind === 'eclipse' && b.kind.kind === 'eclipse') {
    return true;
  }
  return false;
}

// face-card action when the card is discarded or matched away
export function faceActionOf(card: Card): FaceAction | null {
  return card.kind.kind === 'face' ? card.kind.action : null;
}
