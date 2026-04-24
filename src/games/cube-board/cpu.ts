// CPU driver for cube-board.
//
// Heuristic per move:
//   score(d) = w_progress * (-deltaDistanceToGoal)
//            + w_bonus * (would-trigger bonus turn? +1 : 0)
//            + w_moveAnother * (would-trigger move-another? +1 : 0)
//            - w_banishment * (banishment risk on landing/top color)
//
// "easy" CPUs ignore banishment risk and bonus heuristics — they just walk
// toward the goal with a lot of randomness, and stumble into white squares
// freely. "hard" CPUs evaluate every candidate (including reorient targets
// and move-another picks) and pick best.
//
// pickWithDifficulty(legal, best, difficulty) handles the easy/medium/hard
// random-vs-best split using the shared helper.

import { pickWithDifficulty, type Difficulty } from '../cpu/difficulty.js';
import type { CpuDriver } from '../registry.js';
import { adjacentSquares, neighbor } from './board.js';
import { reorientToTop, tumble } from './cube.js';
import type {
  BoardDef,
  CubeBoardStateForPlayer,
  CubeColor,
  CubeFace,
  CubeOrientation,
  Direction,
  PlayerPublic,
} from './types.js';

const ALL_DIRECTIONS: Direction[] = ['N', 'E', 'S', 'W'];
const ALL_COLORS: CubeColor[] = ['red', 'yellow', 'blue', 'green', 'purple', 'white'];

interface CpuView {
  cubeBoard?: CubeBoardStateForPlayer;
}

export const driveCubeBoardCpus: CpuDriver = ({ game, cpuPlayerIds, schedule, difficulty }) => {
  for (const cpuId of cpuPlayerIds) {
    const view = game.getStateForPlayer?.(cpuId) as CpuView | undefined;
    const cb = view?.cubeBoard;
    if (!cb || !cb.me) continue;
    if (cb.phase === 'waiting' || cb.phase === 'finished') continue;
    const myTurn =
      cb.turnOrder[cb.turnIndex] === cpuId ||
      // turn might be on a finished player; skip in that case
      false;
    if (!myTurn) continue;

    const me = cb.players.find((p) => p.id === cpuId);
    if (!me || me.isFinished) continue;

    schedule(() => decideAndAct(game, cpuId, cb, difficulty));
  }
};

