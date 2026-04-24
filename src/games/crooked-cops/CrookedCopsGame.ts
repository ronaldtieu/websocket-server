// Crooked Cops — social deduction on a subway graph.
//
// Phase machine:
//   waiting
//     → thief-phase (each thief moves up to 2 edges)
//       → police-phase (each cop moves 1 edge then chooses Investigate/Arrest)
//         → arrest-resolution (briefly surfaces any arrest banner)
//           → checkpoint  (only at rounds 5 and 10 — reveals piece total)
//             → thief-phase (next round)
//           → thief-phase (next round, no checkpoint)
//   ... up to MAX_ROUNDS ...
//   → whistleblower-vote (each police team votes on its crooked cop)
//     → finished
//
// Role assignment is deterministic-by-shuffle: at start(), 2 thieves are
// picked at random, the rest are split into 2 or 3 cop teams (see
// assignRoles), and 2 of those cops are flagged as crooked across two
// distinct teams.
//
// State filtering is the load-bearing piece: getStateForPlayer strips
// piece locations / role identities / thief positions per the visibility
// table in GAMES_SPEC.md §3.3.

import type { GameInterface, GameState, PlayerAction, PlayerState } from '../GameInterface.js';
import { bfsDistance, getSubwayGraph, nodesWithin } from './graph.js';
import {
  CHECKPOINT_ROUNDS,
  COP_MAX_STEPS,
  MAX_ROUNDS,
  PHASE_DURATIONS,
  PIECES_TO_WIN,
  THIEF_MAX_STEPS,
  type CrookedCopsPhase,
  type CrookedCopsStateForPlayer,
  type GameOutcome,
  type InvestigationResult,
  type NodeId,
  type PlayerPublic,
  type PrivateView,
  type PublicState,
  type RadioMessage,
  type Role,
  type SubwayGraph,
  type TeamColor,
  type VoteResult,
} from './types.js';

interface InternalPlayer {
  id: string;
  name: string;
  isConnected: boolean;
  role: Role;
  team: TeamColor | null;
  node: NodeId | null;
  // Thief: nodes the thief stepped through this round (used by Investigate).
  // Cleared at the start of each thief phase.
  passedThisRound: NodeId[];
  // Whether thief is sitting out this round (after a successful arrest).
  arrestedThisRound: boolean;
  // Whether the player has submitted their move this phase.
  hasMoved: boolean;
  // Cop: whether they've taken their action (investigate/arrest) this phase.
  hasActed: boolean;
  // Cop's last investigation result this round.
  lastInvestigation: InvestigationResult | null;
  // Crooked cop's private feed (system pings about thief moves).
  privatePings: Array<{ round: number; text: string; ts: number }>;
  // Whistleblower vote — set during whistleblower-vote phase.
  vote: string | null;
}

const TEAM_ORDER: TeamColor[] = ['red', 'blue', 'green'];

export class CrookedCopsGame implements GameInterface {
  readonly gameId: string;
  private players: Map<string, InternalPlayer> = new Map();
  private phase: CrookedCopsPhase = 'waiting';
  private round = 0;
  private piecesRemaining: Set<NodeId>;
  private piecesCollected = 0;
  private graph: SubwayGraph;
  private phaseDeadline: number | null = null;
  private phaseTimer: NodeJS.Timeout | null = null;
  private gameStarted = false;
  private radio: RadioMessage[] = [];
  private lastArrest: PublicState['lastArrest'] = null;
  private outcome: GameOutcome | null = null;
  private pieceAwards: Array<{ playerId: string; amount: number }> = [];
  private testMode: boolean;

  // Set by the socket handler after construction.
  onPhaseChange: (() => void) | null = null;

