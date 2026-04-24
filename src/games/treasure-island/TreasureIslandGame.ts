// Treasure Island — multi-round auction + exploration game.
//
// Phase machine:
//   waiting → auction (R1) → auction-reveal → auction (R2) → ...
//                          → exploration (R4) → exploration-reveal → ...
//                          → ... → finished (after R9 or treasure found)
//
// Round mapping (from spec):
//   auction:      1, 2, 3, 5, 7
//   exploration:  4, 6, 8, 9
//
// State invariants:
//   - getStateForPlayer() never reveals other players' bids or hints.
//   - treasure-found short-circuits the rest of the rounds via finish().
//   - phase timer is owned by the game (setPhase). socket handler reads
//     phaseDeadline for the public timer.

import type { GameInterface, GameState, PlayerAction, PlayerState } from '../GameInterface.js';
import {
  AUCTION_ROUNDS,
  EXPLORATION_ROUNDS,
  PEEK_PIECE_COST,
  PHASE_DURATIONS,
  STARTING_ARROWS,
  STARTING_CHIPS,
  STARTING_PIECES,
  TOTAL_ROUNDS,
  TREASURE_STEAL_TOTAL,
} from './types.js';
import type {
  ArrowDef,
  ArrowOffer,
  AuctionResult,
  BoardLayout,
  BoxDef,
  OpenedBox,
  PlacedArrow,
  PlayerPath,
  PlayerPrivate,
  PlayerPublic,
  TreasureIslandPhase,
  TreasureIslandPublicState,
  TreasureIslandStateForPlayer,
} from './types.js';
import { buildBoard, buildBoxByCell, idx } from './board.js';
import { generateAuctionOffers, resolveAuction, type BidEntry } from './auction.js';
import { boxesReachedByPath, validatePath, type ValidatedArrow } from './paths.js';

interface InternalPlayer {
  id: string;
  name: string;
  isConnected: boolean;
  pieces: number;
  chips: number;
  vp: number;
  arrowIds: string[];
  // current bid this round, locked at submission
  currentBid: { arrowId: string; chips: number }[] | null;
  hints: string[];
  // path placed this exploration round (ValidatedArrow carries traversed cells
  // used internally to award boxes; we emit only PlacedArrow fields publicly)
  currentPath: ValidatedArrow[] | null;
  hasSubmittedPath: boolean;
  hasSubmittedBid: boolean;
}

export interface TreasureIslandPieceDelta {
  playerId: string;
  amount: number;
}