function decideAndAct(
  game: { handleAction: (id: string, a: { type: string; payload: unknown }) => unknown },
  cpuId: string,
  cb: CubeBoardStateForPlayer,
  difficulty: Difficulty,
): void {
  const me = cb.me!;
  const myPub = cb.players.find((p) => p.id === cpuId)!;
  const board = cb.board;

  // 1. If forced to re-orient, pick a color that opens the best move.
  if (me.private.mustReorient && cb.hiddenRulesActive) {
    const choice = chooseReorientColor(board, me.private.orientation, myPub, cb.players, difficulty);
    if (choice) {
      game.handleAction(cpuId, { type: 'unknown/reorient', payload: { topColor: choice } });
      return;
    }
  }

  // 2. If move-another is available and beneficial (hard tier especially),
  // consider it. We weigh moving someone else only when it produces a
  // net-positive nudge (e.g. shoves a leader off the goal-approach line).
  const targets = me.private.moveAnotherTargets;
  if (targets.length > 0 && difficulty !== 'easy') {
    const pick = chooseMoveOther(board, myPub, cb.players, targets, difficulty);
    if (pick) {
      game.handleAction(cpuId, {
        type: 'unknown/move-other',
        payload: { targetPlayerId: pick.targetId, direction: pick.dir },
      });
      return;
    }
  }

  // 3. Otherwise pick a direction (legal under tile-color rule).
  const legal = legalDirections(board, myPub, me.private.orientation);
  if (legal.length === 0) {
    // Stuck — try to re-orient first to unlock something.
    if (cb.hiddenRulesActive) {
      const c = chooseReorientColor(board, me.private.orientation, myPub, cb.players, difficulty);
      if (c) {
        game.handleAction(cpuId, { type: 'unknown/reorient', payload: { topColor: c } });
        return;
      }
    }
    // give up — the engine's auto-roll will rescue us next broadcast
    return;
  }

  const scored = legal.map((d) => ({
    d,
    score: scoreMove(board, myPub, me.private.orientation, d, cb.players, difficulty),
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].d;
  const chosen = pickWithDifficulty(legal, best, difficulty);

  game.handleAction(cpuId, { type: 'unknown/move', payload: { direction: chosen } });
}

function legalDirections(
  board: BoardDef,
  player: PlayerPublic,
  orientation: CubeOrientation,
): Direction[] {
  const out: Direction[] = [];
  const top = orientation.top;
  for (const d of ALL_DIRECTIONS) {
    const sq = neighbor(board, player.squareIndex, d);
    if (!sq) continue;
    if (top === 'face') {
      out.push(d);
      continue;
    }
    if (sq.kind === 'goal' || sq.kind === 'gray') {
      out.push(d);
      continue;
    }
    if (sq.kind === 'color' && sq.color === top) {
      out.push(d);
    }
  }
  return out;
}

function distanceToGoal(board: BoardDef, idx: number): number {
  const a = board.squares[idx];
  const g = board.squares[board.goalIndex];
  return Math.abs(a.x - g.x) + Math.abs(a.y - g.y);
}

function scoreMove(
  board: BoardDef,
  player: PlayerPublic,
  orientation: CubeOrientation,
  d: Direction,
  allPlayers: PlayerPublic[],
  difficulty: Difficulty,
): number {
  const before = distanceToGoal(board, player.squareIndex);
  const dest = neighbor(board, player.squareIndex, d);
  if (!dest) return -Infinity;
  const destIdx = board.squares.indexOf(dest);
  const after = distanceToGoal(board, destIdx);
  const newOrientation = tumble(orientation, d);
  const newTop = newOrientation.top;

  // progress: positive if closer to goal
  let s = (before - after) * 4;

  // big reward for landing on the goal
  if (dest.kind === 'goal') s += 1000;

  // banishment risk: only "hard" CPUs care; easy CPUs walk into white freely.
  if (difficulty !== 'easy') {
    const lookahead = applyBanishmentLookahead(board, destIdx, newTop, allPlayers);
    s -= lookahead.risk * (difficulty === 'hard' ? 12 : 6);
  }

  // bonus turn / move-another bonuses (hard tier weighs them higher)
  const adjMatches = adjacentColorMatches(board, destIdx, newTop);
  if (newTop !== 'face') {
    if (adjMatches >= 3) s += difficulty === 'hard' ? 6 : 2;
    if (adjMatches >= 2) s += difficulty === 'hard' ? 2 : 0.5;
  }

  // tiny tiebreaker: prefer non-gray landings (gray = no progress flavor)
  if (dest.kind === 'gray') s -= 0.25;

  return s;
}

function adjacentColorMatches(board: BoardDef, idx: number, color: CubeFace): number {
  if (color === 'face') return 0;
  return adjacentSquares(board, idx).filter((s) => s.kind === 'color' && s.color === color).length;
}

function applyBanishmentLookahead(
  board: BoardDef,
  destIdx: number,
  newTop: CubeFace,
  _all: PlayerPublic[],
): { risk: number } {
  const sq = board.squares[destIdx];
  const destWhite = sq.kind === 'color' && sq.color === 'white';
  const topWhite = newTop === 'white';
  return { risk: destWhite || topWhite ? 1 : 0 };
}

function chooseReorientColor(
  board: BoardDef,
  orientation: CubeOrientation,
  player: PlayerPublic,
  allPlayers: PlayerPublic[],
  difficulty: Difficulty,
): CubeColor | null {
  // Try every color currently on the cube; pick the one that yields the best
  // resulting move.
  const onCube: CubeColor[] = [];
  for (const slot of [
    orientation.top,
    orientation.bottom,
    orientation.north,
    orientation.south,
    orientation.east,
    orientation.west,
  ]) {
    if (slot !== 'face' && !onCube.includes(slot as CubeColor)) {
      onCube.push(slot as CubeColor);
    }
  }
  let best: { color: CubeColor; score: number } | null = null;
  for (const color of onCube) {
    const newOrientation = reorientToTop(orientation, color);
    if (!newOrientation) continue;
    const adj = adjacentColorMatches(board, player.squareIndex, color);
    if (adj === 0) continue;
    // simulate the best move from this orientation
    const legal = legalDirections(board, player, newOrientation);
    if (legal.length === 0) continue;
    const scores = legal.map((d) =>
      scoreMove(board, player, newOrientation, d, allPlayers, difficulty),
    );
    const top = Math.max(...scores);
    if (!best || top > best.score) best = { color, score: top };
  }
  if (best) return best.color;
  // fallback: any color on cube
  if (onCube.length > 0) return onCube[Math.floor(Math.random() * onCube.length)];
  // worst-case: just guess (engine will reject if not on cube)
  return ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)];
}

function chooseMoveOther(
  board: BoardDef,
  me: PlayerPublic,
  allPlayers: PlayerPublic[],
  targets: string[],
  difficulty: Difficulty,
): { targetId: string; dir: Direction } | null {
  // Pick the target closest to the goal and shove them away from it.
  let best: { targetId: string; dir: Direction; score: number } | null = null;
  for (const id of targets) {
    const t = allPlayers.find((p) => p.id === id);
    if (!t || t.isFinished) continue;
    for (const d of ALL_DIRECTIONS) {
      const sq = neighbor(board, t.squareIndex, d);
      if (!sq) continue;
      const dest = board.squares.indexOf(sq);
      const before = distanceToGoal(board, t.squareIndex);
      const after = distanceToGoal(board, dest);
      // shove them away from the goal — higher (after - before) is better
      const s = (after - before) * 3 - distanceToGoal(board, me.squareIndex) * 0.1;
      if (!best || s > best.score) best = { targetId: id, dir: d, score: s };
    }
  }
  // Hard CPUs almost always take a positive move-other; medium ~half the time.
  if (!best || best.score <= 0) return null;
  const threshold = difficulty === 'hard' ? 0.1 : 1.5;
  if (best.score < threshold) return null;
  return { targetId: best.targetId, dir: best.dir };
}
