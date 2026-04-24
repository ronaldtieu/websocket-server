// CPU driver for Crooked Cops. Per-role heuristics — no minimax.
//
// - Thief CPU: move toward highest-piece-density unvisited node, prefer
//   routes that avoid adjacent cops.
// - Ordinary Cop CPU: move toward recently-reported areas (from own team's
//   radio), investigate when landing on a plausible node.
// - Crooked Cop CPU: position to plausibly arrest a thief (auto-nullifies),
//   send misleading radio.
//
// pickWithDifficulty(legalMoves, bestMove, difficulty) wraps each pick:
// easy = often random, hard = tight role-specific play.

import type { CpuDriver } from '../registry.js';
import { pickWithDifficulty } from '../cpu/difficulty.js';
import { bfsDistance, nodesWithin } from './graph.js';
import type {
  CrookedCopsStateForPlayer,
  NodeId,
  PlayerPublic,
  PrivateView,
  SubwayGraph,
} from './types.js';

interface CpuView {
  crookedCops?: CrookedCopsStateForPlayer;
}

export const driveCrookedCopsCpus: CpuDriver = ({ game, cpuPlayerIds, difficulty, schedule }) => {
  for (const cpuId of cpuPlayerIds) {
    const view = game.getStateForPlayer?.(cpuId) as CpuView | undefined;
    const cc = view?.crookedCops;
    if (!cc?.me) continue;
    const me = cc.me;

    if (cc.phase === 'thief-phase' && me.role === 'thief') {
      driveThief(game, cpuId, cc, me, difficulty, schedule);
    } else if (cc.phase === 'police-phase') {
      if (me.role === 'cop') driveOrdinaryCop(game, cpuId, cc, me, difficulty, schedule);
      else if (me.role === 'crooked-cop') driveCrookedCop(game, cpuId, cc, me, difficulty, schedule);
    } else if (cc.phase === 'whistleblower-vote') {
      if (me.role === 'cop' || me.role === 'crooked-cop') {
        driveVote(game, cpuId, cc, me, difficulty, schedule);
      }
    }
  }
};

// --- thief ---