export class TreasureIslandGame implements GameInterface {
  readonly gameId: string;
  private players: Map<string, InternalPlayer> = new Map();
  private playerOrder: string[] = []; // join order; turn order during exploration
  private board: BoardLayout = buildBoard();
  private phase: TreasureIslandPhase = 'waiting';
  private round = 0;
  private phaseDeadline: number | null = null;
  private phaseTimer: NodeJS.Timeout | null = null;
  private gameStarted = false;
  // arrows in play this game (id → def). populated by auctions.
  private arrowDefs: Map<string, ArrowDef> = new Map();
  // current auction offers
  private auctionOffers: ArrowOffer[] | null = null;
  // last auction's results (for the reveal phase)
  private lastAuctionResults: AuctionResult[] | null = null;
  // arrow id counter
  private nextArrowSeq = 1;
  private openedBoxes: OpenedBox[] = [];
  private ruleLog: string[] = [
    'Each arrow must start AND end at a red dot.',
  ];
  private hiddenRuleDiscovered = false;
  private treasureFinderId: string | null = null;
  private treasureSteals: { fromPlayerId: string; amount: number }[] | null = null;
  private testMode: boolean;

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
      treasureIsland: this.publicState(),
    };
  }

  getStateForPlayer(playerId: string): GameState {
    const me = this.players.get(playerId);
    const stateForPlayer: TreasureIslandStateForPlayer = {
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
      status:
        this.phase === 'waiting' ? 'waiting' : this.phase === 'finished' ? 'finished' : 'in_progress',
      treasureIsland: stateForPlayer,
    };
  }

  addPlayer(playerId: string, playerName: string): boolean {
    if (this.players.has(playerId)) return false;
    if (this.players.size >= 10) return false;
    if (this.gameStarted) return false;
    this.players.set(playerId, this.freshPlayer(playerId, playerName));
    this.playerOrder.push(playerId);
    return true;
  }

  removePlayer(playerId: string): void {
    const p = this.players.get(playerId);
    if (p) p.isConnected = false;
  }

  handleAction(playerId: string, action: PlayerAction): GameState {
    const player = this.players.get(playerId);
    if (!player) throw new Error('player not in game');
    switch (action.type) {
      case 'treasure/bid':
        this.handleBid(player, action.payload as { allocations: { arrowId: string; chips: number }[] });
        break;
      case 'treasure/place-path':
        this.handlePlacePath(
          player,
          action.payload as {
            arrows: { arrowId: string; fromIdx: number; toIdx: number }[];
          },
        );
        break;
      case 'treasure/peek':
        this.handlePeek(player, action.payload as { boxId: string });
        break;
      case 'treasure/steal':
        this.handleSteal(
          player,
          action.payload as { allocations: { fromPlayerId: string; amount: number }[] },
        );
        break;
      default:
        throw new Error(`unknown action ${action.type}`);
    }
    return this.getState();
  }

  isFull(): boolean {
    return this.players.size >= 10;
  }

  hasStarted(): boolean {
    return this.gameStarted;
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  // spec is min 6 players; for first-playable / test mode allow 2.
  start(_playerId: string): boolean {
    if (this.gameStarted) return false;
    const minPlayers = this.testMode ? 2 : 2;
    if (this.players.size < minPlayers) return false;
    this.gameStarted = true;
    this.beginRound(1);
    return true;
  }

  destroy(): void {
    this.clearTimer();
  }

  skipPhase(): void {
    if (this.phase === 'waiting' || this.phase === 'finished') return;
    this.clearTimer();
    this.advanceFromPhase(this.phase);
  }

  // session-level piece ledger surfaced to the lobby (parity with remove-one)
  getPieceDeltas(): TreasureIslandPieceDelta[] {
    return Array.from(this.players.values()).map((p) => ({
      playerId: p.id,
      amount: p.pieces - STARTING_PIECES,
    }));
  }

  // --- action handlers ---

  private handleBid(
    player: InternalPlayer,
    payload: { allocations: { arrowId: string; chips: number }[] },
  ): void {
    if (this.phase !== 'auction') throw new Error('not in auction phase');
    if (player.hasSubmittedBid) throw new Error('already submitted');
    const allocations = (payload.allocations ?? []).filter((a) => a.chips > 0);
    const offerIds = new Set((this.auctionOffers ?? []).map((o) => o.id));
    let total = 0;
    const seen = new Set<string>();
    for (const a of allocations) {
      if (!offerIds.has(a.arrowId)) throw new Error('arrow not on offer');
      if (seen.has(a.arrowId)) throw new Error('duplicate arrow allocation');
      if (!Number.isInteger(a.chips) || a.chips < 1) {
        throw new Error('each allocation must be at least 1 chip');
      }
      seen.add(a.arrowId);
      total += a.chips;
    }
    if (total > player.chips) throw new Error('not enough chips');
    player.currentBid = allocations.map((a) => ({ ...a }));
    player.hasSubmittedBid = true;
    this.maybeFinishAuction();
  }

  private handlePlacePath(
    player: InternalPlayer,
    payload: { arrows: { arrowId: string; fromIdx: number; toIdx: number }[] },
  ): void {
    if (this.phase !== 'exploration') throw new Error('not in exploration phase');
    if (player.hasSubmittedPath) throw new Error('path already submitted');
    const attempts = payload.arrows ?? [];
    // every arrow must belong to the player
    for (const a of attempts) {
      if (!player.arrowIds.includes(a.arrowId)) {
        throw new Error('arrow not in your inventory');
      }
    }
    const result = validatePath(attempts, {
      layout: this.board,
      arrowsById: this.arrowDefs,
      hiddenRuleUnlocked: this.hiddenRuleDiscovered,
    });
    if (!result.ok) throw new Error(result.reason ?? 'invalid path');
    if (result.unlocks && !this.hiddenRuleDiscovered) {
      this.hiddenRuleDiscovered = true;
      this.ruleLog.push(
        'Discovered: arrows may also be placed diagonally and across fences.',
      );
    }
    player.currentPath = result.arrows;
    player.hasSubmittedPath = true;
    this.maybeFinishExploration();
  }

  private handlePeek(player: InternalPlayer, payload: { boxId: string }): void {
    // peek is allowed during exploration only (between arrow placements).
    if (this.phase !== 'exploration' && this.phase !== 'auction') {
      throw new Error('peek not available in this phase');
    }
    const box = this.board.boxes.find((b) => b.id === payload.boxId);
    if (!box) throw new Error('unknown box');
    const opened = this.openedBoxes.find((o) => o.boxId === box.id);
    if (opened) {
      // refunded peek per spec edge case
      return;
    }
    if (player.pieces < PEEK_PIECE_COST) throw new Error('not enough pieces');
    player.pieces -= PEEK_PIECE_COST;
    player.hints.push(this.hintFor(box, /*opening*/ false));
  }

  private handleSteal(
    player: InternalPlayer,
    payload: { allocations: { fromPlayerId: string; amount: number }[] },
  ): void {
    if (this.treasureFinderId !== player.id) {
      throw new Error('only the treasure finder can steal');
    }
    if (this.treasureSteals !== null) throw new Error('steal already resolved');
    const allocations = payload.allocations ?? [];
    const total = allocations.reduce((s, a) => s + a.amount, 0);
    if (total !== TREASURE_STEAL_TOTAL) {
      throw new Error(`must distribute exactly ${TREASURE_STEAL_TOTAL} pieces`);
    }
    for (const a of allocations) {
      if (a.amount < 0) throw new Error('amounts must be non-negative');
      const target = this.players.get(a.fromPlayerId);
      if (!target || target.id === player.id) {
        throw new Error('invalid steal target');
      }
    }
    // apply (steals can take a player negative — pieces are a session ledger)
    for (const a of allocations) {
      const target = this.players.get(a.fromPlayerId);
      if (!target) continue;
      target.pieces -= a.amount;
      player.pieces += a.amount;
    }
    this.treasureSteals = allocations.map((a) => ({ ...a }));
    this.finish();
  }

  // --- engine internals ---

  private freshPlayer(id: string, name: string): InternalPlayer {
    // grant the starting arrow(s). registered as a free length-2 arrow per
    // player so they have something to place during the first exploration round.
    const starterArrows: string[] = [];
    for (let i = 0; i < STARTING_ARROWS; i += 1) {
      const aid = `arr-start-${id}-${i}`;
      this.arrowDefs.set(aid, { id: aid, length: 2 });
      starterArrows.push(aid);
    }
    return {
      id,
      name,
      isConnected: true,
      pieces: STARTING_PIECES,
      chips: STARTING_CHIPS,
      vp: 0,
      arrowIds: starterArrows,
      currentBid: null,
      hints: [],
      currentPath: null,
      hasSubmittedPath: false,
      hasSubmittedBid: false,
    };
  }

  private beginRound(round: number): void {
    this.round = round;
    if ((AUCTION_ROUNDS as readonly number[]).includes(round)) {
      this.beginAuctionRound();
    } else if ((EXPLORATION_ROUNDS as readonly number[]).includes(round)) {
      this.beginExplorationRound();
    } else {
      // shouldn't happen unless rounds mapping changes
      this.finish();
    }
  }

  private beginAuctionRound(): void {
    this.lastAuctionResults = null;
    this.auctionOffers = generateAuctionOffers(this.round, this.nextArrowSeq);
    this.nextArrowSeq += this.auctionOffers.length;
    for (const offer of this.auctionOffers) {
      this.arrowDefs.set(offer.id, { id: offer.id, length: offer.length });
    }
    for (const p of this.players.values()) {
      p.currentBid = null;
      p.hasSubmittedBid = false;
    }
    this.setPhase('auction');
  }

  private beginExplorationRound(): void {
    this.auctionOffers = null;
    this.lastAuctionResults = null;
    for (const p of this.players.values()) {
      p.currentPath = null;
      p.hasSubmittedPath = false;
    }
    this.setPhase('exploration');
  }

  private maybeFinishAuction(): void {
    if (this.everyoneSubmittedBids()) {
      this.clearTimer();
      this.resolveCurrentAuction();
    }
  }

  private maybeFinishExploration(): void {
    if (this.everyoneSubmittedPaths()) {
      this.clearTimer();
      this.resolveCurrentExploration();
    }
  }

  private everyoneSubmittedBids(): boolean {
    for (const p of this.players.values()) {
      if (!p.isConnected) continue;
      if (!p.hasSubmittedBid) return false;
    }
    return true;
  }

  private everyoneSubmittedPaths(): boolean {
    for (const p of this.players.values()) {
      if (!p.isConnected) continue;
      if (!p.hasSubmittedPath) return false;
    }
    return true;
  }

  private resolveCurrentAuction(): void {
    if (!this.auctionOffers) return;
    // missing bids count as no allocation
    const bids: BidEntry[] = [];
    for (const p of this.players.values()) {
      if (!p.currentBid) continue;
      for (const a of p.currentBid) {
        bids.push({ playerId: p.id, arrowId: a.arrowId, chips: a.chips });
      }
    }
    const bidders = Array.from(this.players.values()).map((p) => ({
      playerId: p.id,
      pieces: p.pieces,
    }));
    const out = resolveAuction({ offers: this.auctionOffers, bids, bidders });
    for (const [pid, spent] of out.chipsSpent.entries()) {
      const player = this.players.get(pid);
      if (player) player.chips = Math.max(0, player.chips - spent);
    }
    for (const [pid, won] of out.arrowsWon.entries()) {
      const player = this.players.get(pid);
      if (player) player.arrowIds.push(...won);
    }
    this.lastAuctionResults = out.results;
    this.setPhase('auction-reveal');
  }

  private resolveCurrentExploration(): void {
    // turn order: playerOrder[]. award boxes to the first player (in order)
    // whose path traverses each box. mutual paths: same arrowIndex tiebreak by
    // player order in playerOrder.
    const opened = new Set(this.openedBoxes.map((o) => o.boxId));
    const boxByCell = buildBoxByCell(this.board);
    let treasureOpener: string | null = null;
    for (const pid of this.playerOrder) {
      const player = this.players.get(pid);
      if (!player) continue;
      const arrows = player.currentPath ?? [];
      const reaches = boxesReachedByPath(arrows, this.board);
      for (const r of reaches) {
        if (opened.has(r.boxId)) continue;
        const box = this.board.boxes.find((b) => b.id === r.boxId);
        if (!box) continue;
        opened.add(box.id);
        player.vp += box.vp;
        player.hints.push(this.hintFor(box, true));
        const opening: OpenedBox = {
          boxId: box.id,
          openerId: player.id,
          vp: box.vp,
          isTreasure: box.isTreasure,
        };
        this.openedBoxes.push(opening);
        if (box.isTreasure) {
          treasureOpener = player.id;
        }
        // unused arrow tracker ignored for first-playable; arrows are already
        // confined to one path per round per spec
        void boxByCell;
      }
    }
    this.setPhase('exploration-reveal');
    if (treasureOpener) {
      this.treasureFinderId = treasureOpener;
      // we don't auto-finish — wait for the treasure/steal action. but if the
      // round timer expires the engine moves on (in case opener disconnects).
    }
  }

  private setPhase(phase: TreasureIslandPhase): void {
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

  private advanceFromPhase(from: TreasureIslandPhase): void {
    switch (from) {
      case 'auction':
        // auto-treat missing bids as zero allocations
        for (const p of this.players.values()) {
          if (!p.hasSubmittedBid) p.currentBid = [];
        }
        this.resolveCurrentAuction();
        break;
      case 'auction-reveal':
        this.nextRoundOrFinish();
        break;
      case 'exploration':
        for (const p of this.players.values()) {
          if (!p.hasSubmittedPath) p.currentPath = [];
        }
        this.resolveCurrentExploration();
        break;
      case 'exploration-reveal':
        // if treasure was found and steals haven't been allocated, auto-allocate
        if (this.treasureFinderId && this.treasureSteals === null) {
          this.autoAllocateSteals();
        }
        this.nextRoundOrFinish();
        break;
      default:
        break;
    }
  }

  private autoAllocateSteals(): void {
    const finder = this.players.get(this.treasureFinderId ?? '');
    if (!finder) return;
    const others = Array.from(this.players.values()).filter((p) => p.id !== finder.id);
    if (others.length === 0) {
      this.treasureSteals = [];
      this.finish();
      return;
    }
    others.sort((a, b) => b.pieces - a.pieces);
    const allocations: { fromPlayerId: string; amount: number }[] = [];
    let remaining = TREASURE_STEAL_TOTAL;
    for (const o of others) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Math.max(1, Math.floor(remaining / others.length)));
      allocations.push({ fromPlayerId: o.id, amount: take });
      remaining -= take;
    }
    if (remaining > 0 && allocations.length > 0) {
      allocations[0].amount += remaining;
    }
    for (const a of allocations) {
      const target = this.players.get(a.fromPlayerId);
      if (!target) continue;
      target.pieces -= a.amount;
      finder.pieces += a.amount;
    }
    this.treasureSteals = allocations;
  }

  private nextRoundOrFinish(): void {
    if (this.treasureFinderId && this.treasureSteals !== null) {
      this.finish();
      return;
    }
    if (this.round >= TOTAL_ROUNDS) {
      this.finish();
    } else {
      this.beginRound(this.round + 1);
    }
  }

  private finish(): void {
    // apply VP-based piece scoring (spec table)
    for (const p of this.players.values()) {
      const vp = p.vp;
      let delta = 0;
      if (vp >= 41) delta = 2;
      else if (vp >= 31) delta = 1;
      else if (vp >= 21) delta = 0;
      else if (vp >= 11) delta = -1;
      else delta = -2;
      p.pieces += delta;
    }
    this.setPhase('finished');
  }

  // --- view helpers ---

  private hintFor(box: BoxDef, opening: boolean): string {
    const treasureBox = this.board.boxes.find((b) => b.isTreasure);
    if (!treasureBox) return 'No hint available.';
    if (box.isTreasure) return 'You opened the Treasure Chest!';
    const dx = treasureBox.x - box.x;
    const dy = treasureBox.y - box.y;
    const compass: string[] = [];
    if (dy < 0) compass.push('north');
    else if (dy > 0) compass.push('south');
    if (dx > 0) compass.push('east');
    else if (dx < 0) compass.push('west');
    const dir = compass.length === 0 ? 'right here' : compass.join('-');
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    const verb = opening ? 'Opened' : 'Peeked';
    return `${verb} ${box.id}: treasure lies ${dist} step(s) to the ${dir}.`;
  }

  private publicPlayerStates(): PlayerState[] {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isConnected: p.isConnected,
    }));
  }

  private publicState(): TreasureIslandPublicState {
    const players: PlayerPublic[] = Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isConnected: p.isConnected,
      vp: p.vp,
      pieces: p.pieces,
      arrowCount: p.arrowIds.length,
      chipCount: p.chips,
      hasSubmitted: this.phase === 'auction' ? p.hasSubmittedBid : p.hasSubmittedPath,
    }));
    // public exploration paths: only show submitted players' paths during
    // exploration phases (post-submit) and reveal.
    const explorationPaths: PlayerPath[] = [];
    if (this.phase === 'exploration' || this.phase === 'exploration-reveal') {
      for (const pid of this.playerOrder) {
        const player = this.players.get(pid);
        if (!player || !player.currentPath) continue;
        if (!player.hasSubmittedPath) continue;
        // strip cellsTraversed from the public payload (internal-only field)
        const arrows: PlacedArrow[] = player.currentPath.map((a) => ({
          arrowId: a.arrowId,
          fromIdx: a.fromIdx,
          toIdx: a.toIdx,
          diagonal: a.diagonal,
          crossesFence: a.crossesFence,
        }));
        explorationPaths.push({ playerId: player.id, arrows });
      }
    }
    // public auction offers visible during auction + auction-reveal
    const auctionOffers =
      this.phase === 'auction' || this.phase === 'auction-reveal' ? this.auctionOffers : null;
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: TOTAL_ROUNDS,
      phaseDeadline: this.phaseDeadline,
      board: this.board,
      players,
      auctionOffers,
      lastAuctionResults: this.phase === 'auction-reveal' ? this.lastAuctionResults : null,
      explorationPaths,
      openedBoxes: this.openedBoxes.map((o) => ({ ...o })),
      ruleLog: [...this.ruleLog],
      hiddenRuleDiscovered: this.hiddenRuleDiscovered,
      treasureFinderId: this.treasureFinderId,
      treasureSteals: this.treasureSteals ? this.treasureSteals.map((s) => ({ ...s })) : null,
    };
  }

  private privateFor(p: InternalPlayer): PlayerPrivate {
    return {
      arrowIds: [...p.arrowIds],
      currentBid: p.currentBid ? p.currentBid.map((a) => ({ ...a })) : null,
      hints: [...p.hints],
    };
  }
}

// stable index helper used externally if needed
export { idx };
