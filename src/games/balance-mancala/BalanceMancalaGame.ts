// Balance Mancala — implements GameInterface for the lobby framework.
// phase machine:
//   waiting → placement → playing → finished
// players take turns placing one stone at a time during placement, then
// take turns picking a dish + sowing during playing. game ends when any
// player reaches >=30 in a single color or when no one can act.

import type {
  GameInterface,
  GameState,
  PlayerAction,
  PlayerState,
} from '../GameInterface.js';
import {
  RING_SIZE,
  STONES_PER_PLAYER,
  TURN_DURATION_MS,
  type MancalaPhase,
  type MancalaPlayerPublic,
  type MancalaPublicState,
  type MancalaStateForPlayer,
} from './types.js';
import {
  cloneEngineState,
  finalScore,
  freshDishes,
  freshTotals,
  gameOverWinner,
  legalPickMoves,
  noPlayerCanAct,
  placeStone,
  sowAndScore,
  type EngineState,
} from './rules.js';

interface InternalPlayer {
  id: string;
  name: string;
  isConnected: boolean;
  stonesToPlace: number;
}

export class BalanceMancalaGame implements GameInterface {
  readonly gameId: string;
  private players: Map<string, InternalPlayer> = new Map();
  private turnOrder: string[] = [];
  private currentTurnIdx = 0;
  private phase: MancalaPhase = 'waiting';
  private engine: EngineState = { dishes: freshDishes(), totals: new Map() };
  private gameStarted = false;
  private winnerId: string | null = null;
  private phaseDeadline: number | null = null;
  private turnTimer: NodeJS.Timeout | null = null;
  private lastMove: MancalaPublicState['lastMove'] = null;
  private testMode: boolean;

  // server sets this so phase changes can broadcast / drive CPUs.
  onPhaseChange: (() => void) | null = null;

  constructor(gameId: string, opts: { testMode?: boolean } = {}) {
    this.gameId = gameId;
    this.testMode = Boolean(opts.testMode);
  }

  // --- GameInterface ---

  getState(): GameState {
    return {
      players: this.publicPlayerStates(),
      status:
        this.phase === 'waiting' ? 'waiting' : this.phase === 'finished' ? 'finished' : 'in_progress',
      balanceMancala: this.publicMancalaState(),
    };
  }

  getStateForPlayer(playerId: string): GameState {
    const base = this.publicMancalaState();
    const stateForPlayer: MancalaStateForPlayer = {
      ...base,
      me: this.players.has(playerId) ? { playerId } : null,
    };
    return {
      players: this.publicPlayerStates(),
      status:
        this.phase === 'waiting' ? 'waiting' : this.phase === 'finished' ? 'finished' : 'in_progress',
      balanceMancala: stateForPlayer,
    };
  }