function driveThief(
  game: Parameters<CpuDriver>[0]['game'],
  cpuId: string,
  cc: CrookedCopsStateForPlayer,
  me: PrivateView,
  difficulty: Parameters<CpuDriver>[0]['difficulty'],
  schedule: Parameters<CpuDriver>[0]['schedule'],
): void {
  const myPlayer = cc.players.find((p) => p.id === cpuId);
  if (!myPlayer || !myPlayer.node) return;
  if (myPlayer.hasActedThisPhase) return;
  if (myPlayer.arrestedThisRound) return;

  const graph = cc.graph;
  const reachable = nodesWithin(graph, myPlayer.node, 2).filter((n) => n !== myPlayer.node);
  if (reachable.length === 0) return;

  // Cop positions for avoidance.
  const copNodes = new Set<NodeId>();
  for (const p of cc.players) {
    if (p.publicRole === 'cop' && p.node) copNodes.add(p.node);
  }

  // Filter out moves that land on a cop (illegal per game rules).
  const legal = reachable.filter((n) => !copNodes.has(n));
  if (legal.length === 0) return;

  const pieceSet = new Set(me.visiblePieceNodes ?? []);

  // Score each candidate: +pieces collected on the BFS-shortest path,
  // -penalty per adjacent-cop on destination.
  const scored = legal.map((n) => {
    let score = 0;
    // density — count pieces within 2 edges of the candidate node.
    const horizon = nodesWithin(graph, n, 2);
    for (const h of horizon) if (pieceSet.has(h)) score += 1;
    // direct-collect bonus for landing on a piece.
    if (pieceSet.has(n)) score += 3;
    // cop adjacency penalty.
    for (const adj of graph.adjacency[n] ?? []) {
      if (copNodes.has(adj)) score -= 2;
    }
    return { node: n, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].node;
  const choice = pickWithDifficulty(
    legal,
    best,
    difficulty,
  );

  schedule(() => {
    game.handleAction(cpuId, {
      type: 'crooked-cops/move',
      payload: { toNode: choice },
    });
  });
}

// --- ordinary cop ---

function driveOrdinaryCop(
  game: Parameters<CpuDriver>[0]['game'],
  cpuId: string,
  cc: CrookedCopsStateForPlayer,
  me: PrivateView,
  difficulty: Parameters<CpuDriver>[0]['difficulty'],
  schedule: Parameters<CpuDriver>[0]['schedule'],
): void {
  const myPlayer = cc.players.find((p) => p.id === cpuId);
  if (!myPlayer || !myPlayer.node) return;
  if (myPlayer.hasActedThisPhase) return;
  const graph = cc.graph;

  // Stage 1: pick move target. Hot-zone heuristic from team radio chatter.
  const hotNodes = inferHotNodesFromRadio(cc, graph);
  const reachable = nodesWithin(graph, myPlayer.node, 1);
  if (reachable.length === 0) return;

  let bestMove = reachable[0];
  let bestScore = -Infinity;
  for (const n of reachable) {
    let score = 0;
    for (const hot of hotNodes) {
      const d = bfsDistance(graph, n, hot);
      score += Math.max(0, 5 - d);
    }
    for (const tm of cc.players) {
      if (tm.id !== cpuId && tm.team === me.team && tm.node === n) score -= 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMove = n;
    }
  }
  const moveChoice = pickWithDifficulty(reachable, bestMove, difficulty);

  // Stage 2: action after move. Investigate own node by default.
  // (Ordinary cops can't see thieves, so arresting blindly is a coin flip.)
  schedule(() => {
    try {
      game.handleAction(cpuId, {
        type: 'crooked-cops/move',
        payload: { toNode: moveChoice },
      });
    } catch {
      // already moved or illegal — keep going to action attempt
    }
    try {
      game.handleAction(cpuId, {
        type: 'crooked-cops/investigate',
        payload: { node: moveChoice },
      });
    } catch {
      // ignore — phase may have advanced or we already acted
    }
    if (Math.random() < 0.4 && me.team) {
      try {
        game.handleAction(cpuId, {
          type: 'crooked-cops/radio',
          payload: { team: me.team, text: vagueRadio() },
        });
      } catch {
        /* ignore */
      }
    }
  });
}

// --- crooked cop ---

function driveCrookedCop(
  game: Parameters<CpuDriver>[0]['game'],
  cpuId: string,
  cc: CrookedCopsStateForPlayer,
  me: PrivateView,
  difficulty: Parameters<CpuDriver>[0]['difficulty'],
  schedule: Parameters<CpuDriver>[0]['schedule'],
): void {
  const myPlayer = cc.players.find((p) => p.id === cpuId);
  if (!myPlayer || !myPlayer.node || !me.team) return;
  if (myPlayer.hasActedThisPhase) return;
  const graph = cc.graph;

  // Crooked cops know thief positions (server includes them in this view).
  const thiefNodes = new Set<NodeId>();
  for (const p of cc.players) {
    if (p.publicRole === 'thief' && p.node) thiefNodes.add(p.node);
  }

  // Stage 1: move to a node adjacent (or equal) to a thief — that lets us
  // "arrest" (nullified) and block real cops from a clean takedown.
  const reachable = nodesWithin(graph, myPlayer.node, 1);
  if (reachable.length === 0) return;
  let bestMove = reachable[0];
  let bestScore = -Infinity;
  for (const n of reachable) {
    let score = 0;
    for (const t of thiefNodes) {
      const d = bfsDistance(graph, n, t);
      if (d === 0) score += 6;
      else if (d === 1) score += 4;
      else score += Math.max(0, 3 - d);
    }
    if (score > bestScore) {
      bestScore = score;
      bestMove = n;
    }
  }
  const moveChoice = pickWithDifficulty(reachable, bestMove, difficulty);

  // Stage 2: prefer arresting an actual thief (nullified — the disinfo win),
  // else investigate to keep cover.
  const reachableArrestTargets = [moveChoice, ...(graph.adjacency[moveChoice] ?? [])];
  const thiefAdjacent = reachableArrestTargets.find((n) => thiefNodes.has(n));
  const legalActions: Array<{ kind: 'investigate' | 'arrest'; node: NodeId }> = [
    { kind: 'investigate', node: moveChoice },
    ...reachableArrestTargets.map((n) => ({ kind: 'arrest' as const, node: n })),
  ];
  const bestAction: { kind: 'investigate' | 'arrest'; node: NodeId } = thiefAdjacent
    ? { kind: 'arrest', node: thiefAdjacent }
    : { kind: 'investigate', node: moveChoice };
  const actionChoice = pickWithDifficulty(legalActions, bestAction, difficulty);

  schedule(() => {
    try {
      game.handleAction(cpuId, {
        type: 'crooked-cops/move',
        payload: { toNode: moveChoice },
      });
    } catch {
      /* may have already moved */
    }
    try {
      if (actionChoice.kind === 'investigate') {
        game.handleAction(cpuId, {
          type: 'crooked-cops/investigate',
          payload: { node: actionChoice.node },
        });
      } else {
        game.handleAction(cpuId, {
          type: 'crooked-cops/arrest',
          payload: { targetNode: actionChoice.node },
        });
      }
    } catch {
      /* ignore */
    }
    try {
      game.handleAction(cpuId, {
        type: 'crooked-cops/radio',
        payload: { team: me.team!, text: misleadingRadio(graph) },
      });
    } catch {
      /* ignore */
    }
  });
}

// --- voting ---

function driveVote(
  game: Parameters<CpuDriver>[0]['game'],
  cpuId: string,
  cc: CrookedCopsStateForPlayer,
  me: PrivateView,
  difficulty: Parameters<CpuDriver>[0]['difficulty'],
  schedule: Parameters<CpuDriver>[0]['schedule'],
): void {
  if (me.hasVoted) return;
  if (!me.team) return;
  const teammates = cc.players.filter((p) => p.team === me.team && p.id !== cpuId);
  if (teammates.length === 0) return;

  // Crooked cops vote for an innocent teammate; ordinary cops vote randomly
  // (no good signal in CPU-only games).
  let best: PlayerPublic = teammates[0];
  if (me.role === 'crooked-cop') {
    const innocents = teammates.filter((t) => t.id !== me.partnerId);
    if (innocents.length > 0) best = innocents[0];
  }
  const choice = pickWithDifficulty(teammates, best, difficulty);
  schedule(() => {
    game.handleAction(cpuId, {
      type: 'crooked-cops/vote',
      payload: { suspectId: choice.id },
    });
  });
}

// --- helpers ---

function inferHotNodesFromRadio(cc: CrookedCopsStateForPlayer, graph: SubwayGraph): NodeId[] {
  // Very simple: scan recent radio messages for any node id substring.
  const recent = cc.radio.slice(-20);
  const hits = new Set<NodeId>();
  for (const m of recent) {
    for (const id of graph.nodes) {
      if (m.text.includes(id)) hits.add(id);
    }
  }
  return Array.from(hits);
}

function vagueRadio(): string {
  const lines = ['nothing here', 'all clear my side', 'moving up', 'covering my line'];
  return lines[Math.floor(Math.random() * lines.length)];
}

function misleadingRadio(graph: SubwayGraph): string {
  // Reference a random node so teammates may waste cycles checking it.
  const random = graph.nodes[Math.floor(Math.random() * graph.nodes.length)];
  const templates = [
    `saw something near ${random}`,
    `pretty sure thief was at ${random}`,
    `${random} is dead`,
    `nothing near ${random} ignore it`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}
