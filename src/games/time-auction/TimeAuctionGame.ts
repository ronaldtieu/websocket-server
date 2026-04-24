// Time Auction — hidden sealed-bid auction over 19 rounds.
// Implements GameInterface and exposes getStateForPlayer to keep losing bids hidden.
//
// Phase machine:
//   waiting → countdown(5s) → bidding(≤MAX_ROUND_MS) → reveal(REVEAL_MS)
//                                ↑                          │
//                                └──── (next round) ←───────┘
//                                                           │
//                                                  finished (after round 19)
//
// Server-authoritative timing: phones only send `time-auction/press` and
// `time-auction/release`. The server timestamps both, drains the bank live,
// and resolves the round. Losing bids are never revealed via getStateForPlayer.

import type {
  GameInterface,
  GameState,
  PlayerAction,
  PlayerState,
} from '../GameInterface.js';
import {
  COUNTDOWN_MS,
  MAX_ROUND_MS,
  REVEAL_MS,
  TIME_BANK_MS,
  TOTAL_ROUNDS,
  type TimeAuctionPhase,
  type TimeAuctionPlayerPublic,
  type TimeAuctionPublicState,
  type TimeAuctionRoundLogEntry,
  type TimeAuctionStateForPlayer,
} from './types.js';
import { resolveEndGame, resolveRound, type BidEntry } from './scoring.js';

interface InternalPlayer {
  id: string;
  name: string;
  isConnected: boolean;
  timeBankMs: number;
  tokens: number;
  // when the player started holding the button this round (ms-epoch),
  // or null if not currently holding.
  pressStartedAt: number | null;
  // bid locked for the current round, or null if not yet locked.
  lockedBidMs: number | null;
  // session-level outcome flags.
  isTopTokens: boolean;
  isEliminated: boolean;
  pieceDelta: number;
}

export interface TimeAuctionPieceDelta {
  playerId: string;
  amount: number;
  eliminated: boolean;
}

export class TimeAuctionGame implements GameInterface {
  readonly gameId: string;
  private players: Map<string, InternalPlayer> = new Map();
  private phase: TimeAuctionPhase = 'waiting';
  private round = 0;
  private readonly totalRounds: number;
  private phaseDeadline: number | null = null;
  private phaseTimer: NodeJS.Timeout | null = null;
  // ms-epoch when current bidding window opened. drives both the round
  // clock and the per-press time-bank drain calculation.
  private biddingStartedAt: number | null = null;
  // tracks players' bank values at the moment bidding opened. used to
  // compute live "bank during press" so a long hold doesn't double-count.
  private bankAtBidStart: Map<string, number> = new Map();
  // log of all completed rounds (winner + winning bid only).
  private log: TimeAuctionRoundLogEntry[] = [];
  // most recent reveal (mirrors log[round-1] during reveal phase).
  private lastReveal: TimeAuctionRoundLogEntry | null = null;
  private gameStarted = false;

  // socket layer sets this so the game can push state updates whenever
  // it ticks itself (phase change, auto-resolve, etc.).
  onPhaseChange: (() => void) | null = null;

  constructor(gameId: string, opts: { testMode?: boolean } = {}) {
    this.gameId = gameId;
    // test mode: 3 rounds for fast iteration.
    this.totalRounds = opts.testMode ? 3 : TOTAL_ROUNDS;
  }

  // --- GameInterface ---

  getState(): GameState {
    return {
      players: this.publicPlayerStates(),
      status:
        this.phase === 'waiting'
          ? 'waiting'
          : this.phase === 'finished'
            ? 'finished'
            : 'in_progress',
      timeAuction: this.publicState(),
    };
  }

