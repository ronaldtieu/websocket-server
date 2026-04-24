// Remove One — smallest-unique bluff card game.
// Implements GameInterface and exposes getStateForPlayer for hidden hands.
// Phase machine:
//   waiting → selecting → peek-reveal → choosing → play-reveal → scoring
//                                                                  ↓
//                                      ← (next round) ← ← ← ← ← ← ←┘
//                                                                  ↓
//                                                             checkpoint (at rounds 3/6/9/12/18)
//                                                                  ↓
//                                                              finished (after final round)
//
// timer transitions are owned by the Game itself (via onPhaseChange callback),
// so the socket handler just surfaces the game and listens for per-action broadcasts.

import type { GameInterface, GameState, PlayerAction, PlayerState } from '../GameInterface.js';
import { PHASE_DURATIONS } from './types.js';
import type {
  Card,
  PlayerPrivate,
  PlayerPublic,
  RemoveOnePhase,
  RemoveOnePublicState,
  RemoveOneStateForPlayer,
} from './types.js';
import { resolveRound, type Play } from './scoring.js';

const FULL_HAND: Card[] = [1, 2, 3, 4, 5, 6, 7, 8];
const DECK_RESET_ROUNDS_FULL = [6, 12];
const CHECKPOINT_ROUNDS_FULL = [3, 6, 9, 12, 18];

interface InternalPlayer {
  id: string;
  name: string;
  isConnected: boolean;
  hand: Card[];
  lockedNextRound: Card | null;
  selection: [Card, Card] | null;
  chosen: Card | null;
  peekCards: [Card, Card] | null;
  playedCard: Card | null;
  score: number;
  victoryTokens: number;
  isSafe: boolean;
  isEliminated: boolean;
  pieceDelta: number;
}

export interface PieceDelta {
  playerId: string;
  amount: number;
  eliminated: boolean;
}

export class RemoveOneGame implements GameInterface {
  readonly gameId: string;
  private players: Map<string, InternalPlayer> = new Map();
  private phase: RemoveOnePhase = 'waiting';
  private round = 0;
  private totalRounds: number;
  private checkpointRounds: number[];
  private phaseDeadline: number | null = null;
  private phaseTimer: NodeJS.Timeout | null = null;
  private lastScoring: RemoveOnePublicState['lastScoring'] = null;
  private gameStarted = false;

  // onPhaseChange is invoked whenever phase/state mutates so the server can broadcast.
  // socket handler sets this after constructing the game.
  onPhaseChange: (() => void) | null = null;

  constructor(gameId: string, opts: { testMode?: boolean } = {}) {
    this.gameId = gameId;
    this.totalRounds = opts.testMode ? 3 : 18;
    this.checkpointRounds = opts.testMode ? [3] : CHECKPOINT_ROUNDS_FULL;
  }

  // --- GameInterface ---

  getState(): GameState {
    return {
      players: this.publicPlayerStates(),
      status: this.phase === 'waiting' ? 'waiting' : this.phase === 'finished' ? 'finished' : 'in_progress',
      removeOne: this.publicRemoveOneState(),
    };
  }

  getStateForPlayer(playerId: string): GameState {
    const base = this.publicRemoveOneState();
    const me = this.players.get(playerId);
    const stateForPlayer: RemoveOneStateForPlayer = {
      ...base,
      me: me
        ? {
            playerId: me.id,
            private: this.privateFor(me),
          }
        : null,
    };
    return {
      players: this.publicPlayerStates(),
      status: this.phase === 'waiting' ? 'waiting' : this.phase === 'finished' ? 'finished' : 'in_progress',
      removeOne: stateForPlayer,
    };
  }

