// Halloween Monster — server-side game class.
// Implements GameInterface plus getStateForPlayer for hidden info filtering.
//
// Phase machine:
//   waiting → alliance → turn → resolve → (next turn-in-round | shop) → turn …
//                                                                   ↓
//                                           (all monsters dead / host time) → finished
//
// Per-turn flow (one player at a time, in VP-desc order):
//   * setPhase('turn') — current player picks target + weapon
//   * setPhase('resolve') — apply damage, award VP/loot, briefly pause
//   * advance to next player; when round wraps, optional shop, then re-rank
//
// Hidden info: weapons + special items + alliance invites are private to
// the owning player. The Hidden Twist (which slot is a player-target)
// stays unrevealed in public state until someone picks a player-target.

import type { GameInterface, GameState, PlayerAction, PlayerState } from '../GameInterface.js';
import {
  PHASE_DURATIONS,
  type AllianceRoster,
  type HalloweenAction,
  type HalloweenPhase,
  type HalloweenPublicState,
  type HalloweenStateForPlayer,
  type LastAttackSummary,
  type MonsterId,
  type MonsterInstance,
  type PlayerPrivate,
  type PlayerPublic,
  type SpecialItemId,
  type SpecialItemInstance,
  type WeaponId,
  type WeaponInstance,
} from './types.js';
import { MONSTERS, WEAPONS, effectFor, splitDualSwordsDamage } from './weapons.js';

interface InternalPlayer {
  id: string;
  name: string;
  isConnected: boolean;
  vp: number;
  weapons: WeaponInstance[];
  specialItems: SpecialItemInstance[];
  isEliminated: boolean;
  allianceId: string | null;
  pendingAllianceInvites: string[];
  // turn slot index assigned at start of each round
  turnSlot: number;
  // whether this slot is a "player-target" slot (the Hidden Twist)
  isPlayerTargetSlot: boolean;
  // session-tracked piece delta — surfaces in any future cross-game ledger
  pieceDelta: number;
}

const STARTING_VP = 5;
const STARTING_DAGGER: WeaponInstance = { weaponId: 'dagger', usesRemaining: null };
const SHOP_PRICES: Record<SpecialItemId, number> = {
  scouter: 2,
  'change-order': 3,
};

// monster spawn list: 2 of each smaller monster + 1 reaper. Battlefield
// slots come first; the rest live in standby. Defeating a battlefield
// monster pulls the next standby into battlefield.
const SPAWN_LIST: MonsterId[] = [
  'witch',
  'dokkaebi',
  'medusa',
  'grim-reaper',
  'witch',
  'dokkaebi',
  'medusa',
];
const BATTLEFIELD_SIZE = 3;

export class HalloweenMonsterGame implements GameInterface {
  readonly gameId: string;
  private players: Map<string, InternalPlayer> = new Map();
  private alliances: Map<string, AllianceRoster> = new Map();
  private monsters: MonsterInstance[] = [];
  private phase: HalloweenPhase = 'waiting';
  private round = 0;
  private totalRounds: number;
  private phaseDeadline: number | null = null;
  private phaseTimer: NodeJS.Timeout | null = null;
  private gameStarted = false;
  private currentTurnIndex = 0;
  private turnOrder: string[] = []; // player ids in VP-desc order
  private twistRevealed = false;
  private lastAttack: LastAttackSummary | null = null;
  private testMode: boolean;
  private allianceCounter = 0;

  onPhaseChange: (() => void) | null = null;

  constructor(gameId: string, opts: { testMode?: boolean } = {}) {
    this.gameId = gameId;
    this.testMode = Boolean(opts.testMode);
    // sessions cap at ~5 rounds in test mode, 12 in full. Game also ends
    // early when all monsters die.
    this.totalRounds = this.testMode ? 5 : 12;
  }

  // ─── GameInterface ─────────────────────────────────────────────────────