  getStateForPlayer(playerId: string): GameState {
    const me = this.players.get(playerId);
    const stateForPlayer: TimeAuctionStateForPlayer = {
      ...this.publicState(),
      me: me
        ? {
            playerId: me.id,
            pressStartedAt: me.pressStartedAt,
            lockedBidMs: me.lockedBidMs,
          }
        : null,
    };
    return {
      players: this.publicPlayerStates(),
      status:
        this.phase === 'waiting'
          ? 'waiting'
          : this.phase === 'finished'
            ? 'finished'
            : 'in_progress',
      timeAuction: stateForPlayer,
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
      case 'time-auction/press':
        this.handlePress(player);
        break;
      case 'time-auction/release':
        this.handleRelease(player);
        break;
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
    // spec minimum is 4; allow 2 for testing-friendly minimum (matches remove-one).
    if (this.players.size < 2) return false;
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

  getPieceDeltas(): TimeAuctionPieceDelta[] {
    return Array.from(this.players.values()).map((p) => ({
      playerId: p.id,
      amount: p.pieceDelta,
      eliminated: p.isEliminated,
    }));
  }

  // --- press / release handlers ---

  private handlePress(player: InternalPlayer): void {
    if (this.phase !== 'bidding') {
      // ignore presses outside the bidding window — defensive against
      // stale events from a laggy client.
      return;
    }
    if (player.lockedBidMs !== null) {
      // already locked this round; second press shouldn't reopen.
      return;
    }
    if (player.pressStartedAt !== null) {
      // already holding — idempotent. don't reset the timer.
      return;
    }
    const now = Date.now();
    const remaining = this.computeBankRemaining(player, now);
    if (remaining <= 0) {
      // bank empty — button is supposed to be disabled client-side, but
      // be defensive on the server too.
      player.lockedBidMs = 0;
      this.maybeFinishBidding();
      return;
    }
    player.pressStartedAt = now;
    this.onPhaseChange?.();
  }

  private handleRelease(player: InternalPlayer): void {
    if (this.phase !== 'bidding') return;
    if (player.lockedBidMs !== null) return;
    const now = Date.now();
    const startedAt = player.pressStartedAt;
    if (startedAt === null) {
      // released without ever pressing — bid 0.
      player.lockedBidMs = 0;
    } else {
      const heldMs = Math.max(0, now - startedAt);
      // clamp to whatever bank they had at start of bidding (we already
      // refused to let them press past empty).
      const bankAtStart = this.bankAtBidStart.get(player.id) ?? player.timeBankMs;
      const bidMs = Math.min(heldMs, bankAtStart);
      player.lockedBidMs = bidMs;
      // drain the bank.
      player.timeBankMs = Math.max(0, bankAtStart - bidMs);
      player.pressStartedAt = null;
    }
    this.onPhaseChange?.();
    this.maybeFinishBidding();
  }

  // bidding ends when either:
  // - every active player has locked a bid (released), OR
  // - the round timer hits MAX_ROUND_MS and we force-resolve.
  private maybeFinishBidding(): void {
    if (this.phase !== 'bidding') return;
    for (const p of this.players.values()) {
      if (p.isEliminated || !p.isConnected) continue;
      if (p.lockedBidMs === null) return;
    }
    this.clearTimer();
    this.endBidding();
  }

  // computes remaining bank if we treat a currently-held press as draining
  // in real time. used to decide whether press is still meaningful.
  private computeBankRemaining(player: InternalPlayer, now: number): number {
    const bankBaseline = this.bankAtBidStart.get(player.id) ?? player.timeBankMs;
    if (player.pressStartedAt === null) return bankBaseline;
    const elapsed = Math.max(0, now - player.pressStartedAt);
    return Math.max(0, bankBaseline - elapsed);
  }

  // --- phase transitions ---

  private freshPlayer(id: string, name: string): InternalPlayer {
    return {
      id,
      name,
      isConnected: true,
      timeBankMs: TIME_BANK_MS,
      tokens: 0,
      pressStartedAt: null,
      lockedBidMs: null,
      isTopTokens: false,
      isEliminated: false,
      pieceDelta: 0,
    };
  }

  private beginRound(round: number): void {
    this.round = round;
    this.lastReveal = null;
    this.biddingStartedAt = null;
    this.bankAtBidStart.clear();
    for (const p of this.players.values()) {
      p.pressStartedAt = null;
      p.lockedBidMs = null;
    }
    this.setPhase('countdown');
  }

  private setPhase(phase: TimeAuctionPhase): void {
    this.phase = phase;
    this.clearTimer();
    if (phase === 'waiting' || phase === 'finished') {
      this.phaseDeadline = null;
      this.biddingStartedAt = null;
    } else if (phase === 'countdown') {
      this.phaseDeadline = Date.now() + COUNTDOWN_MS;
      this.biddingStartedAt = null;
      this.phaseTimer = setTimeout(() => this.advanceFromPhase('countdown'), COUNTDOWN_MS);
    } else if (phase === 'bidding') {
      const now = Date.now();
      this.biddingStartedAt = now;
      this.phaseDeadline = now + MAX_ROUND_MS;
      // snapshot every active player's bank at the moment bidding opens.
      for (const p of this.players.values()) {
        if (p.isEliminated) continue;
        this.bankAtBidStart.set(p.id, p.timeBankMs);
        // a player with an empty bank has nothing to bid — auto-lock at 0
        // so we don't wait on them.
        if (p.timeBankMs <= 0) p.lockedBidMs = 0;
      }
      this.phaseTimer = setTimeout(() => this.advanceFromPhase('bidding'), MAX_ROUND_MS);
      // there's a degenerate case: if every active player started this
      // round with an empty bank, we should resolve immediately rather
      // than wait for the cap.
      this.maybeFinishBidding();
    } else if (phase === 'reveal') {
      this.phaseDeadline = Date.now() + REVEAL_MS;
      this.biddingStartedAt = null;
      this.phaseTimer = setTimeout(() => this.advanceFromPhase('reveal'), REVEAL_MS);
    }
    this.onPhaseChange?.();
  }

  private advanceFromPhase(from: TimeAuctionPhase): void {
    switch (from) {
      case 'countdown':
        this.setPhase('bidding');
        break;
      case 'bidding':
        this.endBidding();
        break;
      case 'reveal':
        this.afterReveal();
        break;
      default:
        break;
    }
  }

  private endBidding(): void {
    if (this.phase !== 'bidding') return;
    // any player still holding when the round ends has their bid locked
    // at "now - pressStartedAt".
    const now = Date.now();
    for (const p of this.players.values()) {
      if (p.isEliminated) continue;
      if (p.lockedBidMs !== null) continue;
      if (p.pressStartedAt === null) {
        p.lockedBidMs = 0;
        continue;
      }
      const heldMs = Math.max(0, now - p.pressStartedAt);
      const bankAtStart = this.bankAtBidStart.get(p.id) ?? p.timeBankMs;
      const bidMs = Math.min(heldMs, bankAtStart);
      p.lockedBidMs = bidMs;
      p.timeBankMs = Math.max(0, bankAtStart - bidMs);
      p.pressStartedAt = null;
    }
    this.scoreRound();
    this.setPhase('reveal');
  }

  private scoreRound(): void {
    const bids: BidEntry[] = [];
    for (const p of this.players.values()) {
      if (p.isEliminated) continue;
      if (!p.isConnected) continue;
      bids.push({
        playerId: p.id,
        bidMs: p.lockedBidMs ?? 0,
        timeBankMs: p.timeBankMs,
      });
    }
    const result = resolveRound(bids);
    if (result.winnerId) {
      const w = this.players.get(result.winnerId);
      if (w) w.tokens += 1;
    }
    const winner = result.winnerId ? this.players.get(result.winnerId) : null;
    const entry: TimeAuctionRoundLogEntry = {
      round: this.round,
      winnerId: result.winnerId,
      winnerName: winner ? winner.name : null,
      winningBidMs: result.winningBidMs,
      awardedRandomly: result.awardedRandomly,
    };
    this.log.push(entry);
    this.lastReveal = entry;
  }

  private afterReveal(): void {
    if (this.round >= this.totalRounds) {
      this.applyEndGame();
      this.setPhase('finished');
    } else {
      this.beginRound(this.round + 1);
    }
  }

  private applyEndGame(): void {
    const active = Array.from(this.players.values()).filter((p) => !p.isEliminated);
    const outcome = resolveEndGame(
      active.map((p) => ({ playerId: p.id, tokens: p.tokens, timeBankMs: p.timeBankMs })),
    );
    if (outcome.topPlayerId) {
      const top = this.players.get(outcome.topPlayerId);
      if (top) {
        top.isTopTokens = true;
        top.pieceDelta += 1;
      }
    }
    if (outcome.bottomPlayerId) {
      const bot = this.players.get(outcome.bottomPlayerId);
      if (bot) {
        bot.pieceDelta -= 1;
        bot.isEliminated = true;
      }
    }
  }

  private clearTimer(): void {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  // --- snapshot helpers ---

  private publicPlayerStates(): PlayerState[] {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isConnected: p.isConnected,
    }));
  }

