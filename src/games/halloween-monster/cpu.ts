// Halloween Monster CPU driver.
//
// Evaluator: enumerate every legal (target, weapon) pair on the current
// turn and score each by `expected VP gained this turn` minus a small
// retaliation penalty (per spec hint). Prefer one-shot kills on monsters
// to claim full VP; avoid spending high-damage weapons on low-HP targets
// when a cheaper one would do.
//
// Difficulty is delegated to pickWithDifficulty: easy plays mostly random
// legal moves, hard plays the evaluator's pick almost always.

import type { CpuDriver } from '../registry.js';
import { pickWithDifficulty } from '../cpu/difficulty.js';
import type {
  HalloweenStateForPlayer,
  MonsterInstance,
  PlayerPublic,
  WeaponId,
} from './types.js';
import { WEAPONS } from './weapons.js';

interface CandidateMove {
  weaponId: WeaponId;
  targetType: 'monster' | 'player';
  targetId: string;
  // for dual-swords: optional second target
  secondaryTarget?: { targetType: 'monster' | 'player'; targetId: string };
  // computed
  score: number;
}

type CpuView = { halloween?: HalloweenStateForPlayer };

export const driveHalloweenCpus: CpuDriver = ({ game, cpuPlayerIds, difficulty, schedule }) => {
  for (const cpuId of cpuPlayerIds) {
    const view = game.getStateForPlayer?.(cpuId) as CpuView | undefined;
    const hw = view?.halloween;
    if (!hw?.me) continue;

    // alliance phase: CPUs don't seed alliances; they only auto-accept
    // invites from humans (handled implicitly server-side at form time).
    if (hw.phase === 'alliance') continue;

    if (hw.phase === 'shop') {
      // simple: occasionally buy a scouter if affordable and not owned.
      if (Math.random() < 0.2 && hw.me.private.specialItems.length === 0) {
        const myVp = hw.players.find((p) => p.id === cpuId)?.vp ?? 0;
        if (myVp >= 2) {
          schedule(() => {
            game.handleAction(cpuId, {
              type: 'halloween/buy-item',
              payload: { itemId: 'scouter' },
            });
          });
        }
      }
      continue;
    }

    if (hw.phase !== 'turn') continue;
    if (hw.currentPlayerId !== cpuId) continue;

    const candidates = enumerateMoves(hw, cpuId);
    if (candidates.length === 0) continue;

    // best move = top-scored. pickWithDifficulty thins it for easy/medium.
    const ranked = [...candidates].sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const move = pickWithDifficulty(candidates, best, difficulty);

    schedule(() => {
      game.handleAction(cpuId, {
        type: 'halloween/attack',
        payload: {
          targetType: move.targetType,
          targetId: move.targetId,
          weaponId: move.weaponId,
          ...(move.secondaryTarget ? { secondaryTarget: move.secondaryTarget } : {}),
        },
      });
    });
  }
};

function enumerateMoves(hw: HalloweenStateForPlayer, cpuId: string): CandidateMove[] {
  if (!hw.me) return [];
  const myWeapons = hw.me.private.weapons;
  if (myWeapons.length === 0) return [];

  const me = hw.players.find((p) => p.id === cpuId);
  const myVp = me?.vp ?? 0;

  const legalMonsterTargets = hw.monsters.filter((m) => m.zone === 'battlefield');
  const legalPlayerTargets = hw.players.filter(
    (p) => p.id !== cpuId && !p.isEliminated,
  );

  const out: CandidateMove[] = [];
  for (const w of myWeapons) {
    // monster targets — always legal for CPUs (psychologically safer)
    for (const m of legalMonsterTargets) {
      out.push({
        weaponId: w.weaponId,
        targetType: 'monster',
        targetId: m.instanceId,
        score: scoreMonsterHit(w.weaponId, m),
      });
    }
    // player targets — gated: only consider if low VP and a one-shot kill
    // is on the table (per spec: skip the twist unless clearly winning).
    if (myVp <= 3) {
      for (const p of legalPlayerTargets) {
        const dmg = WEAPONS[w.weaponId].damage;
        if (dmg >= p.vp && p.vp > 0) {
          out.push({
            weaponId: w.weaponId,
            targetType: 'player',
            targetId: p.id,
            score: scorePlayerHit(p, dmg),
          });
        }
      }
    }
  }
  return out;
}

function scoreMonsterHit(weaponId: WeaponId, m: MonsterInstance): number {
  const dmg = WEAPONS[weaponId].damage;
  const wouldKill = dmg >= m.hp;
  // base value: VP claimed this turn
  let score = wouldKill ? m.vp * 10 : Math.min(dmg, m.hp);
  // bonus for poison/dynamite if the monster is high-HP (delayed value)
  if (weaponId === 'poison' && m.maxHp >= 6) score += 2;
  if (weaponId === 'dynamite' && m.hp > 6) score += 4;
  if (weaponId === 'ice' && m.hp > dmg) score += 1; // freezes a tough one
  // penalty for overkill: spending a 6-dmg grenade on a 2-hp monster wastes
  if (wouldKill) {
    const overkill = dmg - m.hp;
    score -= Math.max(0, overkill - 1) * 0.5;
  }
  // small bonus for big rewards
  score += m.vp * 0.5;
  return score;
}

function scorePlayerHit(p: PlayerPublic, dmg: number): number {
  // killing nets all their remaining VP
  const wouldKill = dmg >= p.vp;
  if (wouldKill) return p.vp * 12;
  return Math.min(dmg, p.vp) * 1.5;
}