  getState(): GameState {
    return {
      players: this.publicPlayerStates(),
      status: this.statusFor(),
      halloween: this.publicHalloweenState(),
    };
  }

  getStateForPlayer(playerId: string): GameState {
    const me = this.players.get(playerId);
    const stateForPlayer: HalloweenStateForPlayer = {
      ...this.publicHalloweenState(),
      me: me
        ? {
            playerId: me.id,
            private: this.privateFor(me),
          }
        : null,
    };
    return {
      players: this.publicPlayerStates(),
      status: this.statusFor(),
      halloween: stateForPlayer,
    };
  }

  addPlayer(playerId: string, playerName: string): boolean {
    if (this.players.has(playerId)) return false;
    if (this.players.size >= 8) return false;
    if (this.gameStarted) return false;
    this.players.set(playerId, this.freshPlayer(playerId, playerName));
    return true;
  }

  removePlayer(playerId: string): void {
    const p = this.players.get(playerId);
    if (p) p.isConnected = false;
  }

  handleAction(playerId: string, action: PlayerAction): GameState {
    const player = this.players.get(playerId);
    if (!player) throw new Error('player not in game');
    if (player.isEliminated) throw new Error('eliminated players cannot act');

    const a = action as HalloweenAction;
    switch (a.type) {
      case 'halloween/form-alliance':
        this.handleFormAlliance(player, a.payload);
        break;
      case 'halloween/transfer-vp':
        this.handleTransferVp(player, a.payload);
        break;
      case 'halloween/attack':
        this.handleAttack(player, a.payload);
        break;
      case 'halloween/buy-item':
        this.handleBuyItem(player, a.payload);
        break;
      case 'halloween/change-order':
        this.handleChangeOrder(player, a.payload);
        break;
      default:
        throw new Error(`unknown action ${(a as { type: string }).type}`);
    }
    return this.getState();
  }

  isFull(): boolean {
    return this.players.size >= 8;
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
    this.spawnMonsters();
    this.setPhase('alliance');
    return true;
  }

  destroy(): void {
    this.clearTimer();
  }

  // host-driven skip (wired by the socket handler)
  skipPhase(): void {
    if (this.phase === 'waiting' || this.phase === 'finished') return;
    this.clearTimer();
    this.advanceFromPhase(this.phase);
  }

  // ─── action handlers ───────────────────────────────────────────────────

  private handleFormAlliance(
    p: InternalPlayer,
    payload: { name: string; inviteIds: string[] },
  ): void {
    if (this.phase !== 'alliance') throw new Error('alliances only form pre-game');
    if (p.allianceId) throw new Error('already in an alliance');
    const cleaned = payload.inviteIds.filter(
      (id) => id !== p.id && this.players.has(id),
    );
    // max 3 members total, founder included; truncate invites if over
    const accepted = cleaned.slice(0, 2);
    this.allianceCounter += 1;
    const alliance: AllianceRoster = {
      id: `alliance_${this.allianceCounter}`,
      name: payload.name?.slice(0, 24) || `Alliance ${this.allianceCounter}`,
      memberIds: [p.id, ...accepted],
      founderId: p.id,
    };
    this.alliances.set(alliance.id, alliance);
    p.allianceId = alliance.id;
    // auto-accept invitees that are CPUs (per spec); humans get an invite
    // they can act on later. For first-playable we just auto-add accepted
    // ids if they're not already in an alliance.
    for (const id of accepted) {
      const invitee = this.players.get(id);
      if (invitee && !invitee.allianceId) {
        invitee.allianceId = alliance.id;
      } else {
        // already-allied players are silently dropped from the roster
        alliance.memberIds = alliance.memberIds.filter((m) => m !== id);
      }
    }
  }

