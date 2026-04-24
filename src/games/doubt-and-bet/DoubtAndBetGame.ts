// Doubt and Bet — Perudo / Liar's Dice variant.
// Implements GameInterface with hidden cards filtered through getStateForPlayer.
// Phase machine:
//   waiting → claiming → responding → (raise) → responding → ...
//                            ↓ (doubt)
//                        reveal → round-end → buy-slot → claiming (next round)
//                                                     ↓
//                                                 finished (when 2 eliminated
//                                                 or one player owns all slots)
//
// timer transitions are owned by the Game itself (via onPhaseChange). the socket
// handler only surfaces the game and listens for per-action broadcasts.

import type { GameInterface, GameState, PlayerAction, PlayerState } from '../GameInterface.js';
import {
  ALL_COLORS,
  PHASE_DURATIONS,
  type CardColor,
  type Claim,
  type DoubtColor,
  type DoubtPhase,
  type DoubtPlayerPrivate,
  type DoubtPlayerPublic,
  type DoubtPublicState,
  type DoubtStateForPlayer,
} from './types.js';
import { countMatching, isLegalRaise } from './claims.js';

const STARTING_SLOTS = 5;
const STARTING_PIECES = 5;
const RAINBOW_FRACTION = 0.1; // 10% of deck = rainbow wildcards
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2; // spec is 4; lowered for test mode + smaller dev sessions
const ATTRITION_EVERY = 5;
const ROTATE_EVERY = 10;
const PIECE_TRANSFER = 1;

interface InternalPlayer {
  id: string;
  name: string;
  isConnected: boolean;
  slots: number;
  pieces: number;
  cards: CardColor[];
  isEliminated: boolean;
  pieceDelta: number; // session ledger
  boughtSlotThisRound: boolean;
  // populated only during reveal phase
  revealedCards: CardColor[] | null;
}

export class DoubtAndBetGame implements GameInterface {
  readonly gameId: string;
  private players: Map<string, InternalPlayer> = new Map();
  // ordered seating: clockwise. rotates every ROTATE_EVERY rounds. holds
  // ALL players (including eliminated) so seat indices remain stable for UI;
  // logic skips eliminated players when computing the active/responder seat.
  private seating: string[] = [];
  private phase: DoubtPhase = 'waiting';
  private round = 0;
  private activeSeat = 0; // 0-indexed into seating
  private responderSeat: number | null = null;
  private currentClaim: Claim | null = null;
  private claimHistory: Claim[] = [];
  private phaseDeadline: number | null = null;
  private phaseTimer: NodeJS.Timeout | null = null;
  private gameStarted = false;
  private lastResolution: DoubtPublicState['lastResolution'] = null;
  private testMode: boolean;

  // onPhaseChange is invoked whenever phase/state mutates so the server can
  // broadcast. socket handler sets this after constructing the game.
  onPhaseChange: (() => void) | null = null;

  constructor(gameId: string, opts: { testMode?: boolean } = {}) {
    this.gameId = gameId;
    this.testMode = opts.testMode === true;
  }

  // --- GameInterface ---

  getState(): GameState {
    return {
      players: this.publicPlayerStates(),
      status: this.phase === 'waiting' ? 'waiting' : this.phase === 'finished' ? 'finished' : 'in_progress',
      doubtAndBet: this.publicState(),
    };
  }

  getStateForPlayer(playerId: string): GameState {
    const me = this.players.get(playerId);
    const base = this.publicState();
    const seat = this.seatOf(playerId);
    const stateForPlayer: DoubtStateForPlayer = {
      ...base,
      me: me
        ? {
            playerId: me.id,
            seat: seat + 1, // 1-based
            private: this.privateFor(me),
            neighborSeat: this.computeNeighborSeatFor(seat) + 1,
            neighborId: this.seating[this.computeNeighborSeatFor(seat)] ?? null,
          }
        : null,
    };
    return {
      players: this.publicPlayerStates(),
      status: this.phase === 'waiting' ? 'waiting' : this.phase === 'finished' ? 'finished' : 'in_progress',
      doubtAndBet: stateForPlayer,
    };
  }

