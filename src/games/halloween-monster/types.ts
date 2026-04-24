// Halloween Monster — shared shapes for VP, weapons, monsters, alliances,
// and phase machine. Public state is filtered server-side via
// getStateForPlayer; the StateForPlayer variant carries the calling
// player's hand + alliance roster + private chat (chat is stubbed).

export type HalloweenPhase =
  | 'waiting'
  | 'alliance' // pre-game: form alliances + transfer VP
  | 'turn' // a single player is in the dealer room making a pick
  | 'resolve' // attack resolved, brief reveal beat
  | 'shop' // optional special-item buy step at end of round (compressed)
  | 'finished';

// phase durations in ms. trimmed for first-playable; the spec calls out a
// 20-min alliance window and longer turn timers — both compressed here.
export const PHASE_DURATIONS: Record<Exclude<HalloweenPhase, 'waiting' | 'finished'>, number> = {
  alliance: 25_000, // spec: 20 minutes
  turn: 20_000,
  resolve: 3_000,
  shop: 10_000,
};

export type WeaponId =
  | 'dagger'
  | 'poison'
  | 'ice'
  | 'dual-swords'
  | 'grenade'
  | 'dynamite';

export type MonsterId = 'witch' | 'dokkaebi' | 'medusa' | 'grim-reaper';

export interface MonsterDef {
  id: MonsterId;
  name: string;
  hp: number;
  vp: number; // VP awarded on kill
  loot: WeaponId[]; // weapons added to killer's hand on kill
}

export type MonsterZone = 'battlefield' | 'standby' | 'graveyard';

export interface MonsterInstance {
  instanceId: string; // stable id (e.g. "witch_1")
  defId: MonsterId;
  hp: number; // current HP
  maxHp: number;
  vp: number;
  zone: MonsterZone;
  // status effects
  poisonStacks: number; // each ticks 1 dmg/round
  iceTurnsRemaining: number; // frozen this many resolves; cannot retaliate
  dynamiteTurnsRemaining: number | null; // 0 explodes at end of next resolve; null if not planted
}

// players hold weapons in a multiset; each entry has a usesRemaining
// counter so dagger (reusable) and one-shot weapons share a shape.
export interface WeaponInstance {
  weaponId: WeaponId;
  // null usesRemaining = unlimited (dagger). otherwise decrements per use.
  usesRemaining: number | null;
}

export interface AllianceRoster {
  id: string;
  name: string;
  memberIds: string[]; // max 3
  founderId: string;
}

export type SpecialItemId = 'scouter' | 'change-order';
export interface SpecialItemInstance {
  itemId: SpecialItemId;
  usesRemaining: number; // 1 piece each per spec
}

export interface PlayerPublic {
  id: string;
  name: string;
  vp: number;
  weaponCount: number; // hidden hand count
  isEliminated: boolean;
  allianceId: string | null;
  // turn-order index (where they sit in this round's lineup). -1 if eliminated.
  turnSlot: number;
  // double-bordered slot (player-target). hidden from clients until twist
  // fires; we expose it server-side for the picker but the public view does
  // NOT include it until the reveal flag is set.
  isPlayerTargetSlot: boolean;
}

export interface PlayerPrivate {
  weapons: WeaponInstance[];
  specialItems: SpecialItemInstance[];
  allianceId: string | null;
  // alliance chat is intentionally stubbed (out of scope for first-playable)
  pendingAllianceInvites: string[]; // alliance ids
}

// shape of an attack action's resolved outcome, broadcast briefly during
// `resolve` so clients can animate hits. cleared at next turn start.
export interface LastAttackSummary {
  attackerId: string;
  targetType: 'monster' | 'player';
  targetId: string;
  weaponUsed: WeaponId;
  damageDealt: number;
  killed: boolean;
  vpGained: number;
  twistRevealed: boolean; // true on the very first player-target attack
}

export interface HalloweenPublicState {
  phase: HalloweenPhase;
  round: number;
  totalRounds: number; // session-cap; null-able for "host calls time" rule
  phaseDeadline: number | null;
  // current actor (during turn/resolve phases)
  currentPlayerId: string | null;
  // visible player roster (sorted by VP desc for the lineup)
  players: PlayerPublic[];
  monsters: MonsterInstance[];
  alliances: AllianceRoster[];
  // becomes true the first time anyone targets a player (the Hidden Twist).
  // Until it flips, double-border slots in the lineup are visible but
  // their meaning is not explained to the table.
  twistRevealed: boolean;
  lastAttack: LastAttackSummary | null;
}

export interface HalloweenStateForPlayer extends HalloweenPublicState {
  me: {
    playerId: string;
    private: PlayerPrivate;
  } | null;
}

// ─── action wire shapes ─────────────────────────────────────────────────────

export type HalloweenAction =
  | {
      type: 'halloween/form-alliance';
      payload: { name: string; inviteIds: string[] };
    }
  | {
      type: 'halloween/transfer-vp';
      payload: { toPlayerId: string; amount: number };
    }
  | {
      type: 'halloween/attack';
      payload: {
        targetType: 'monster' | 'player';
        targetId: string;
        weaponId: WeaponId;
        // dual-swords split: optional second target gets the other half
        secondaryTarget?: { targetType: 'monster' | 'player'; targetId: string };
      };
    }
  | {
      type: 'halloween/buy-item';
      payload: { itemId: SpecialItemId };
    }
  | {
      type: 'halloween/change-order';
      payload: { newOrder: string[] };
    };