  constructor(gameId: string, opts: { testMode?: boolean } = {}) {
    this.gameId = gameId;
    this.testMode = Boolean(opts.testMode);
    this.graph = getSubwayGraph();
    this.piecesRemaining = new Set(this.graph.pieceNodes);
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
      crookedCops: this.publicState(null),
    };
  }

  getStateForPlayer(playerId: string): GameState {
    const me = this.players.get(playerId);
    return {
      players: this.publicPlayerStates(),
      status:
        this.phase === 'waiting'
          ? 'waiting'
          : this.phase === 'finished'
            ? 'finished'
            : 'in_progress',
      crookedCops: this.publicState(me ?? null),
    };
  }

  addPlayer(playerId: string, playerName: string): boolean {
    if (this.players.has(playerId)) return false;
    if (this.players.size >= 14) return false;
    if (this.gameStarted) return false;
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      isConnected: true,
      role: 'cop',
      team: null,
      node: null,
      passedThisRound: [],
      arrestedThisRound: false,
      hasMoved: false,
      hasActed: false,
      lastInvestigation: null,
      privatePings: [],
      vote: null,
    });
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
      case 'crooked-cops/move':
        this.handleMove(player, (action.payload as { toNode: NodeId }).toNode);
        break;
      case 'crooked-cops/investigate':
        this.handleInvestigate(player, (action.payload as { node: NodeId }).node);
        break;
      case 'crooked-cops/arrest':
        this.handleArrest(player, (action.payload as { targetNode: NodeId }).targetNode);
        break;
      case 'crooked-cops/radio':
        this.handleRadio(player, action.payload as { team: TeamColor; text: string });
        break;
      case 'crooked-cops/vote':
        this.handleVote(player, (action.payload as { suspectId: string }).suspectId);
        break;
      default:
        throw new Error(`unknown action ${action.type}`);
    }
    return this.getState();
  }

  isFull(): boolean {
    return this.players.size >= 14;
  }

  hasStarted(): boolean {
    return this.gameStarted;
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  start(_playerId: string): boolean {
    if (this.gameStarted) return false;
    if (this.players.size < 2) return false;
    this.gameStarted = true;
    this.assignRoles();
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

  // --- session-level piece ledger (parity with RemoveOne) ---

  getPieceDeltas(): Array<{ playerId: string; amount: number; eliminated: boolean }> {
    return this.pieceAwards.map((a) => ({
      playerId: a.playerId,
      amount: a.amount,
      eliminated: false,
    }));
  }

  // --- internals: role assignment ---

  // Splits the player list into:
  //   2 thieves
  //   N cops, partitioned across 2 or 3 teams as evenly as possible
  //   2 of those cops flagged crooked, in two distinct teams
  // Scaling: 9 players → 2 thieves + 7 cops in 2 teams (e.g. 4/3).
  //          14 players → 2 thieves + 12 cops in 3 teams of 4. Spec sweet spot.
  private assignRoles(): void {
    const ids = Array.from(this.players.keys());
    const shuffled = [...ids].sort(() => Math.random() - 0.5);
    const total = shuffled.length;

    // Below 4 players we can't split into a thief + a team — just hand out
    // cops with one thief so test runs don't crash.
    const numThieves = total >= 4 ? 2 : 1;
    const thiefIds = shuffled.slice(0, numThieves);
    const copIds = shuffled.slice(numThieves);

    // Decide team count. With <=8 cops we use 2 teams; with 9+ use 3.
    const teamCount = copIds.length >= 9 ? 3 : copIds.length >= 4 ? 2 : 1;
    const teams: TeamColor[] = TEAM_ORDER.slice(0, teamCount);

    // Round-robin assign cops to teams so sizes are within ±1.
    const teamMembers: Record<TeamColor, string[]> = { red: [], blue: [], green: [] };
    copIds.forEach((id, i) => {
      const t = teams[i % teamCount];
      teamMembers[t].push(id);
    });

    // Pick 2 crooked cops in 2 distinct teams (when only 1 team exists,
    // fall back to 1 crooked cop — keeps small-game test runs sensible).
    const crookedTeamCount = Math.min(2, teamCount);
    const crookedTeams = [...teams].sort(() => Math.random() - 0.5).slice(0, crookedTeamCount);
    const crookedIds: string[] = [];
    for (const t of crookedTeams) {
      const pool = teamMembers[t];
      if (pool.length === 0) continue;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      crookedIds.push(pick);
    }

    // Apply roles + initial positions.
    for (const tid of thiefIds) {
      const p = this.players.get(tid)!;
      p.role = 'thief';
      p.team = null;
      p.node = this.randomFreeNode();
    }
    for (const t of teams) {
      for (const cid of teamMembers[t]) {
        const p = this.players.get(cid)!;
        p.role = crookedIds.includes(cid) ? 'crooked-cop' : 'cop';
        p.team = t;
        p.node = this.randomFreeNode();
      }
    }
  }

  private randomFreeNode(): NodeId {
    // Don't worry about collisions at start — multiple players can share
    // a node initially. Keeps the spawn step trivial.
    const all = this.graph.nodes;
    return all[Math.floor(Math.random() * all.length)];
  }

  // --- internals: phase machine ---

  private beginRound(round: number): void {
    this.round = round;
    this.lastArrest = null;
    for (const p of this.players.values()) {
      p.hasMoved = false;
      p.hasActed = false;
      p.lastInvestigation = null;
      // Thieves who were sitting out come back in at the next round.
      p.arrestedThisRound = false;
      p.passedThisRound = p.node ? [p.node] : [];
    }
    this.setPhase('thief-phase');
  }

  private setPhase(phase: CrookedCopsPhase): void {
    this.phase = phase;
    this.clearTimer();
    if (phase === 'waiting' || phase === 'finished') {
      this.phaseDeadline = null;
    } else {
      const duration = this.scaleDuration(PHASE_DURATIONS[phase]);
      this.phaseDeadline = Date.now() + duration;
      this.phaseTimer = setTimeout(() => this.advanceFromPhase(phase), duration);
    }
    this.onPhaseChange?.();
  }

  private scaleDuration(ms: number): number {
    return this.testMode ? Math.max(3_000, Math.floor(ms / 3)) : ms;
  }

  private clearTimer(): void {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  private advanceFromPhase(from: CrookedCopsPhase): void {
    switch (from) {
      case 'thief-phase':
        // Thieves who didn't move just hold position.
        this.setPhase('police-phase');
        break;
      case 'police-phase':
        // Cops who didn't act just hold and skip their action.
        this.setPhase('arrest-resolution');
        break;
      case 'arrest-resolution':
        this.afterArrestResolution();
        break;
      case 'checkpoint':
        this.afterCheckpoint();
        break;
      case 'whistleblower-vote':
        this.tallyVotes();
        this.finalizePieceAwards();
        this.setPhase('finished');
        break;
      default:
        break;
    }
  }

  private afterArrestResolution(): void {
    // Win checks first (thieves may have crossed 12 pieces this round).
    if (this.piecesCollected >= PIECES_TO_WIN) {
      this.outcome = {
        winner: 'thieves',
        piecesCollected: this.piecesCollected,
        voteResults: [],
      };
      this.setPhase('whistleblower-vote');
      return;
    }
    const liveThieves = this.activeThieves();
    if (liveThieves.length === 0) {
      // both arrested → police win
      this.outcome = {
        winner: 'police',
        piecesCollected: this.piecesCollected,
        voteResults: [],
      };
      this.setPhase('whistleblower-vote');
      return;
    }
    if (CHECKPOINT_ROUNDS.includes(this.round)) {
      this.setPhase('checkpoint');
      return;
    }
    this.nextRoundOrTimeout();
  }

  private afterCheckpoint(): void {
    this.nextRoundOrTimeout();
  }

  private nextRoundOrTimeout(): void {
    if (this.round >= MAX_ROUNDS) {
      const winner: 'timeout-thieves' | 'timeout-police' =
        this.piecesCollected >= 6 ? 'timeout-thieves' : 'timeout-police';
      this.outcome = {
        winner,
        piecesCollected: this.piecesCollected,
        voteResults: [],
      };
      this.setPhase('whistleblower-vote');
      return;
    }
    this.beginRound(this.round + 1);
  }

  // --- action handlers ---

  private handleMove(player: InternalPlayer, toNode: NodeId): void {
    if (player.arrestedThisRound) throw new Error('arrested this round');
    if (!this.graph.adjacency[toNode]) throw new Error('unknown node');

    if (player.role === 'thief') {
      if (this.phase !== 'thief-phase') throw new Error('not in thief phase');
      if (!player.node) throw new Error('thief has no position');
      const reachable = nodesWithin(this.graph, player.node, THIEF_MAX_STEPS);
      if (!reachable.includes(toNode)) throw new Error('node out of range');
      // Thief cannot end their turn on a cop-occupied node.
      const copOccupied = this.copNodes();
      if (copOccupied.has(toNode)) throw new Error('cop on that node');
      // Walk path along BFS to log passed-through nodes (collect pieces along the way).
      const path = this.shortestPath(player.node, toNode);
      // Collect pieces on each intermediate node (and destination).
      for (const step of path.slice(1)) {
        if (this.piecesRemaining.has(step)) {
          this.piecesRemaining.delete(step);
          this.piecesCollected += 1;
        }
      }
      player.passedThisRound = path;
      player.node = toNode;
      player.hasMoved = true;
      // Notify crooked cops privately.
      this.pingCrookedCops(player, path);
      this.maybeAdvanceFromThiefPhase();
    } else {
      // cops
      if (this.phase !== 'police-phase') throw new Error('not in police phase');
      if (player.hasMoved) throw new Error('already moved');
      if (!player.node) throw new Error('cop has no position');
      const reachable = nodesWithin(this.graph, player.node, COP_MAX_STEPS);
      if (!reachable.includes(toNode)) throw new Error('node out of range');
      player.node = toNode;
      player.hasMoved = true;
      // No auto-advance — cop must still take an action (investigate or arrest)
      // OR phase timer will trigger.
    }
  }

  private handleInvestigate(player: InternalPlayer, node: NodeId): void {
    if (this.phase !== 'police-phase') throw new Error('not in police phase');
    if (player.role !== 'cop' && player.role !== 'crooked-cop') throw new Error('only cops investigate');
    if (player.hasActed) throw new Error('already acted');
    if (!player.node) throw new Error('cop has no position');
    if (player.node !== node) throw new Error('must investigate your own node');
    const thiefPassed = this.didThiefPass(node);
    player.lastInvestigation = { round: this.round, node, thiefPassed };
    player.hasActed = true;
    this.maybeAdvanceFromPolicePhase();
  }

  private handleArrest(player: InternalPlayer, targetNode: NodeId): void {
    if (this.phase !== 'police-phase') throw new Error('not in police phase');
    if (player.role !== 'cop' && player.role !== 'crooked-cop') throw new Error('only cops arrest');
    if (player.hasActed) throw new Error('already acted');
    if (!player.node) throw new Error('cop has no position');
    // Valid arrest target: cop's own node OR adjacent node.
    const valid = targetNode === player.node || (this.graph.adjacency[player.node] ?? []).includes(targetNode);
    if (!valid) throw new Error('arrest target not in range');

    // Find a thief on the target node.
    const thiefHere = Array.from(this.players.values()).find(
      (p) => p.role === 'thief' && !p.arrestedThisRound && p.node === targetNode,
    );

    const nullified = player.role === 'crooked-cop';
    let arrestedThiefId: string | null = null;

    if (thiefHere && !nullified) {
      thiefHere.arrestedThisRound = true;
      // Confiscate any pieces collected this round by this thief: the spec
      // says pieces collected this round are confiscated. We track per-round
      // collection by counting piece transitions on passedThisRound nodes
      // that intersect with the original piece-bearing set; simplest model
      // is to re-add nothing back to the board (pieces are already gone),
      // but reduce the piecesCollected counter by the pieces this thief
      // passed through this round. We don't have a per-thief counter, so
      // approximate by iterating the thief's path and counting how many
      // piece-nodes they passed (we removed the pieces optimistically on
      // move; rolling them back to the board is the simplest faithful read).
      let recovered = 0;
      for (const n of thiefHere.passedThisRound) {
        if (this.graph.pieceNodes.includes(n) && !this.piecesRemaining.has(n)) {
          this.piecesRemaining.add(n);
          recovered += 1;
        }
      }
      this.piecesCollected = Math.max(0, this.piecesCollected - recovered);
      arrestedThiefId = thiefHere.id;
    }

    this.lastArrest = {
      by: player.id,
      byName: player.name,
      targetNode,
      success: Boolean(thiefHere) && !nullified,
      nullifiedByCrookedCop: Boolean(thiefHere) && nullified,
      arrestedThiefId,
    };
    player.hasActed = true;
    this.maybeAdvanceFromPolicePhase();
  }

  private handleRadio(player: InternalPlayer, payload: { team: TeamColor; text: string }): void {
    // Only cops on that team can broadcast (crooked cops too — they look like
    // ordinary cops to teammates).
    if (player.role !== 'cop' && player.role !== 'crooked-cop') {
      throw new Error('only cops use radio');
    }
    if (player.team !== payload.team) throw new Error('wrong team');
    const text = String(payload.text ?? '').slice(0, 200);
    if (!text) throw new Error('empty radio message');
    const msg: RadioMessage = {
      team: payload.team,
      from: player.id,
      fromName: player.name,
      text,
      ts: Date.now(),
    };
    this.radio.push(msg);
    // Cap radio log so getStateForPlayer doesn't bloat over time.
    if (this.radio.length > 200) this.radio.splice(0, this.radio.length - 200);
    this.onPhaseChange?.();
  }

  private handleVote(player: InternalPlayer, suspectId: string): void {
    if (this.phase !== 'whistleblower-vote') throw new Error('not in vote phase');
    if (player.role !== 'cop' && player.role !== 'crooked-cop') {
      throw new Error('only cops vote');
    }
    const suspect = this.players.get(suspectId);
    if (!suspect) throw new Error('unknown suspect');
    if (suspect.team !== player.team) throw new Error('can only vote within your team');
    player.vote = suspectId;
    this.maybeAdvanceFromVote();
  }

  // --- helpers ---

  private maybeAdvanceFromThiefPhase(): void {
    const needed = this.activeThieves();
    if (needed.every((t) => t.hasMoved)) {
      this.clearTimer();
      this.setPhase('police-phase');
    }
  }

  private maybeAdvanceFromPolicePhase(): void {
    // Once every cop has taken an action (moves are optional — a cop may
    // hold position and immediately investigate/arrest), advance.
    const cops = this.allCops();
    if (cops.every((c) => c.hasActed)) {
      this.clearTimer();
      this.setPhase('arrest-resolution');
    }
  }

  private maybeAdvanceFromVote(): void {
    const cops = this.allCops();
    if (cops.every((c) => c.vote !== null)) {
      this.clearTimer();
      this.tallyVotes();
      this.finalizePieceAwards();
      this.setPhase('finished');
    }
  }

  private didThiefPass(node: NodeId): boolean {
    return Array.from(this.players.values()).some(
      (p) => p.role === 'thief' && p.passedThisRound.includes(node),
    );
  }

  private pingCrookedCops(thief: InternalPlayer, path: NodeId[]): void {
    const ts = Date.now();
    const text = `Thief ${thief.name} moved through ${path.join(' → ')}`;
    for (const p of this.players.values()) {
      if (p.role !== 'crooked-cop') continue;
      p.privatePings.push({ round: this.round, text, ts });
      if (p.privatePings.length > 50) p.privatePings.splice(0, p.privatePings.length - 50);
    }
  }

  private copNodes(): Set<NodeId> {
    const set = new Set<NodeId>();
    for (const p of this.players.values()) {
      if ((p.role === 'cop' || p.role === 'crooked-cop') && p.node) set.add(p.node);
    }
    return set;
  }

  private activeThieves(): InternalPlayer[] {
    return Array.from(this.players.values()).filter(
      (p) => p.role === 'thief' && !p.arrestedThisRound && p.isConnected,
    );
  }

  private allCops(): InternalPlayer[] {
    return Array.from(this.players.values()).filter(
      (p) => (p.role === 'cop' || p.role === 'crooked-cop') && p.isConnected,
    );
  }

  // BFS shortest path (returns the full sequence of nodes including endpoints).
  private shortestPath(from: NodeId, to: NodeId): NodeId[] {
    if (from === to) return [from];
    const prev = new Map<NodeId, NodeId | null>();
    prev.set(from, null);
    const queue: NodeId[] = [from];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === to) break;
      for (const n of this.graph.adjacency[cur] ?? []) {
        if (prev.has(n)) continue;
        prev.set(n, cur);
        queue.push(n);
      }
    }
    if (!prev.has(to)) return [from];
    const path: NodeId[] = [];
    let step: NodeId | null = to;
    while (step !== null) {
      path.unshift(step);
      step = prev.get(step) ?? null;
    }
    return path;
  }

  private tallyVotes(): void {
    if (!this.outcome) return;
    const teams = new Set<TeamColor>();
    for (const p of this.players.values()) if (p.team) teams.add(p.team);

    const results: VoteResult[] = [];
    for (const team of teams) {
      const teamCops = this.allCops().filter((c) => c.team === team);
      const tallyMap = new Map<string, number>();
      for (const c of teamCops) {
        if (c.vote) tallyMap.set(c.vote, (tallyMap.get(c.vote) ?? 0) + 1);
      }
      let topId: string | null = null;
      let topVotes = 0;
      for (const [id, n] of tallyMap.entries()) {
        if (n > topVotes) {
          topVotes = n;
          topId = id;
        }
      }
      const suspect = topId ? this.players.get(topId) : null;
      const tally = teamCops.map((c) => ({
        playerId: c.id,
        playerName: c.name,
        votes: tallyMap.get(c.id) ?? 0,
      }));
      const caughtCrookedCop = suspect ? suspect.role === 'crooked-cop' : false;
      results.push({
        team,
        suspectId: suspect?.id ?? null,
        suspectName: suspect?.name ?? null,
        tally,
        caughtCrookedCop,
      });
    }
    this.outcome.voteResults = results;
  }

  private finalizePieceAwards(): void {
    if (!this.outcome) return;
    const awards: Array<{ playerId: string; amount: number }> = [];
    const winner = this.outcome.winner;

    if (winner === 'thieves' || winner === 'timeout-thieves') {
      // each thief +2, each crooked cop +1
      for (const p of this.players.values()) {
        if (p.role === 'thief') awards.push({ playerId: p.id, amount: 2 });
        else if (p.role === 'crooked-cop') awards.push({ playerId: p.id, amount: 1 });
      }
      // timeout split: linear scale below 6 pieces favors police, but
      // we still call it timeout-thieves at >=6. Police get nothing here.
    } else {
      // police win — ordinary cops on the arresting team(s) +1
      // Approximation: any team that successfully arrested gets +1 to its
      // ordinary cops. We track via lastArrest, but multiple arrests may
      // have happened. Simpler faithful model: every ordinary cop gets +1
      // when police win.
      for (const p of this.players.values()) {
        if (p.role === 'cop') awards.push({ playerId: p.id, amount: 1 });
      }
    }

    // Whistleblower bonuses: +1 extra to the team that correctly voted out
    // its crooked cop (per the spec).
    for (const result of this.outcome.voteResults) {
      if (!result.caughtCrookedCop) continue;
      for (const p of this.players.values()) {
        if (p.team === result.team && p.role === 'cop') {
          awards.push({ playerId: p.id, amount: 1 });
        }
      }
    }
    this.pieceAwards = awards;
  }

  // --- view helpers ---

  private publicPlayerStates(): PlayerState[] {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isConnected: p.isConnected,
    }));
  }

  private publicState(viewer: InternalPlayer | null): CrookedCopsStateForPlayer {
    const viewerRole = viewer?.role ?? null;
    const viewerKnowsThiefPositions = viewerRole === 'thief' || viewerRole === 'crooked-cop';

    const players: PlayerPublic[] = Array.from(this.players.values()).map((p) => {
      const isThief = p.role === 'thief';
      // Thief positions are public to thieves and crooked cops only. To everyone
      // else, thief node is hidden (null) — they show up as 'thief' on the
      // roster but their location is fog-of-war.
      const node = isThief && !viewerKnowsThiefPositions ? null : p.node;
      // Public role: thieves are publicly known; cops uniformly look like 'cop'.
      const publicRole: PlayerPublic['publicRole'] = isThief ? 'thief' : p.role === 'cop' || p.role === 'crooked-cop' ? 'cop' : 'spectator';
      return {
        id: p.id,
        name: p.name,
        isConnected: p.isConnected,
        publicRole,
        team: p.team,
        node,
        arrestedThisRound: isThief ? p.arrestedThisRound : undefined,
        hasActedThisPhase: this.phase === 'thief-phase' ? p.hasMoved : p.hasActed,
      };
    });

    // Piece counter is public only at checkpoint reveals or after game ends.
    const showPieces =
      this.phase === 'checkpoint' ||
      this.phase === 'finished' ||
      (this.outcome !== null && this.phase === 'whistleblower-vote');
    const publicPieceCount = showPieces ? this.piecesCollected : null;

    // Filter radio for the viewer's team (server keeps the full log).
    const radio = viewer?.team
      ? this.radio.filter((m) => m.team === viewer.team)
      : [];

    const me: PrivateView | null = viewer
      ? {
          playerId: viewer.id,
          role: viewer.role,
          team: viewer.team,
          visiblePieceNodes:
            viewer.role === 'thief' || viewer.role === 'crooked-cop'
              ? Array.from(this.piecesRemaining)
              : null,
          partnerId: this.partnerOf(viewer),
          partnerName: this.partnerNameOf(viewer),
          partnerNode: this.partnerNodeOf(viewer),
          privatePings: viewer.role === 'crooked-cop' ? [...viewer.privatePings] : [],
          lastInvestigation: viewer.lastInvestigation,
          hasVoted: viewer.vote !== null,
        }
      : null;

    return {
      phase: this.phase,
      round: this.round,
      totalRounds: MAX_ROUNDS,
      phaseDeadline: this.phaseDeadline,
      graph: this.graph,
      players,
      publicPieceCount,
      lastArrest: this.lastArrest,
      radio,
      outcome: this.outcome,
      pieceAwards: this.pieceAwards,
      me,
    };
  }

  private partnerOf(viewer: InternalPlayer): string | null {
    if (viewer.role === 'thief') {
      const partner = Array.from(this.players.values()).find(
        (p) => p.role === 'thief' && p.id !== viewer.id,
      );
      return partner?.id ?? null;
    }
    if (viewer.role === 'crooked-cop') {
      const partner = Array.from(this.players.values()).find(
        (p) => p.role === 'crooked-cop' && p.id !== viewer.id,
      );
      return partner?.id ?? null;
    }
    return null;
  }

  private partnerNameOf(viewer: InternalPlayer): string | null {
    const id = this.partnerOf(viewer);
    return id ? (this.players.get(id)?.name ?? null) : null;
  }

  private partnerNodeOf(viewer: InternalPlayer): string | null {
    const id = this.partnerOf(viewer);
    return id ? (this.players.get(id)?.node ?? null) : null;
  }
}