  addPlayer(playerId: string, playerName: string): boolean {
    if (this.players.has(playerId)) return false;
    if (this.players.size >= MAX_PLAYERS) return false;
    if (this.gameStarted) return false;
    this.players.set(playerId, this.freshPlayer(playerId, playerName));
    this.seating.push(playerId);
    return true;
  }

  removePlayer(playerId: string): void {
    const p = this.players.get(playerId);
    if (p) p.isConnected = false;
  }

  handleAction(playerId: string, action: PlayerAction): GameState {
    const player = this.players.get(playerId);
    if (!player) throw new Error('player not in game');
    if (player.isEliminated) throw new Error('eliminated players cannot act');

    switch (action.type) {
      case 'doubt/claim': {
        if (this.phase !== 'claiming') throw new Error('not in claiming phase');
        if (this.currentSeatPlayerId() !== playerId) {
          throw new Error('not your turn');
        }
        const { n, color } = action.payload as { n: number; color: DoubtColor };
        this.validateClaimShape(n, color);
        this.currentClaim = { playerId, n, color };
        this.claimHistory.push(this.currentClaim);
        this.responderSeat = this.computeNextLiveSeat(this.activeSeat);
        this.setPhase('responding');
        break;
      }

      case 'doubt/raise': {
        if (this.phase !== 'responding') throw new Error('not in responding phase');
        if (!this.currentClaim) throw new Error('no claim to raise');
        if (this.responderSeatPlayerId() !== playerId) {
          throw new Error('not your turn to respond');
        }
        const { n, color } = action.payload as { n: number; color: DoubtColor };
        this.validateClaimShape(n, color);
        if (n > this.tableSizeTotal()) throw new Error('claim exceeds total cards on table');
        if (!isLegalRaise(this.currentClaim, { n, color })) throw new Error('raise must be strictly higher');
        this.currentClaim = { playerId, n, color };
        this.claimHistory.push(this.currentClaim);
        // the new responder is the player clockwise of the new claimant.
        this.activeSeat = this.seatOf(playerId);
        this.responderSeat = this.computeNextLiveSeat(this.activeSeat);
        this.setPhase('responding');
        break;
      }

      case 'doubt/doubt': {
        if (this.phase !== 'responding') throw new Error('not in responding phase');
        if (!this.currentClaim) throw new Error('no claim to doubt');
        if (this.responderSeatPlayerId() !== playerId) {
          throw new Error('not your turn to respond');
        }
        this.resolveDoubt(playerId);
        break;
      }

      case 'doubt/buy-slot': {
        if (this.phase !== 'buy-slot') throw new Error('buy-slot window not open');
        if (player.boughtSlotThisRound) throw new Error('already bought a slot this round');
        if (player.slots >= STARTING_SLOTS) throw new Error('already at max slots');
        if (player.pieces < 1) throw new Error('not enough pieces');
        player.pieces -= 1;
        player.pieceDelta -= 1;
        player.slots += 1;
        player.boughtSlotThisRound = true;
        this.onPhaseChange?.();
        break;
      }

      default:
        throw new Error(`unknown action ${action.type}`);
    }

    return this.getState();
  }

  isFull(): boolean {
    return this.players.size >= MAX_PLAYERS;
  }