  private handleTransferVp(
    p: InternalPlayer,
    payload: { toPlayerId: string; amount: number },
  ): void {
    if (this.phase !== 'alliance') throw new Error('VP transfers only pre-game');
    const recipient = this.players.get(payload.toPlayerId);
    if (!recipient) throw new Error('unknown recipient');
    if (recipient.id === p.id) throw new Error('cannot transfer to self');
    const amount = Math.max(0, Math.floor(payload.amount));
    if (amount <= 0) throw new Error('amount must be positive');
    if (amount > p.vp) throw new Error('insufficient VP');
    p.vp -= amount;
    recipient.vp += amount;
  }

  private handleAttack(
    attacker: InternalPlayer,
    payload: {
      targetType: 'monster' | 'player';
      targetId: string;
      weaponId: WeaponId;
      secondaryTarget?: { targetType: 'monster' | 'player'; targetId: string };
    },
  ): void {
    if (this.phase !== 'turn') throw new Error('not in turn phase');
    if (this.turnOrder[this.currentTurnIndex] !== attacker.id) {
      throw new Error('not your turn');
    }
    const weapon = attacker.weapons.find((w) => w.weaponId === payload.weaponId);
    if (!weapon) throw new Error('weapon not in hand');

    let twistFiredThisAttack = false;
    let totalDamage = 0;
    let killed = false;
    let vpGained = 0;
    let primaryTargetName = '';

    // Build sub-targets list for split weapons; otherwise single hit.
    const subHits: { targetType: 'monster' | 'player'; targetId: string; damage: number }[] = [];
    if (payload.weaponId === 'dual-swords' && payload.secondaryTarget) {
      const split = splitDualSwordsDamage(2);
      if (!split) throw new Error('invalid split');
      subHits.push({
        targetType: payload.targetType,
        targetId: payload.targetId,
        damage: split[0],
      });
      subHits.push({
        targetType: payload.secondaryTarget.targetType,
        targetId: payload.secondaryTarget.targetId,
        damage: split[1],
      });
    } else {
      subHits.push({
        targetType: payload.targetType,
        targetId: payload.targetId,
        damage: WEAPONS[payload.weaponId].damage,
      });
    }

    for (const hit of subHits) {
      if (hit.targetType === 'player') {
        if (!this.twistRevealed) {
          this.twistRevealed = true;
          twistFiredThisAttack = true;
        }
        const result = this.applyAttackToPlayer(attacker, hit.targetId, payload.weaponId, hit.damage);
        totalDamage += result.damage;
        if (result.killed) killed = true;
        vpGained += result.vpGained;
        if (!primaryTargetName) primaryTargetName = hit.targetId;
      } else {
        const result = this.applyAttackToMonster(attacker, hit.targetId, payload.weaponId, hit.damage);
        totalDamage += result.damage;
        if (result.killed) killed = true;
        vpGained += result.vpGained;
        if (!primaryTargetName) primaryTargetName = hit.targetId;
      }
    }

    // consume weapon use
    if (weapon.usesRemaining !== null) {
      weapon.usesRemaining -= 1;
      if (weapon.usesRemaining <= 0) {
        attacker.weapons = attacker.weapons.filter((w) => w !== weapon);
      }
    }

    this.lastAttack = {
      attackerId: attacker.id,
      targetType: payload.targetType,
      targetId: payload.targetId,
      weaponUsed: payload.weaponId,
      damageDealt: totalDamage,
      killed,
      vpGained,
      twistRevealed: twistFiredThisAttack,
    };

    this.setPhase('resolve');
  }

  private handleBuyItem(p: InternalPlayer, payload: { itemId: SpecialItemId }): void {
    if (this.phase !== 'shop') throw new Error('shop closed');
    const price = SHOP_PRICES[payload.itemId];
    if (price === undefined) throw new Error('unknown item');
    if (p.vp < price) throw new Error('insufficient VP');
    // 1 piece each per spec — refuse a duplicate
    if (p.specialItems.some((i) => i.itemId === payload.itemId)) {
      throw new Error('already own this item');
    }
    p.vp -= price;
    p.specialItems.push({ itemId: payload.itemId, usesRemaining: 1 });
  }