  addPlayer(playerId: string, playerName: string): boolean {
    if (this.players.has(playerId)) return false;
    if (this.players.size >= 8) return false;
    if (this.gameStarted) return false;
    this.players.set(playerId, this.freshPlayer(playerId, playerName));
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
      case 'remove-one/select-pair': {
        if (this.phase !== 'selecting') throw new Error('not in selection phase');
        const { a, b } = action.payload as { a: Card; b: Card };
        if (a === b) throw new Error('pair must be two different cards');
        if (!player.hand.includes(a) || !player.hand.includes(b)) {
          throw new Error('cards not in hand');
        }
        player.selection = [a, b];
        this.maybeAdvanceFromSelection();
        break;
      }
      case 'remove-one/choose-play': {
        if (this.phase !== 'choosing') throw new Error('not in choice phase');
        const { card } = action.payload as { card: Card };
        if (!player.selection) throw new Error('no selection locked in');
        if (card !== player.selection[0] && card !== player.selection[1]) {
          throw new Error('chosen card not in selection');
        }
        player.chosen = card;
        this.maybeAdvanceFromChoice();
        break;
      }
      default:
        throw new Error(`unknown action ${action.type}`);
    }
    return this.getState();
  }

  isFull(): boolean {
    return this.players.size >= 8;
  }

  hasStarted(): boolean {
    return this.gameStarted;
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  start(_playerId: string): boolean {
    if (this.gameStarted) return false;
    if (this.players.size < 2) return false; // test-mode minimum; spec is 4
    this.gameStarted = true;
    this.beginRound(1);
    return true;
  }

  destroy(): void {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  // --- host-driven controls ---

  skipPhase(): void {
    if (this.phase === 'waiting' || this.phase === 'finished') return;
    this.clearTimer();
    this.advanceFromPhase(this.phase);
  }

  // --- session-level piece ledger ---

  getPieceDeltas(): PieceDelta[] {
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
      hand: [...FULL_HAND],
      lockedNextRound: null,
      selection: null,
      chosen: null,
      peekCards: null,
      playedCard: null,
      score: 0,
      victoryTokens: 0,
      isSafe: false,
      isEliminated: false,
      pieceDelta: 0,
    };
  }

  private beginRound(round: number): void {
    this.round = round;
    this.lastScoring = null;
    for (const p of this.players.values()) {
      if (p.isEliminated) continue;
      p.selection = null;
      p.chosen = null;
      p.peekCards = null;
      p.playedCard = null;
      // apply locked-next-round carryover
      if (p.lockedNextRound !== null) {
        p.hand = p.hand.filter((c) => c !== p.lockedNextRound);
        p.lockedNextRound = null;
      }
      // deck resets at start of rounds 7 and 13 (after rounds 6 and 12)
      if (!this.isTestMode() && DECK_RESET_ROUNDS_FULL.includes(round - 1)) {
        p.hand = [...FULL_HAND];
      }
    }
    this.setPhase('selecting');
  }

  private isTestMode(): boolean {
    return this.totalRounds === 3;
  }

  private setPhase(phase: RemoveOnePhase): void {
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

  private advanceFromPhase(from: RemoveOnePhase): void {
    switch (from) {
      case 'selecting':
        this.autoSelectMissing();
        this.revealPeek();
        break;
      case 'peek-reveal':
        this.setPhase('choosing');
        break;
      case 'choosing':
        this.autoChooseMissing();
        this.revealPlay();
        break;
      case 'play-reveal':
        this.scoreRound();
        this.setPhase('scoring');
        break;
      case 'scoring':
        this.afterScoring();
        break;
      case 'checkpoint':
        this.afterCheckpoint();
        break;
      default:
        break;
    }
  }

  private maybeAdvanceFromSelection(): void {
    if (this.allActivePlayersSatisfy((p) => p.selection !== null)) {
      this.clearTimer();
      this.revealPeek();
    }
  }

  private maybeAdvanceFromChoice(): void {
    if (this.allActivePlayersSatisfy((p) => p.chosen !== null)) {
      this.clearTimer();
      this.revealPlay();
    }
  }

  private allActivePlayersSatisfy(pred: (p: InternalPlayer) => boolean): boolean {
    for (const p of this.players.values()) {
      if (p.isEliminated || !p.isConnected) continue;
      if (!pred(p)) return false;
    }
    return true;
  }

  private autoSelectMissing(): void {
    for (const p of this.players.values()) {
      if (p.isEliminated) continue;
      if (p.selection) continue;
      // auto-pick two lowest
      const sorted = [...p.hand].sort((a, b) => a - b);
      if (sorted.length >= 2) {
        p.selection = [sorted[0], sorted[1]];
      } else if (sorted.length === 1) {
        // edge case: only one card left → duplicate for reveal, then auto-play that card
        p.selection = [sorted[0], sorted[0]];
      }
    }
  }

  private autoChooseMissing(): void {
    for (const p of this.players.values()) {
      if (p.isEliminated) continue;
      if (!p.selection) continue;
      if (p.chosen) continue;
      // auto-play higher (less risky low-end clash)
      p.chosen = Math.max(p.selection[0], p.selection[1]) as Card;
    }
  }

  private revealPeek(): void {
    for (const p of this.players.values()) {
      if (p.isEliminated) continue;
      p.peekCards = p.selection;
    }
    this.setPhase('peek-reveal');
  }

  private revealPlay(): void {
    for (const p of this.players.values()) {
      if (p.isEliminated) continue;
      p.playedCard = p.chosen;
    }
    this.setPhase('play-reveal');
  }

  private scoreRound(): void {
    const plays: Play[] = [];
    for (const p of this.players.values()) {
      if (p.isEliminated) continue;
      if (p.playedCard !== null) plays.push({ playerId: p.id, card: p.playedCard });
    }
    const result = resolveRound(plays);
    if (result.winnerId && result.winningCard !== null) {
      const w = this.players.get(result.winnerId);
      if (w) {
        w.score += result.winningCard;
        w.victoryTokens += 1;
      }
    }
    this.lastScoring = {
      roundWinner: result.winnerId,
      cardValue: result.winningCard,
      clashed: result.clashed,
    };
    // discard played; lock the other pick for next round
    for (const p of this.players.values()) {
      if (p.isEliminated) continue;
      if (p.selection && p.chosen !== null) {
        const otherCard = p.selection[0] === p.chosen ? p.selection[1] : p.selection[0];
        p.hand = p.hand.filter((c) => c !== p.chosen);
        // lock the "other" card out next round (if it's still in hand — it should be)
        if (p.hand.includes(otherCard) && otherCard !== p.chosen) {
          p.lockedNextRound = otherCard;
        }
      }
    }
  }

  private afterScoring(): void {
    const isCheckpoint = this.checkpointRounds.includes(this.round);
    if (isCheckpoint) {
      this.applyCheckpoint();
      this.setPhase('checkpoint');
      return;
    }
    this.nextRoundOrFinish();
  }

  private afterCheckpoint(): void {
    this.nextRoundOrFinish();
  }

  private nextRoundOrFinish(): void {
    if (this.round >= this.totalRounds) {
      this.finish();
    } else {
      this.beginRound(this.round + 1);
    }
  }

  // checkpoint rules (simplified to keep first-playable sensible):
  // - intermediate checkpoints (all but final): highest score this round window is "safe"
  // - final checkpoint: +1 piece to highest among non-safe, -1 piece + elimination to lowest
  private applyCheckpoint(): void {
    const active = Array.from(this.players.values()).filter((p) => !p.isEliminated);
    const isFinal = this.round === this.totalRounds;
    // score-with-vts applied at checkpoints per spec
    const scored = active.map((p) => ({ p, effective: p.score + p.victoryTokens }));
    scored.sort((a, b) => b.effective - a.effective);

    if (!isFinal) {
      // mark highest-scoring non-safe player as safe
      const nonSafe = scored.filter((s) => !s.p.isSafe);
      if (nonSafe.length > 0) nonSafe[0].p.isSafe = true;
      return;
    }

    // final: among remaining not-safe, top +1 piece, bottom -1 piece + eliminated
    const danger = scored.filter((s) => !s.p.isSafe);
    if (danger.length === 0) {
      // everyone was already safe — reward top overall, no elimination
      if (scored.length > 0) scored[0].p.pieceDelta += 1;
      return;
    }
    if (danger.length === 1) {
      danger[0].p.pieceDelta += 1;
      return;
    }
    danger[0].p.pieceDelta += 1;
    const loser = danger[danger.length - 1].p;
    loser.pieceDelta -= 1;
    loser.isEliminated = true;
  }

  private finish(): void {
    this.setPhase('finished');
  }

  private publicPlayerStates(): PlayerState[] {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isConnected: p.isConnected,
    }));
  }

  private publicRemoveOneState(): RemoveOnePublicState {
    const players: PlayerPublic[] = Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      handSize: p.hand.length,
      score: p.score,
      victoryTokens: p.victoryTokens,
      isSafe: p.isSafe,
      isEliminated: p.isEliminated,
      peekCards: this.phase === 'peek-reveal' || this.phase === 'choosing' ? p.peekCards : null,
      playedCard: this.phase === 'play-reveal' || this.phase === 'scoring' ? p.playedCard : null,
      hasSubmittedSelection: p.selection !== null,
      hasSubmittedChoice: p.chosen !== null,
    }));
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: this.totalRounds,
      phaseDeadline: this.phaseDeadline,
      players,
      lastScoring: this.lastScoring,
      checkpointRounds: this.checkpointRounds,
    };
  }

  private privateFor(p: InternalPlayer): PlayerPrivate {
    return {
      hand: [...p.hand],
      lockedNextRound: p.lockedNextRound,
      selection: p.selection,
      chosen: p.chosen,
    };
  }
}