  hasStarted(): boolean {
    return this.gameStarted;
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  start(_playerId: string): boolean {
    if (this.gameStarted) return false;
    if (this.players.size < MIN_PLAYERS) return false;
    this.gameStarted = true;
    this.beginRound(1);
    return true;
  }

  destroy(): void {
    this.clearTimer();
  }

  // --- host-driven controls ---

  skipPhase(): void {
    if (this.phase === 'waiting' || this.phase === 'finished') return;
    this.clearTimer();
    this.advanceFromPhase(this.phase);
  }

  // --- session-level piece ledger ---

  getPieceDeltas(): Array<{ playerId: string; amount: number; eliminated: boolean }> {
    return Array.from(this.players.values()).map((p) => ({
      playerId: p.id,
      amount: p.pieceDelta,
      eliminated: p.isEliminated,
    }));
  }

  // --- internals ---

  private freshPlayer(id: string, name: string): InternalPlayer {
    return {
      id,
      name,
      isConnected: true,
      slots: STARTING_SLOTS,
      pieces: STARTING_PIECES,
      cards: [],
      isEliminated: false,
      pieceDelta: 0,
      boughtSlotThisRound: false,
      revealedCards: null,
    };
  }

  private isLive(p: InternalPlayer): boolean {
    return !p.isEliminated && p.slots > 0;
  }

  private livePlayers(): InternalPlayer[] {
    return Array.from(this.players.values()).filter((p) => this.isLive(p));
  }

  private livePlayerCount(): number {
    return this.livePlayers().length;
  }

  private seatOf(playerId: string): number {
    const idx = this.seating.indexOf(playerId);
    if (idx === -1) return 0;
    return idx;
  }

  // walk seating clockwise from `seat` (exclusive) and return the next seat
  // index whose player is live. handles wrap-around. throws if no live player.
  private computeNextLiveSeat(seat: number): number {
    const len = this.seating.length;
    for (let i = 1; i <= len; i += 1) {
      const next = (seat + i) % len;
      const id = this.seating[next];
      const p = this.players.get(id);
      if (p && this.isLive(p)) return next;
    }
    throw new Error('no live players left to take a turn');
  }

  private computeNeighborSeatFor(seat: number): number {
    return this.computeNextLiveSeat(seat);
  }

  private currentSeatPlayerId(): string | null {
    return this.seating[this.activeSeat] ?? null;
  }

  private responderSeatPlayerId(): string | null {
    if (this.responderSeat === null) return null;
    return this.seating[this.responderSeat] ?? null;
  }

  private validateClaimShape(n: number, color: DoubtColor): void {
    if (!Number.isInteger(n) || n < 1) throw new Error('n must be a positive integer');
    if (!ALL_COLORS.includes(color)) throw new Error('invalid color (rainbow not claimable)');
  }

  private tableSizeTotal(): number {
    let total = 0;
    for (const p of this.livePlayers()) total += p.cards.length;
    return total;
  }

  private dealCardsForRound(): void {
    for (const p of this.players.values()) {
      if (!this.isLive(p)) {
        p.cards = [];
        continue;
      }
      const hand: CardColor[] = [];
      for (let i = 0; i < p.slots; i += 1) {
        hand.push(this.drawCard());
      }
      p.cards = hand;
      p.revealedCards = null;
      p.boughtSlotThisRound = false;
    }
  }

  private drawCard(): CardColor {
    if (Math.random() < RAINBOW_FRACTION) return 'rainbow';
    return ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)];
  }

  private beginRound(round: number): void {
    this.round = round;
    this.lastResolution = null;
    this.currentClaim = null;
    this.claimHistory = [];
    this.responderSeat = null;
    // attrition: at the START of every Nth round (after round 1), every
    // player pays 1 piece into the sink. eliminate any who can't.
    if (round > 1 && (round - 1) % ATTRITION_EVERY === 0) {
      this.applyAttrition();
    }
    // seat rotation: at the START of every Nth round (after round 1), rotate
    // seating one seat clockwise — neighbor pairings change.
    if (round > 1 && (round - 1) % ROTATE_EVERY === 0) {
      this.rotateSeating();
    }
    // bail early if game ended via attrition
    if (this.checkEndConditions()) return;
    this.dealCardsForRound();
    // active player advances clockwise from the previous active seat. on
    // round 1, start at seat 0 (first live player).
    if (round === 1) {
      this.activeSeat = this.firstLiveSeat();
    } else {
      this.activeSeat = this.computeNextLiveSeat(this.activeSeat);
    }
    this.setPhase('claiming');
  }

  private firstLiveSeat(): number {
    for (let i = 0; i < this.seating.length; i += 1) {
      const p = this.players.get(this.seating[i]);
      if (p && this.isLive(p)) return i;
    }
    return 0;
  }

  private applyAttrition(): void {
    for (const p of this.players.values()) {
      if (!this.isLive(p)) continue;
      if (p.pieces < 1) {
        // can't pay — eliminate immediately
        p.isEliminated = true;
        continue;
      }
      p.pieces -= 1;
      p.pieceDelta -= 1;
      if (p.pieces <= 0) {
        // edge: paid down to zero. spec says reaching 0 = elimination.
        p.isEliminated = true;
      }
    }
  }

  private rotateSeating(): void {
    if (this.seating.length === 0) return;
    const first = this.seating.shift();
    if (first !== undefined) this.seating.push(first);
  }

  private setPhase(phase: DoubtPhase): void {
    this.phase = phase;
    this.clearTimer();
    if (phase === 'waiting' || phase === 'finished') {
      this.phaseDeadline = null;
    } else {
      const duration = PHASE_DURATIONS[phase];
      this.phaseDeadline = Date.now() + duration;
      this.phaseTimer = setTimeout(() => this.advanceFromPhase(phase), duration);
    }
    this.onPhaseChange?.();
  }

  private clearTimer(): void {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  private advanceFromPhase(from: DoubtPhase): void {
    switch (from) {
      case 'claiming': {
        // active player didn't claim — auto-claim a minimal "1 yellow" so the
        // round still progresses.
        const activeId = this.currentSeatPlayerId();
        if (activeId && !this.currentClaim) {
          this.currentClaim = { playerId: activeId, n: 1, color: 'yellow' };
          this.claimHistory.push(this.currentClaim);
        }
        this.responderSeat = this.computeNextLiveSeat(this.activeSeat);
        this.setPhase('responding');
        break;
      }
      case 'responding': {
        // responder timed out — auto-doubt.
        const responderId = this.responderSeatPlayerId();
        if (responderId && this.currentClaim) {
          this.resolveDoubt(responderId);
        }
        break;
      }
      case 'reveal':
        this.setPhase('round-end');
        break;
      case 'round-end':
        this.setPhase('buy-slot');
        break;
      case 'buy-slot':
        this.nextRoundOrFinish();
        break;
      default:
        break;
    }
  }

  private resolveDoubt(doubterId: string): void {
    const claim = this.currentClaim!;
    const handsByPlayer = new Map<string, CardColor[]>();
    for (const p of this.livePlayers()) handsByPlayer.set(p.id, p.cards);
    const actualCount = countMatching(handsByPlayer, claim.color);
    const claimWasTrue = actualCount >= claim.n;
    const claimant = this.players.get(claim.playerId);
    const doubter = this.players.get(doubterId);
    if (!claimant || !doubter) throw new Error('invalid resolution participants');

    const loser = claimWasTrue ? doubter : claimant;
    const winner = claimWasTrue ? claimant : doubter;

    // loser pays 1 piece (or all remaining if < 1) and loses 1 slot.
    const transfer = Math.min(PIECE_TRANSFER, loser.pieces);
    loser.pieces -= transfer;
    loser.pieceDelta -= transfer;
    winner.pieces += transfer;
    winner.pieceDelta += transfer;
    loser.slots = Math.max(0, loser.slots - 1);

    // elimination triggers
    const eliminatedIds: string[] = [];
    if (loser.pieces <= 0 || loser.slots <= 0) {
      loser.isEliminated = true;
      eliminatedIds.push(loser.id);
    }

    // reveal everyone's cards for the animation
    for (const p of this.players.values()) {
      p.revealedCards = this.isLive(p) || p.id === loser.id ? [...p.cards] : [];
    }

    this.lastResolution = {
      doubterId,
      claimantId: claim.playerId,
      claim,
      actualCount,
      claimWasTrue,
      loserId: loser.id,
      pieceTransfer: transfer,
      eliminatedIds,
    };

    // park activeSeat at one seat BEFORE the desired claimant so that
    // beginRound's `computeNextLiveSeat` lands on them. desired claimant
    // is the loser if still alive, otherwise the next live seat clockwise
    // from the loser's old seat.
    const loserSeat = this.seatOf(loser.id);
    const prevSeat = (loserSeat - 1 + this.seating.length) % this.seating.length;
    this.activeSeat = prevSeat;

    this.setPhase('reveal');
  }

  private nextRoundOrFinish(): void {
    // clear the per-round revealedCards before next deal
    for (const p of this.players.values()) p.revealedCards = null;
    if (this.checkEndConditions()) return;
    this.beginRound(this.round + 1);
  }

  // game ends when 2+ have been eliminated OR one player holds all other
  // players' slots (= total slots across active players is concentrated).
  private checkEndConditions(): boolean {
    const eliminatedCount = Array.from(this.players.values()).filter((p) => p.isEliminated).length;
    if (eliminatedCount >= 2) {
      this.finish();
      return true;
    }
    const live = this.livePlayers();
    if (live.length <= 1) {
      this.finish();
      return true;
    }
    // one player has accumulated all others' slots: not literally possible
    // here (slots aren't transferred), but interpret as "only one player
    // has any slots left."
    const playersWithSlots = live.filter((p) => p.slots > 0);
    if (playersWithSlots.length <= 1) {
      this.finish();
      return true;
    }
    return false;
  }

  private finish(): void {
    // top-pieces survivor gets +2 bonus per spec
    const survivors = this.livePlayers();
    if (survivors.length > 0) {
      survivors.sort((a, b) => b.pieces - a.pieces);
      const top = survivors[0];
      top.pieces += 2;
      top.pieceDelta += 2;
    }
    this.setPhase('finished');
  }

  private publicPlayerStates(): PlayerState[] {
    return this.seating
      .map((id) => this.players.get(id))
      .filter((p): p is InternalPlayer => p !== undefined)
      .map((p) => ({ id: p.id, name: p.name, isConnected: p.isConnected }));
  }

  private publicState(): DoubtPublicState {
    const players: DoubtPlayerPublic[] = this.seating
      .map((id) => this.players.get(id))
      .filter((p): p is InternalPlayer => p !== undefined)
      .map((p) => ({
        id: p.id,
        name: p.name,
        slots: p.slots,
        pieces: p.pieces,
        isEliminated: p.isEliminated,
        isConnected: p.isConnected,
        revealedCards: this.phase === 'reveal' || this.phase === 'round-end' ? p.revealedCards : null,
        cardCount: p.cards.length,
      }));
    return {
      phase: this.phase,
      round: this.round,
      activeSeat: this.activeSeat + 1,
      responderSeat: this.responderSeat === null ? null : this.responderSeat + 1,
      phaseDeadline: this.phaseDeadline,
      currentClaim: this.currentClaim,
      claimHistory: [...this.claimHistory],
      seating: [...this.seating],
      lastResolution: this.lastResolution,
      players,
      attritionEvery: ATTRITION_EVERY,
      rotateEvery: ROTATE_EVERY,
      totalEliminations: Array.from(this.players.values()).filter((p) => p.isEliminated).length,
    };
  }

  private privateFor(p: InternalPlayer): DoubtPlayerPrivate {
    return {
      cards: [...p.cards],
      boughtSlotThisRound: p.boughtSlotThisRound,
    };
  }
}