  private handleChangeOrder(p: InternalPlayer, payload: { newOrder: string[] }): void {
    if (this.phase !== 'shop' && this.phase !== 'alliance') {
      throw new Error('change-order only between rounds');
    }
    const item = p.specialItems.find((i) => i.itemId === 'change-order' && i.usesRemaining > 0);
    if (!item) throw new Error('no change-order item');
    // validate the new order contains exactly the same active player ids
    const active = this.activePlayers().map((ap) => ap.id);
    const valid =
      payload.newOrder.length === active.length &&
      payload.newOrder.every((id) => active.includes(id));
    if (!valid) throw new Error('invalid order');
    item.usesRemaining -= 1;
    p.specialItems = p.specialItems.filter((i) => i.usesRemaining > 0);
    this.turnOrder = payload.newOrder;
    this.assignTurnSlots();
  }

  // ─── attack resolution helpers ─────────────────────────────────────────

  private applyAttackToMonster(
    attacker: InternalPlayer,
    monsterInstanceId: string,
    weaponId: WeaponId,
    damageOverride?: number,
  ): { damage: number; killed: boolean; vpGained: number } {
    const m = this.monsters.find((mm) => mm.instanceId === monsterInstanceId);
    if (!m) throw new Error('unknown monster');
    if (m.zone !== 'battlefield') throw new Error('monster not in battlefield');
    const eff = effectFor(weaponId, damageOverride);
    m.hp = Math.max(0, m.hp - eff.directDamage);
    m.poisonStacks += eff.addedPoisonStacks;
    m.iceTurnsRemaining = Math.max(m.iceTurnsRemaining, eff.addedIceTurns);
    if (eff.plantedDynamiteFuse !== null) {
      m.dynamiteTurnsRemaining = eff.plantedDynamiteFuse;
    }
    if (m.hp <= 0) {
      return this.killMonster(attacker, m, eff.directDamage);
    }
    return { damage: eff.directDamage, killed: false, vpGained: 0 };
  }

  private killMonster(
    attacker: InternalPlayer,
    m: MonsterInstance,
    damage: number,
  ): { damage: number; killed: boolean; vpGained: number } {
    m.zone = 'graveyard';
    m.hp = 0;
    attacker.vp += m.vp;
    // award loot from the def
    const def = MONSTERS[m.defId];
    for (const lootId of def.loot) {
      attacker.weapons.push({
        weaponId: lootId,
        usesRemaining: WEAPONS[lootId].uses,
      });
    }
    // pull next standby into battlefield
    const nextStandby = this.monsters.find((mm) => mm.zone === 'standby');
    if (nextStandby) nextStandby.zone = 'battlefield';
    return { damage, killed: true, vpGained: m.vp };
  }

  private applyAttackToPlayer(
    attacker: InternalPlayer,
    targetId: string,
    weaponId: WeaponId,
    damageOverride?: number,
  ): { damage: number; killed: boolean; vpGained: number } {
    const target = this.players.get(targetId);
    if (!target) throw new Error('unknown player target');
    if (target.id === attacker.id) throw new Error('cannot target self');
    if (target.isEliminated) throw new Error('target already eliminated');
    const eff = effectFor(weaponId, damageOverride);
    // players have no HP bar — any successful hit chips VP equal to damage
    // (capped at remaining VP). When VP hits 0, they're eliminated and the
    // attacker takes their remaining VP + weapons.
    const dmg = eff.directDamage;
    const stolenVp = Math.min(target.vp, dmg);
    target.vp -= stolenVp;
    attacker.vp += stolenVp;
    if (target.vp <= 0) {
      target.isEliminated = true;
      // attacker takes the rest of the loot
      attacker.weapons.push(...target.weapons);
      target.weapons = [];
      // remove from turn order (will be re-ranked at end of round anyway)
      this.turnOrder = this.turnOrder.filter((id) => id !== target.id);
      return { damage: dmg, killed: true, vpGained: stolenVp };
    }
    return { damage: dmg, killed: false, vpGained: stolenVp };
  }

