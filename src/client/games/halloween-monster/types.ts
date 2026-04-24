// client-side mirror of the server's halloween-monster state shape.
// kept in sync with src/games/halloween-monster/types.ts by hand.

export type HalloweenPhase =
  | 'waiting'
  | 'alliance'
  | 'turn'
  | 'resolve'
  | 'shop'
  | 'finished';

export type WeaponId =
  | 'dagger'
  | 'poison'
  | 'ice'
  | 'dual-swords'
  | 'grenade'
  | 'dynamite';

export type MonsterId = 'witch' | 'dokkaebi' | 'medusa' | 'grim-reaper';
export type MonsterZone = 'battlefield' | 'standby' | 'graveyard';
export type SpecialItemId = 'scouter' | 'change-order';

export interface MonsterInstance {
  instanceId: string;
  defId: MonsterId;
  hp: number;
  maxHp: number;
  vp: number;
  zone: MonsterZone;
  poisonStacks: number;
  iceTurnsRemaining: number;
  dynamiteTurnsRemaining: number | null;
}

export interface WeaponInstance {
  weaponId: WeaponId;
  usesRemaining: number | null;
}

export interface SpecialItemInstance {
  itemId: SpecialItemId;
  usesRemaining: number;
}

export interface AllianceRoster {
  id: string;
  name: string;
  memberIds: string[];
  founderId: string;
}

export interface PlayerPublic {
  id: string;
  name: string;
  vp: number;
  weaponCount: number;
  isEliminated: boolean;
  allianceId: string | null;
  turnSlot: number;
  isPlayerTargetSlot: boolean;
}

export interface PlayerPrivate {
  weapons: WeaponInstance[];
  specialItems: SpecialItemInstance[];
  allianceId: string | null;
  pendingAllianceInvites: string[];
}

export interface LastAttackSummary {
  attackerId: string;
  targetType: 'monster' | 'player';
  targetId: string;
  weaponUsed: WeaponId;
  damageDealt: number;
  killed: boolean;
  vpGained: number;
  twistRevealed: boolean;
}

export interface HalloweenPublicState {
  phase: HalloweenPhase;
  round: number;
  totalRounds: number;
  phaseDeadline: number | null;
  currentPlayerId: string | null;
  players: PlayerPublic[];
  monsters: MonsterInstance[];
  alliances: AllianceRoster[];
  twistRevealed: boolean;
  lastAttack: LastAttackSummary | null;
}

export interface HalloweenStateForPlayer extends HalloweenPublicState {
  me: { playerId: string; private: PlayerPrivate } | null;
}

// shared display catalog for weapons (icon + label only — server owns rules)
export const WEAPON_LABELS: Record<WeaponId, string> = {
  dagger: 'Dagger',
  poison: 'Poison',
  ice: 'Ice',
  'dual-swords': 'Dual Swords',
  grenade: 'Grenade',
  dynamite: 'Dynamite',
};

export const WEAPON_DAMAGE: Record<WeaponId, number> = {
  dagger: 3,
  poison: 0,
  ice: 3,
  'dual-swords': 4,
  grenade: 6,
  dynamite: 0,
};

export const MONSTER_LABELS: Record<MonsterId, string> = {
  witch: 'Witch',
  dokkaebi: 'Dokkaebi',
  medusa: 'Medusa',
  'grim-reaper': 'Grim Reaper',
};