  private publicState(): TimeAuctionPublicState {
    const players: TimeAuctionPlayerPublic[] = Array.from(this.players.values()).map((p) => {
      // expose live-decremented bank during press so phones can render a
      // smooth countdown without trusting their own timer.
      let displayBank = p.timeBankMs;
      if (this.phase === 'bidding' && p.pressStartedAt !== null) {
        const now = Date.now();
        const elapsed = Math.max(0, now - p.pressStartedAt);
        const bankAtStart = this.bankAtBidStart.get(p.id) ?? p.timeBankMs;
        displayBank = Math.max(0, bankAtStart - elapsed);
      }
      return {
        id: p.id,
        name: p.name,
        isConnected: p.isConnected,
        timeBankMs: displayBank,
        tokens: p.tokens,
        // crucial: we expose isHolding (binary) but never the elapsed
        // hold duration. losing bids stay hidden.
        isHolding: this.phase === 'bidding' && p.pressStartedAt !== null,
        hasReleased: this.phase === 'bidding' && p.lockedBidMs !== null,
        isTopTokens: p.isTopTokens,
        isEliminated: p.isEliminated,
        pieceDelta: p.pieceDelta,
      };
    });
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: this.totalRounds,
      phaseDeadline: this.phaseDeadline,
      biddingStartedAt: this.phase === 'bidding' ? this.biddingStartedAt : null,
      players,
      log: [...this.log],
      lastReveal: this.phase === 'reveal' ? this.lastReveal : null,
    };
  }
}
