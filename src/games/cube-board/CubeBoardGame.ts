// "Unknown" (cube-board) — colored grid game where you tip a cube one
// square at a time and discover hidden rules by triggering them.
//
// Game id: `cube-board`. Title: UNKNOWN.
//
// Phase machine:
//   waiting -> practice (3 rounds, rules silent) -> real -> finished
// A "round" is one full pass through turnOrder. Within a round, we advance
// turnIndex one player at a time; bonus-turn lets a player go again before
// turnIndex advances.

import type { GameInterface, GameState, PlayerAction, PlayerState } from '../GameInterface.js';
import { buildBoard, DIR_DELTAS, isGoal, neighbor, pickEmptyGrayStart, squareAt } from './board.js';
import { previewTops, randomOrientation, reorientToTop, tumble } from './cube.js';
import {
  adjacentColorMatches,
  applyBanishment1,
  applyBanishment2,
  evaluatePostMove,
  findMoveAnotherTargets,
} from './rules.js';
import type {
  BoardDef,
  CubeBoardPhase,
  CubeBoardPublicState,
  CubeBoardStateForPlayer,
  CubeColor,
  CubeFace,
  CubeOrientation,
  Direction,
  PlayerPrivate,
  PlayerPublic,
  RuleId,
  RuleReveal,
} from './types.js';

const PRACTICE_ROUNDS = 3;
const MAX_PLAYERS = 12;
const MIN_PLAYERS = 2; // spec is 6 but we relax for testing

interface InternalPlayer {
  id: string;
  name: string;
  isConnected: boolean;
  squareIndex: number;
  orientation: CubeOrientation;
  banishments: number;
  pieceDelta: number;
  isFinished: boolean;
  finishRank: number | null;
  mustReorient: boolean;
  bonusPending: boolean;
  notes: string;
}

export interface PieceDelta {
  playerId: string;
  amount: number;
  eliminated: boolean;
}

export class CubeBoardGame implements GameInterface {
  readonly gameId: string;

  private players: Map<string, InternalPlayer> = new Map();
  private joinOrder: string[] = [];
  private turnOrder: string[] = [];
  private turnIndex = 0;
  private round = 1;
  private phase: CubeBoardPhase = 'waiting';
  private board: BoardDef;
  private revealedRules: Map<RuleId, RuleReveal> = new Map();
  private pendingReveal: RuleReveal | null = null;
  private banishment2Losers: Set<string> = new Set();
  private finishCounter = 0;
  private lastEvent: { kind: string; playerId: string; detail?: string } | null = null;
  private finalRanking: { playerId: string; rank: number; squareIndex: number }[] | null = null;
  private gameStarted = false;
  private moveAnotherTargetsByPlayer: Map<string, string[]> = new Map();