  // ─── phase machine ─────────────────────────────────────────────────────

  private advanceFromPhase(from: HalloweenPhase): void {
    switch (from) {
      case 'alliance':
        this.beginRound(1);
        break;
      case 'turn':
        // timeout: forfeit the turn (no attack); skip directly to resolve so
        // CPU/players still see motion. We log a no-op resolve.
        this.lastAttack = null;
        this.setPhase('resolve');
        break;
      case 'resolve':
        this.afterResolve();
        break;
      case 'shop':
        this.afterShop();
        break;
      default:
        break;
    }
  }

  private setPhase(phase: HalloweenPhase): void {
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

  private beginRound(round: number): void {
    this.round = round;
    this.tickStatusEffects();
    if (this.checkWinCondition()) return;
    this.rebuildTurnOrder();
    this.currentTurnIndex = 0;
    this.beginCurrentTurn();
  }

  private beginCurrentTurn(): void {
    const active = this.activePlayers();
    if (active.length === 0) {
      this.finish();
      return;
    }
    if (this.currentTurnIndex >= this.turnOrder.length) {
      // round complete — go to shop, then start next round
      this.setPhase('shop');
      return;
    }
    // skip eliminated/disconnected players' slots
    while (
      this.currentTurnIndex < this.turnOrder.length &&
      this.players.get(this.turnOrder[this.currentTurnIndex])?.isEliminated
    ) {
      this.currentTurnIndex += 1;
    }
    if (this.currentTurnIndex >= this.turnOrder.length) {
      this.setPhase('shop');
      return;
    }
    this.lastAttack = null;
    this.setPhase('turn');
  }

  private afterResolve(): void {
    this.currentTurnIndex += 1;
    if (this.checkWinCondition()) return;
    this.beginCurrentTurn();
  }

  private afterShop(): void {
    if (this.checkWinCondition()) return;
    if (this.round >= this.totalRounds) {
      this.finish();
      return;
    }
    this.beginRound(this.round + 1);
  }

  private checkWinCondition(): boolean {
    // win when all monsters are dead OR only one player remains
    const liveMonsters = this.monsters.filter((m) => m.zone !== 'graveyard');
    const live = this.activePlayers();
    if (liveMonsters.length === 0 || live.length <= 1) {
      this.finish();
      return true;
    }
    return false;
  }

  private finish(): void {
    this.setPhase('finished');
  }

  // ─── periodic effects ──────────────────────────────────────────────────

  private tickStatusEffects(): void {
    for (const m of this.monsters) {
      if (m.zone === 'graveyard') continue;
      // poison ticks 1 dmg per stack
      if (m.poisonStacks > 0) {
        m.hp = Math.max(0, m.hp - m.poisonStacks);
        if (m.hp === 0) {
          // poison kill — no specific attacker; loot goes to graveyard
          m.zone = 'graveyard';
          const nextStandby = this.monsters.find((mm) => mm.zone === 'standby');
          if (nextStandby) nextStandby.zone = 'battlefield';
          continue;
        }
      }
      // ice thaw
      if (m.iceTurnsRemaining > 0) m.iceTurnsRemaining -= 1;
      // dynamite countdown
      if (m.dynamiteTurnsRemaining !== null) {
        if (m.dynamiteTurnsRemaining <= 0) {
          m.hp = Math.max(0, m.hp - 10);
          m.dynamiteTurnsRemaining = null;
          if (m.hp === 0) {
            m.zone = 'graveyard';
            const nextStandby = this.monsters.find((mm) => mm.zone === 'standby');
            if (nextStandby) nextStandby.zone = 'battlefield';
          }
        } else {
          m.dynamiteTurnsRemaining -= 1;
        }
      }
    }
  }

  // ─── setup / state derivation ──────────────────────────────────────────

  private spawnMonsters(): void {
    let counter: Partial<Record<MonsterId, number>> = {};
    this.monsters = SPAWN_LIST.map((id, i) => {
      counter[id] = (counter[id] ?? 0) + 1;
      const def = MONSTERS[id];
      return {
        instanceId: `${id}_${counter[id]}`,
        defId: id,
        hp: def.hp,
        maxHp: def.hp,
        vp: def.vp,
        zone: i < BATTLEFIELD_SIZE ? ('battlefield' as const) : ('standby' as const),
        poisonStacks: 0,
        iceTurnsRemaining: 0,
        dynamiteTurnsRemaining: null,
      };
    });
  }

  private rebuildTurnOrder(): void {
    const active = this.activePlayers();
    // sort by VP desc, name asc as tiebreak so the order is deterministic
    active.sort((a, b) => (b.vp - a.vp) || a.name.localeCompare(b.name));
    this.turnOrder = active.map((p) => p.id);
    this.assignTurnSlots();
  }

  // every round, exactly ONE slot is the player-target slot (Hidden Twist).
  // We pick deterministically based on round number so it's reproducible
  // but the table can't predict the slot until the twist fires.
  private assignTurnSlots(): void {
    const targetSlotIdx = this.turnOrder.length > 1 ? this.round % this.turnOrder.length : -1;
    for (const p of this.players.values()) {
      const idx = this.turnOrder.indexOf(p.id);
      p.turnSlot = idx;
      p.isPlayerTargetSlot = idx >= 0 && idx === targetSlotIdx;
    }
  }

  private activePlayers(): InternalPlayer[] {
    return Array.from(this.players.values()).filter((p) => !p.isEliminated);
  }

  private freshPlayer(id: string, name: string): InternalPlayer {
    return {
      id,
      name,
      isConnected: true,
      vp: STARTING_VP,
      weapons: [{ ...STARTING_DAGGER }],
      specialItems: [],
      isEliminated: false,
      allianceId: null,
      pendingAllianceInvites: [],
      turnSlot: -1,
      isPlayerTargetSlot: false,
      pieceDelta: 0,
    };
  }

  private statusFor(): GameState['status'] {
    if (this.phase === 'waiting') return 'waiting';
    if (this.phase === 'finished') return 'finished';
    return 'in_progress';
  }

  private publicPlayerStates(): PlayerState[] {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isConnected: p.isConnected,
    }));
  }

  private publicHalloweenState(): HalloweenPublicState {
    const players: PlayerPublic[] = Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      vp: p.vp,
      weaponCount: p.weapons.length,
      isEliminated: p.isEliminated,
      allianceId: p.allianceId,
      turnSlot: p.turnSlot,
      // only expose the player-target marker AFTER the twist has fired,
      // so the lineup styling stays mysterious until that point
      isPlayerTargetSlot: this.twistRevealed && p.isPlayerTargetSlot,
    }));
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: this.totalRounds,
      phaseDeadline: this.phaseDeadline,
      currentPlayerId:
        this.phase === 'turn' || this.phase === 'resolve'
          ? this.turnOrder[this.currentTurnIndex] ?? null
          : null,
      players,
      monsters: this.monsters.map((m) => ({ ...m })),
      alliances: Array.from(this.alliances.values()).map((a) => ({
        ...a,
        memberIds: [...a.memberIds],
      })),
      twistRevealed: this.twistRevealed,
      lastAttack: this.lastAttack,
    };
  }

  private privateFor(p: InternalPlayer): PlayerPrivate {
    return {
      weapons: p.weapons.map((w) => ({ ...w })),
      specialItems: p.specialItems.map((i) => ({ ...i })),
      allianceId: p.allianceId,
      pendingAllianceInvites: [...p.pendingAllianceInvites],
    };
  }
}