  addPlayer(playerId: string, playerName: string): boolean {
    if (this.players.has(playerId)) return false;
    if (this.players.size >= 8) return false;
    if (this.gameStarted) return false;
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      isConnected: true,
      stonesToPlace: STONES_PER_PLAYER,
    });
    this.engine.totals.set(playerId, freshTotals());
    return true;
  }

  removePlayer(playerId: string): void {
    const p = this.players.get(playerId);
    if (p) p.isConnected = false;
  }

  handleAction(playerId: string, action: PlayerAction): GameState {
    const player = this.players.get(playerId);
    if (!player) throw new Error('player not in game');
    if (this.phase === 'waiting' || this.phase === 'finished') {
      throw new Error('not currently accepting actions');
    }
    if (this.currentPlayerId() !== playerId) {
      throw new Error('not your turn');
    }

    switch (action.type) {
      case 'mancala/place-initial': {
        if (this.phase !== 'placement') throw new Error('not in placement phase');
        const { dishIndex } = action.payload as { dishIndex: number };
        this.assertDishIndex(dishIndex);
        if (player.stonesToPlace <= 0) throw new Error('no stones left to place');
        placeStone(this.engine, dishIndex, playerId);
        player.stonesToPlace -= 1;
        this.lastMove = {
          playerId,
          type: 'place-initial',
          dishIndex,
          landedAt: null,
          scored: null,
        };
        this.advanceTurn();
        break;
      }
      case 'mancala/pick-dish': {
        if (this.phase !== 'playing') throw new Error('not in playing phase');
        const { dishIndex } = action.payload as { dishIndex: number };
        this.assertDishIndex(dishIndex);
        const legal = legalPickMoves(this.engine, playerId);
        if (!legal.includes(dishIndex)) throw new Error('illegal pick');
        const result = sowAndScore(this.engine, dishIndex);
        this.lastMove = {
          playerId,
          type: 'pick-dish',
          dishIndex,
          landedAt: result.landedAt,
          scored: result.scored,
        };
        const winner = gameOverWinner(this.engine);
        if (winner) {
          this.winnerId = winner;
          this.setPhase('finished');
          return this.getState();
        }
        this.advanceTurn();
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
    if (this.players.size < 2) return false; // spec is 4; relaxed for test mode
    this.gameStarted = true;
    // freeze turn order at start
    this.turnOrder = Array.from(this.players.keys());
    this.currentTurnIdx = 0;
    this.setPhase('placement');
    return true;
  }

  destroy(): void {
    this.clearTimer();
  }

  // --- host controls ---

  // ends the current turn (auto-passes / CPU-fallback for the active player)
  // when the host wants to skip a stalled player. used by the generic
  // `host-skip-phase` event. for placement: places into the lowest-index
  // dish; for playing: picks the first legal dish (or skips if none).
  skipPhase(): void {
    const playerId = this.currentPlayerId();
    if (!playerId) return;
    if (this.phase === 'placement') {
      try {
        this.handleAction(playerId, {
          type: 'mancala/place-initial',
          payload: { dishIndex: 0 },
        });
      } catch {
        // already placed all stones — just advance
        this.advanceTurn();
      }
    } else if (this.phase === 'playing') {
      const legal = legalPickMoves(this.engine, playerId);
      if (legal.length === 0) {
        this.advanceTurn();
      } else {
        try {
          this.handleAction(playerId, {
            type: 'mancala/pick-dish',
            payload: { dishIndex: legal[0] },
          });
        } catch {
          this.advanceTurn();
        }
      }
    }
  }

  // --- internals ---

  private currentPlayerId(): string | null {
    if (this.turnOrder.length === 0) return null;
    return this.turnOrder[this.currentTurnIdx % this.turnOrder.length];
  }

  private assertDishIndex(idx: number): void {
    if (!Number.isInteger(idx) || idx < 0 || idx >= RING_SIZE) {
      throw new Error('dish index out of range');
    }
  }

  private advanceTurn(): void {
    if (this.phase === 'placement') {
      // skip players who have placed all stones already (rare with even handouts,
      // but guard anyway).
      for (let i = 0; i < this.turnOrder.length; i += 1) {
        this.currentTurnIdx = (this.currentTurnIdx + 1) % this.turnOrder.length;
        const next = this.turnOrder[this.currentTurnIdx];
        const p = this.players.get(next);
        if (p && p.stonesToPlace > 0) break;
      }
      const remaining = Array.from(this.players.values()).reduce(
        (sum, p) => sum + p.stonesToPlace,
        0,
      );
      if (remaining === 0) {
        // begin playing phase. first turn goes to whoever was next in order.
        this.currentTurnIdx = 0;
        this.setPhase('playing');
        this.afterPlayingTurnAdvanced();
        return;
      }
      this.refreshTurnTimer();
      this.onPhaseChange?.();
      return;
    }

    if (this.phase === 'playing') {
      // skip players with no legal moves — they're forced to pass.
      let skips = 0;
      for (let i = 0; i < this.turnOrder.length; i += 1) {
        this.currentTurnIdx = (this.currentTurnIdx + 1) % this.turnOrder.length;
        const next = this.turnOrder[this.currentTurnIdx];
        if (legalPickMoves(this.engine, next).length > 0) break;
        skips += 1;
      }
      this.afterPlayingTurnAdvanced(skips);
    }
  }

  // shared housekeeping after the playing-phase turn cursor moves: detect
  // total stalemate and either end the game or refresh the timer + broadcast.
  private afterPlayingTurnAdvanced(skipsAttempted = 0): void {
    if (noPlayerCanAct(this.engine, this.turnOrder) || skipsAttempted >= this.turnOrder.length) {
      // pick the leader by final score as the winner of a stalemate.
      this.winnerId = this.computeLeader();
      this.setPhase('finished');
      return;
    }
    this.refreshTurnTimer();
    this.onPhaseChange?.();
  }

  private computeLeader(): string | null {
    let best: { id: string; score: number } | null = null;
    for (const id of this.turnOrder) {
      const t = this.engine.totals.get(id) ?? freshTotals();
      const s = finalScore(t);
      if (!best || s > best.score) best = { id, score: s };
    }
    return best?.id ?? null;
  }

  private setPhase(phase: MancalaPhase): void {
    this.phase = phase;
    this.clearTimer();
    if (phase === 'placement' || phase === 'playing') {
      this.refreshTurnTimer();
    } else {
      this.phaseDeadline = null;
    }
    this.onPhaseChange?.();
  }

  private refreshTurnTimer(): void {
    this.clearTimer();
    if (this.testMode) {
      // shorter timer in test mode keeps debugging snappy
      this.phaseDeadline = Date.now() + 20_000;
      this.turnTimer = setTimeout(() => this.skipPhase(), 20_000);
      return;
    }
    this.phaseDeadline = Date.now() + TURN_DURATION_MS;
    this.turnTimer = setTimeout(() => this.skipPhase(), TURN_DURATION_MS);
  }

  private clearTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  private publicPlayerStates(): PlayerState[] {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isConnected: p.isConnected,
    }));
  }

  private publicMancalaState(): MancalaPublicState {
    const players: MancalaPlayerPublic[] = Array.from(this.players.values()).map((p) => {
      const totals = this.engine.totals.get(p.id) ?? freshTotals();
      return {
        id: p.id,
        name: p.name,
        isConnected: p.isConnected,
        stonesToPlace: p.stonesToPlace,
        totals: { ...totals },
        finalScore: finalScore(totals),
      };
    });
    return {
      phase: this.phase,
      dishes: this.engine.dishes.map((d) => ({
        index: d.index,
        color: d.color,
        stones: d.stones.map((s) => ({ ownerId: s.ownerId })),
      })),
      players,
      turnOrder: [...this.turnOrder],
      currentPlayerId: this.currentPlayerId(),
      phaseDeadline: this.phaseDeadline,
      winnerId: this.winnerId,
      lastMove: this.lastMove,
    };
  }

  // expose a clone of the engine state for the CPU minimax driver. the
  // CPU mutates its own copy without disturbing the live game.
  cloneEngineForSearch(): EngineState {
    return cloneEngineState(this.engine);
  }

  getTurnOrder(): readonly string[] {
    return this.turnOrder;
  }

  getCurrentTurnIndex(): number {
    return this.currentTurnIdx;
  }

  getPhase(): MancalaPhase {
    return this.phase;
  }

  getStonesToPlace(playerId: string): number {
    return this.players.get(playerId)?.stonesToPlace ?? 0;
  }
}