  // testMode currently only exists to keep the API consistent with the
  // other games — we already finish on first-to-goal so there's no rounds
  // knob to tune.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(gameId: string, _opts: { testMode?: boolean } = {}) {
    this.gameId = gameId;
    this.board = buildBoard();
  }

  onPhaseChange: (() => void) | null = null;

  // --- GameInterface ---

  getState(): GameState {
    return {
      players: this.publicPlayerStates(),
      status: this.toStatus(),
      cubeBoard: this.publicState(),
    };
  }

  getStateForPlayer(playerId: string): GameState {
    const me = this.players.get(playerId);
    const stateForPlayer: CubeBoardStateForPlayer = {
      ...this.publicState(),
      me: me
        ? {
            playerId: me.id,
            private: this.privateFor(me),
          }
        : null,
    };
    return {
      players: this.publicPlayerStates(),
      status: this.toStatus(),
      cubeBoard: stateForPlayer,
    };
  }

  addPlayer(playerId: string, playerName: string): boolean {
    if (this.players.has(playerId)) return false;
    if (this.players.size >= MAX_PLAYERS) return false;
    if (this.gameStarted) return false;
    // start each player on a randomly assigned gray square. if all gray
    // squares are taken (more players than starts), reuse — purely for the
    // unlikely-but-possible case during testing.
    const occupied = new Set(Array.from(this.players.values()).map((p) => p.squareIndex));
    const start = pickEmptyGrayStart(this.board, occupied);
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      isConnected: true,
      squareIndex: start,
      orientation: randomOrientation(),
      banishments: 0,
      pieceDelta: 0,
      isFinished: false,
      finishRank: null,
      mustReorient: false,
      bonusPending: false,
      notes: '',
    });
    this.joinOrder.push(playerId);
    return true;
  }

  removePlayer(playerId: string): void {
    const p = this.players.get(playerId);
    if (p) p.isConnected = false;
  }

  handleAction(playerId: string, action: PlayerAction): GameState {
    const player = this.players.get(playerId);
    if (!player) throw new Error('player not in game');

    // Notes can be updated any time, even off-turn.
    if (action.type === 'unknown/notes') {
      const { text } = action.payload as { text: string };
      player.notes = (text ?? '').slice(0, 1000);
      // notes are private; don't broadcast a phase change but still respond
      this.onPhaseChange?.();
      return this.getState();
    }

    if (this.phase === 'waiting' || this.phase === 'finished') {
      throw new Error('game not in progress');
    }
    const expectedActor = this.currentActor();
    if (expectedActor?.id !== playerId) {
      throw new Error('not your turn');
    }
    if (player.isFinished) {
      throw new Error('already finished');
    }

    switch (action.type) {
      case 'unknown/reorient': {
        const { topColor } = action.payload as { topColor: CubeColor };
        this.handleReorient(player, topColor);
        break;
      }
      case 'unknown/move': {
        const { direction } = action.payload as { direction: Direction };
        this.handleMove(player, direction);
        break;
      }
      case 'unknown/move-other': {
        const { targetPlayerId, direction } = action.payload as {
          targetPlayerId: string;
          direction: Direction;
        };
        this.handleMoveOther(player, targetPlayerId, direction);
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
    // Turn order is fixed at game start, ranked by the printed number of
    // each player's starting square (lower number goes first per spec
    // "determined by starting-square numbers").
    this.turnOrder = [...this.joinOrder].sort((a, b) => {
      const sa = this.players.get(a)!.squareIndex;
      const sb = this.players.get(b)!.squareIndex;
      return this.board.squares[sa].index - this.board.squares[sb].index;
    });
    this.turnIndex = 0;
    this.round = 1;
    this.phase = 'practice';
    this.evaluateUpcomingTurnState();
    this.onPhaseChange?.();
    return true;
  }

  destroy(): void {
    /* no timers held */
  }

  // host-driven skip (no-op for cube-board: players can choose to do nothing
  // right now). kept for API parity with remove-one's skipPhase.
  skipPhase(): void {
    if (this.phase === 'waiting' || this.phase === 'finished') return;
    // skip the current player by advancing without action; effectively a
    // forfeit of the turn.
    this.advanceTurn(false);
    this.onPhaseChange?.();
  }

  getPieceDeltas(): PieceDelta[] {
    return Array.from(this.players.values()).map((p) => ({
      playerId: p.id,
      amount: p.pieceDelta,
      eliminated: false,
    }));
  }

  // --- internals ---

  private toStatus(): GameState['status'] {
    if (this.phase === 'waiting') return 'waiting';
    if (this.phase === 'finished') return 'finished';
    return 'in_progress';
  }

  private currentActor(): InternalPlayer | null {
    if (this.turnOrder.length === 0) return null;
    // skip finished players so their turn doesn't stall the round
    for (let attempts = 0; attempts < this.turnOrder.length; attempts += 1) {
      const id = this.turnOrder[(this.turnIndex + attempts) % this.turnOrder.length];
      const p = this.players.get(id);
      if (p && !p.isFinished) {
        if (attempts > 0) this.turnIndex = (this.turnIndex + attempts) % this.turnOrder.length;
        return p;
      }
    }
    return null;
  }

  private handleReorient(player: InternalPlayer, color: CubeColor): void {
    const updated = reorientToTop(player.orientation, color);
    if (updated === null) {
      throw new Error(`color ${color} is not on this cube`);
    }
    // only allow re-orienting to a color that's adjacent (this is the
    // spec's intent — re-orient to escape Color Match).
    const matches = adjacentColorMatches(this.board, player.squareIndex, color);
    if (matches.length === 0 && this.hiddenRulesActive()) {
      throw new Error(`no adjacent ${color} square — choose another color`);
    }
    player.orientation = updated;
    player.mustReorient = false;
    this.lastEvent = { kind: 'reorient', playerId: player.id, detail: color };
    this.evaluateUpcomingTurnState();
    this.onPhaseChange?.();
  }

  private handleMoveOther(
    actor: InternalPlayer,
    targetId: string,
    direction: Direction,
  ): void {
    const targets = this.moveAnotherTargetsByPlayer.get(actor.id) ?? [];
    if (!targets.includes(targetId)) {
      throw new Error('that player is not a valid target right now');
    }
    const target = this.players.get(targetId);
    if (!target) throw new Error('unknown target player');
    // Move-Another: the targeted cube tumbles in the chosen direction.
    // Treat the target like a primary mover for tumbling/banishment, but
    // do not give them bonus/move-another follow-ups (they're being moved
    // for someone else's turn).
    this.executeMove(target, direction, { isPushed: false, asPrimary: false });
    // mark the rule as triggered (informational) — done by executeMove path?
    // we register it here so it shows up even if the move had no banishment.
    this.recordRule('move-another', actor.id);
    this.advanceTurn(actor.bonusPending);
    actor.bonusPending = false;
    this.evaluateUpcomingTurnState();
    this.onPhaseChange?.();
  }

  private handleMove(player: InternalPlayer, direction: Direction): void {
    if (this.hiddenRulesActive() && player.mustReorient) {
      throw new Error('you must re-orient first');
    }
    // Color-Match enforcement: even silently during practice. If no
    // adjacent square matches the current top color, reject the move and
    // mark mustReorient. Yellow/wild face skips this check.
    const top = player.orientation.top;
    const matches = adjacentColorMatches(this.board, player.squareIndex, top);
    if (top !== 'face' && matches.length === 0) {
      // forced re-orient. surface as a rule reveal (color-match).
      player.mustReorient = true;
      this.recordRule('color-match', player.id);
      this.lastEvent = { kind: 'must-reorient', playerId: player.id };
      this.onPhaseChange?.();
      return;
    }
    // Direction must lead to a square whose color matches the top color
    // (the "tile-color" rule for movement). Yellow or face acts as wild.
    if (top !== 'face') {
      const dest = neighbor(this.board, player.squareIndex, direction);
      if (!dest) throw new Error('off the board');
      const ok =
        dest.kind === 'goal' ||
        dest.kind === 'gray' ||
        (dest.kind === 'color' && dest.color === top);
      if (!ok) {
        throw new Error(`top color ${top} doesn't match destination`);
      }
    }

    this.executeMove(player, direction, { isPushed: false, asPrimary: true });

    // After a primary move: evaluate post-move triggers (move-another,
    // bonus turn). These do NOT fire for pushed cubes (push-out rule).
    if (!player.isFinished) {
      const triggers = evaluatePostMove(
        this.board,
        player.squareIndex,
        player.orientation.top,
      );
      if (triggers.bonus) {
        player.bonusPending = true;
        this.recordRule('bonus-turn', player.id);
      }
      if (triggers.moveAnotherEligible) {
        this.recordRule('move-another', player.id);
        // The candidate-target list is computed fresh in evaluateUpcomingTurnState.
      }
    }

    // bonus-pending lets the same player go again. otherwise advance.
    this.advanceTurn(player.bonusPending);
    player.bonusPending = false;
    this.evaluateUpcomingTurnState();
    this.onPhaseChange?.();
  }

  // executeMove handles the tumble + push chain + banishment. asPrimary
  // controls whether the moved cube triggers Bonus / Move-Another (those
  // are only for primary movers per the push-out rule).
  private executeMove(
    mover: InternalPlayer,
    direction: Direction,
    opts: { isPushed: boolean; asPrimary: boolean },
  ): void {
    const dest = neighbor(this.board, mover.squareIndex, direction);
    if (!dest) {
      // off-board — illegal for primaries; for pushed cubes we just leave
      // them in place (edge of board absorbs the push).
      if (!opts.isPushed) throw new Error('off the board');
      return;
    }
    const destIdx = this.board.squares.indexOf(dest);
    // If destination is occupied, push that cube one square first.
    const occupant = this.cubeAt(destIdx);
    if (occupant && occupant.id !== mover.id) {
      this.executeMove(occupant, direction, { isPushed: true, asPrimary: false });
      // mark push-out rule revealed (the chain is visible to the table)
      this.recordRule('push-out', mover.id);
    }
    // Tumble the cube and land it
    mover.orientation = tumble(mover.orientation, direction);
    mover.squareIndex = destIdx;

    // Goal check
    if (isGoal(this.board, destIdx) && !mover.isFinished) {
      mover.isFinished = true;
      this.finishCounter += 1;
      mover.finishRank = this.finishCounter;
      this.lastEvent = { kind: 'goal', playerId: mover.id };
      this.maybeFinishGame();
      return;
    }

    // Banishment 1 — applies to anyone landing, including pushed cubes.
    const occupied = new Set(
      Array.from(this.players.values())
        .filter((p) => !p.isFinished && p.id !== mover.id)
        .map((p) => p.squareIndex),
    );
    const banResult = applyBanishment1(
      this.board,
      destIdx,
      mover.orientation.top,
      occupied,
    );
    if (banResult.banished) {
      mover.banishments += 1;
      mover.squareIndex = banResult.newSquareIndex;
      this.recordRule('banishment-1', mover.id);
      this.lastEvent = {
        kind: 'banished',
        playerId: mover.id,
        detail: banResult.reason ?? undefined,
      };
      // Banishment 2 — first two players to reach 3 markers lose 3 pieces.
      const ban2 = applyBanishment2(this.publicPlayers(), this.banishment2Losers);
      if (ban2.triggered) {
        for (const id of ban2.losers) {
          const lp = this.players.get(id);
          if (lp) {
            lp.pieceDelta -= 3;
            this.banishment2Losers.add(id);
          }
        }
        this.recordRule('banishment-2', mover.id);
      }
    } else if (!opts.isPushed && opts.asPrimary) {
      this.lastEvent = { kind: 'move', playerId: mover.id, detail: direction };
    }
  }

  private advanceTurn(stayWithCurrent: boolean): void {
    if (this.allFinished()) {
      this.finishGame();
      return;
    }
    if (stayWithCurrent) return; // bonus turn: same player again
    this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
    // wrapped around -> next round
    if (this.turnIndex === 0) {
      this.round += 1;
      if (this.phase === 'practice' && this.round > PRACTICE_ROUNDS) {
        this.phase = 'real';
      }
    }
  }

  // Re-evaluate forced re-orient + move-another targets for the upcoming actor.
  private evaluateUpcomingTurnState(): void {
    const actor = this.currentActor();
    if (!actor) return;
    const top = actor.orientation.top;
    const matches = adjacentColorMatches(this.board, actor.squareIndex, top);
    if (top !== 'face' && matches.length === 0) {
      actor.mustReorient = true;
      this.recordRule('color-match', actor.id);
      // If no color anywhere on the cube has an adjacent match, the cube is
      // truly stuck — auto-roll a legal direction (server-side bail).
      const stuck = !this.canReorientToAny(actor);
      if (stuck) {
        const dirs: Direction[] = ['N', 'E', 'S', 'W'];
        for (const d of dirs) {
          const sq = neighbor(this.board, actor.squareIndex, d);
          if (sq) {
            actor.mustReorient = false;
            this.executeMove(actor, d, { isPushed: false, asPrimary: false });
            this.lastEvent = { kind: 'auto-roll', playerId: actor.id, detail: d };
            this.advanceTurn(false);
            this.evaluateUpcomingTurnState();
            return;
          }
        }
      }
    } else {
      actor.mustReorient = false;
    }
    // recompute move-another targets
    const others = Array.from(this.players.values())
      .filter((p) => p.id !== actor.id && !p.isFinished)
      .map((p) => ({
        playerId: p.id,
        squareIdx: p.squareIndex,
        topColor: p.orientation.top,
      }));
    const ma = top !== 'face' ? this.maEval(actor, others) : [];
    this.moveAnotherTargetsByPlayer.set(actor.id, ma);
  }

  private maEval(
    actor: InternalPlayer,
    others: { playerId: string; squareIdx: number; topColor: CubeFace }[],
  ): string[] {
    const top = actor.orientation.top;
    if (top === 'face') return [];
    const colorMatches = adjacentColorMatches(this.board, actor.squareIndex, top);
    if (colorMatches.length < 2) return [];
    const wild = top === 'yellow';
    return findMoveAnotherTargets(this.board, actor.squareIndex, top as CubeColor, wild, others);
  }

  private canReorientToAny(player: InternalPlayer): boolean {
    const slots: CubeFace[] = [
      player.orientation.top,
      player.orientation.bottom,
      player.orientation.north,
      player.orientation.south,
      player.orientation.east,
      player.orientation.west,
    ];
    for (const c of slots) {
      if (c === 'face') continue;
      const matches = adjacentColorMatches(this.board, player.squareIndex, c);
      if (matches.length > 0) return true;
    }
    return false;
  }

  private cubeAt(idx: number): InternalPlayer | null {
    for (const p of this.players.values()) {
      if (!p.isFinished && p.squareIndex === idx) return p;
    }
    return null;
  }

  private recordRule(rule: RuleId, playerId: string): void {
    if (!this.hiddenRulesActive()) return; // silent during practice
    if (this.revealedRules.has(rule)) return;
    const reveal: RuleReveal = {
      ruleId: rule,
      revealedAtRound: this.round,
      triggeredBy: playerId,
    };
    this.revealedRules.set(rule, reveal);
    this.pendingReveal = reveal;
  }

  private hiddenRulesActive(): boolean {
    return this.phase === 'real';
  }

  private allFinished(): boolean {
    let anyActive = false;
    for (const p of this.players.values()) {
      if (!p.isFinished) {
        anyActive = true;
        break;
      }
    }
    return !anyActive;
  }

  private maybeFinishGame(): void {
    // first to goal ends the game per spec.
    this.finishGame();
  }

  private finishGame(): void {
    if (this.phase === 'finished') return;
    this.phase = 'finished';

    // Build final ranking. Finished players ranked by finishRank ascending;
    // unfinished players ranked by current square's printed number, higher
    // = better (per spec).
    const finishers = Array.from(this.players.values())
      .filter((p) => p.isFinished)
      .sort((a, b) => (a.finishRank ?? 0) - (b.finishRank ?? 0));
    const unfinished = Array.from(this.players.values())
      .filter((p) => !p.isFinished)
      .sort(
        (a, b) =>
          this.board.squares[b.squareIndex].index - this.board.squares[a.squareIndex].index,
      );
    const ordered = [...finishers, ...unfinished];

    // Piece rewards: 1st = +3, 2nd-5th = +1, rest = 0.
    this.finalRanking = ordered.map((p, i) => {
      const rank = i + 1;
      let reward = 0;
      if (rank === 1) reward = 3;
      else if (rank >= 2 && rank <= 5) reward = 1;
      p.pieceDelta += reward;
      return { playerId: p.id, rank, squareIndex: p.squareIndex };
    });
  }

  // --- view models ---

  private publicPlayerStates(): PlayerState[] {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isConnected: p.isConnected,
    }));
  }

  private publicPlayers(): PlayerPublic[] {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      squareIndex: p.squareIndex,
      topColor: p.orientation.top,
      banishments: p.banishments,
      pieceDelta: p.pieceDelta,
      isFinished: p.isFinished,
      finishRank: p.finishRank,
    }));
  }

  private publicState(): CubeBoardPublicState {
    const reveal = this.pendingReveal;
    // pendingReveal is a one-shot; the engine consumes it on each broadcast
    // so the banner shows once. The persistent revealedRules log keeps the
    // history.
    this.pendingReveal = null;
    return {
      phase: this.phase,
      round: this.round,
      practiceRoundsRemaining:
        this.phase === 'practice' ? Math.max(0, PRACTICE_ROUNDS - this.round + 1) : 0,
      turnIndex: this.turnIndex,
      turnOrder: this.turnOrder,
      board: this.board,
      players: this.publicPlayers(),
      revealedRules: Array.from(this.revealedRules.values()),
      pendingReveal: reveal,
      lastEvent: this.lastEvent,
      finalRanking: this.finalRanking,
      hiddenRulesActive: this.hiddenRulesActive(),
    };
  }

  private privateFor(p: InternalPlayer): PlayerPrivate {
    const targets = this.moveAnotherTargetsByPlayer.get(p.id) ?? [];
    return {
      orientation: p.orientation,
      mustReorient: p.mustReorient,
      moveAnotherTargets: targets,
      bonusPending: p.bonusPending,
      notes: p.notes,
    };
  }
}

// helper exports (used by tests and by the cpu module)
export { previewTops, DIR_DELTAS, squareAt };
