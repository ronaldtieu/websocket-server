// Halloween Monster — weapon catalog and damage rules.
// Pure functions: applyWeapon mutates a target snapshot and returns the
// resolved effects. No game-state side effects live here so the game class
// can compose them.

import type { MonsterDef, MonsterId, WeaponId } from './types.js';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  // base direct damage applied this resolve
  damage: number;
  // for Poison: stacks added (each stack ticks 1 dmg/round)
  poisonStacks?: number;
  // for Ice: number of resolves the target is frozen (cannot retaliate)
  iceTurns?: number;
  // for Dynamite: explodes after N resolves
  dynamiteFuse?: number;
  // dual-swords can be split 4 or 2+2
  splittable?: boolean;
  // null = unlimited uses (dagger). number = consumed N times.
  uses: number | null;
  // shop price in VP for the special-item shop. monsters drop weapons as
  // loot for free; the shop only surfaces special items in this iteration.
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  dagger: { id: 'dagger', name: 'Dagger', damage: 3, uses: null },
  poison: { id: 'poison', name: 'Poison', damage: 0, poisonStacks: 1, uses: 1 },
  ice: { id: 'ice', name: 'Ice', damage: 3, iceTurns: 1, uses: 1 },
  'dual-swords': {
    id: 'dual-swords',
    name: 'Dual Swords',
    damage: 4,
    splittable: true,
    uses: 1,
  },
  grenade: { id: 'grenade', name: 'Grenade', damage: 6, uses: 1 },
  dynamite: { id: 'dynamite', name: 'Dynamite', damage: 0, dynamiteFuse: 1, uses: 1 },
};

// Monster catalog. HP / VP / loot from the spec; loot is intentionally
// modest so weapon supply stays scarce.
export const MONSTERS: Record<MonsterId, MonsterDef> = {
  witch: {
    id: 'witch',
    name: 'Witch',
    hp: 6,
    vp: 3,
    loot: ['poison'],
  },
  dokkaebi: {
    id: 'dokkaebi',
    name: 'Dokkaebi',
    hp: 4,
    vp: 2,
    loot: ['dagger'],
  },
  medusa: {
    id: 'medusa',
    name: 'Medusa',
    hp: 8,
    vp: 4,
    loot: ['ice'],
  },
  'grim-reaper': {
    id: 'grim-reaper',
    name: 'Grim Reaper',
    hp: 12,
    vp: 6,
    loot: ['dual-swords', 'grenade'],
  },
};

// Result of applying a weapon to one target. The game class consumes this
// to mutate the live monster/player and award VP/loot.
export interface AppliedEffect {
  directDamage: number;
  addedPoisonStacks: number;
  addedIceTurns: number;
  plantedDynamiteFuse: number | null;
}

// Resolves the immediate effect of a single weapon hit on a single target.
// Splittable weapons (dual-swords) are handled by the caller — it calls
// this once per sub-target with the appropriate damage override.
export function effectFor(weaponId: WeaponId, damageOverride?: number): AppliedEffect {
  const w = WEAPONS[weaponId];
  return {
    directDamage: damageOverride ?? w.damage,
    addedPoisonStacks: w.poisonStacks ?? 0,
    addedIceTurns: w.iceTurns ?? 0,
    plantedDynamiteFuse: w.dynamiteFuse ?? null,
  };
}

// dual-swords split helper: legal splits are [4] (single target for 4) or
// [2, 2] (two targets for 2 each). Returns null for any other request.
export function splitDualSwordsDamage(splitInto: number): number[] | null {
  if (splitInto === 1) return [4];
  if (splitInto === 2) return [2, 2];
  return null;
}
