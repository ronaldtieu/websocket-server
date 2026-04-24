// Treasure Island CPU driver.
//
// Two decisions per game phase:
//   - auction: allocate chips across the offered arrows. Easy spreads chips
//     around at random; hard concentrates on 1-2 high-value arrows; medium
//     mixes both via pickWithDifficulty().
//   - exploration: build a path that walks toward the nearest unopened box,
//     respecting arrow lengths and the red-dot endpoint rule.
//
// The driver uses pickWithDifficulty() per decision so easy CPUs make
// recognisably bad choices.

import type { CpuDriver } from '../registry.js';
import { pickWithDifficulty } from '../cpu/difficulty.js';
import type { Difficulty } from '../cpu/difficulty.js';
import type {
  ArrowOffer,
  PlayerPublic,
  TreasureIslandStateForPlayer,
} from './types.js';
import { fromIdx, idx } from './board.js';

interface CpuView {
  treasureIsland?: TreasureIslandStateForPlayer;
}

// utility per arrow ≈ length + 1, weighted by remaining unopened boxes.
function arrowUtility(arrow: ArrowOffer, boxesLeft: number): number {
  return (arrow.length + 1) * (1 + boxesLeft / 10);
}

// allocate `budget` chips across arrows with weights ≥0. respects min-1
// per arrow that gets any allocation and never overspends.
function allocateChips(
  arrows: { id: string; weight: number }[],
  budget: number,
  difficulty: Difficulty,
): { arrowId: string; chips: number }[] {
  if (budget <= 0 || arrows.length === 0) return [];
  // hard: focus on top-2 weighted arrows. easy: spread across many.
  const sorted = [...arrows].sort((a, b) => b.weight - a.weight);
  const focusN =
    difficulty === 'hard'
      ? Math.min(2, sorted.length)
      : difficulty === 'medium'
        ? Math.min(3, sorted.length)
        : Math.min(sorted.length, 5);
  const subset = sorted.slice(0, focusN);
  const totalWeight = subset.reduce((s, a) => s + a.weight, 0) || 1;
  const out: { arrowId: string; chips: number }[] = [];
  let remaining = budget;
  for (let i = 0; i < subset.length; i += 1) {
    const isLast = i === subset.length - 1;
    let chips = isLast
      ? remaining
      : Math.max(1, Math.floor((subset[i].weight / totalWeight) * budget));
    chips = Math.min(chips, remaining);
    if (chips < 1) continue;
    out.push({ arrowId: subset[i].id, chips });
    remaining -= chips;
    if (remaining <= 0) break;
  }
  return out;
}

// pick path attempts: pair owned arrows with red-dot endpoints that move
// toward the nearest unopened box. greedy from one of the four cardinal
// red dots — we don't try to chain arrows for now.
function buildPath(
  state: TreasureIslandStateForPlayer,
  arrowIds: string[],
  difficulty: Difficulty,
): { arrowId: string; fromIdx: number; toIdx: number }[] {
  const layout = state.board;
  // the engine sends owned arrow ids without lengths in the per-player slice.
  // derive lengths heuristically; the path validator on the server will
  // reject mismatches and the CPU will simply place fewer arrows that round.
  const owned = arrowIds.map((id) => ({ id, length: parseLengthFromId(id) }));

  const openedSet = new Set(state.openedBoxes.map((b) => b.boxId));
  const targets = layout.boxes
    .filter((b) => !openedSet.has(b.id))
    .map((b) => idx(b.x, b.y));
  if (targets.length === 0 || layout.redDots.length === 0) return [];

  const out: { arrowId: string; fromIdx: number; toIdx: number }[] = [];
  const usedDots = new Set<number>();

  for (const arrow of owned) {
    // legal endpoint pairs: any two distinct red dots whose chebyshev
    // distance equals arrow.length.
    const legalPairs: { fromIdx: number; toIdx: number; goalDist: number }[] = [];
    for (const from of layout.redDots) {
      for (const to of layout.redDots) {
        if (from === to) continue;
        const dx = Math.abs(from.x - to.x);
        const dy = Math.abs(from.y - to.y);
        const isStraight = dx === 0 || dy === 0 || dx === dy;
        if (!isStraight) continue;
        const len = Math.max(dx, dy);
        if (len !== arrow.length) continue;
        const fIdx = idx(from.x, from.y);
        if (usedDots.has(fIdx)) continue;
        const tIdx = idx(to.x, to.y);
        // distance from "to" cell to nearest target box (chebyshev)
        const tCell = fromIdx(tIdx);
        let best = Infinity;
        for (const tg of targets) {
          const tCellPos = fromIdx(tg);
          const d = Math.max(
            Math.abs(tCellPos.x - tCell.x),
            Math.abs(tCellPos.y - tCell.y),
          );
          if (d < best) best = d;
        }
        legalPairs.push({ fromIdx: fIdx, toIdx: tIdx, goalDist: best });
      }
    }
    if (legalPairs.length === 0) continue;
    legalPairs.sort((a, b) => a.goalDist - b.goalDist);
    const chosen = pickWithDifficulty(legalPairs, legalPairs[0], difficulty);
    out.push({ arrowId: arrow.id, fromIdx: chosen.fromIdx, toIdx: chosen.toIdx });
    usedDots.add(chosen.fromIdx);
  }
  return out;
}

function parseLengthFromId(_id: string): number {
  // arrow ids look like 'arr-r{round}-{n}' but length isn't encoded. Assume 2
  // as a safe middle. The validator will reject a wrong length, so the CPU
  // simply fails the round if it picks badly — acceptable for first cut.
  return 2;
}

export const driveTreasureIslandCpus: CpuDriver = ({
  game,
  cpuPlayerIds,
  difficulty,
  schedule,
}) => {
  for (const cpuId of cpuPlayerIds) {
    const state = game.getStateForPlayer?.(cpuId) as CpuView | undefined;
    const ti = state?.treasureIsland;
    if (!ti?.me) continue;

    const me = ti.players.find((p: PlayerPublic) => p.id === cpuId);
    if (!me || me.hasSubmitted) continue;

    if (ti.phase === 'auction' && ti.auctionOffers) {
      schedule(() => {
        const offers = ti.auctionOffers ?? [];
        const boxesLeft = ti.board.boxes.length - ti.openedBoxes.length;
        const weighted = offers.map((o) => ({
          id: o.id,
          weight: arrowUtility(o, boxesLeft),
        }));
        const allocations = allocateChips(weighted, me.chipCount, difficulty);
        try {
          game.handleAction(cpuId, {
            type: 'treasure/bid',
            payload: { allocations },
          });
        } catch {
          // bidder may already have submitted; ignore
        }
      });
    } else if (ti.phase === 'exploration' && ti.me) {
      schedule(() => {
        const arrows = buildPath(ti, ti.me!.private.arrowIds, difficulty);
        try {
          game.handleAction(cpuId, {
            type: 'treasure/place-path',
            payload: { arrows },
          });
        } catch {
          // CPU sometimes places no arrows; submit empty path to signal done
          try {
            game.handleAction(cpuId, {
              type: 'treasure/place-path',
              payload: { arrows: [] },
            });
          } catch {
            // ignore
          }
        }
      });
    }
  }
};

// re-exports used by tests (none yet) — keep helpers public for clarity.
export { allocateChips, buildPath as _buildPathForTesting };
