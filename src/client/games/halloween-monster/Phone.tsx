import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Skull, Trophy, Sword, Users, ShoppingBag } from 'lucide-react';
import { PhaseTimer } from '../../primitives/PhaseTimer';
import { socket } from '../../lib/socket';
import {
  type HalloweenStateForPlayer,
  type WeaponId,
  WEAPON_LABELS,
  WEAPON_DAMAGE,
  MONSTER_LABELS,
} from './types';

export function HalloweenMonsterPhone({ state }: { state: HalloweenStateForPlayer }) {
  const me = state.me;
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponId | null>(null);
  const [allianceName, setAllianceName] = useState('');
  const [allianceInvites, setAllianceInvites] = useState<string[]>([]);
  const [transferTo, setTransferTo] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<number>(1);

  useEffect(() => {
    if (state.phase !== 'turn') setSelectedWeapon(null);
  }, [state.phase, state.currentPlayerId]);

  if (!me) {
    return (
      <div className="min-h-screen bg-black p-6 flex items-center justify-center">
        <div className="text-center text-zinc-500 text-xs uppercase font-bold tracking-widest">
          Spectating
        </div>
      </div>
    );
  }

  const myPublic = state.players.find((p) => p.id === me.playerId);
  const isMyTurn = state.phase === 'turn' && state.currentPlayerId === me.playerId;
  const isEliminated = myPublic?.isEliminated ?? false;
  const myAlliance = me.private.allianceId
    ? state.alliances.find((a) => a.id === me.private.allianceId)
    : null;

  const submitAttack = (
    targetType: 'monster' | 'player',
    targetId: string,
  ) => {
    if (!selectedWeapon) return;
    socket.emit('game-action', {
      type: 'halloween/attack',
      payload: { targetType, targetId, weaponId: selectedWeapon },
    });
    setSelectedWeapon(null);
  };

  const submitFormAlliance = () => {
    if (!allianceName.trim()) return;
    socket.emit('game-action', {
      type: 'halloween/form-alliance',
      payload: { name: allianceName.trim(), inviteIds: allianceInvites },
    });
    setAllianceName('');
    setAllianceInvites([]);
  };

  const submitTransfer = () => {
    if (!transferTo || transferAmount <= 0) return;
    socket.emit('game-action', {
      type: 'halloween/transfer-vp',
      payload: { toPlayerId: transferTo, amount: transferAmount },
    });
    setTransferTo('');
    setTransferAmount(1);
  };

  const submitBuy = (itemId: 'scouter' | 'change-order') => {
    socket.emit('game-action', {
      type: 'halloween/buy-item',
      payload: { itemId },
    });
  };

  return (
    <div className="min-h-screen bg-black text-white p-5 flex flex-col gap-5 selection:bg-orange-500 selection:text-black">
      {/* chrome */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
            <Skull size={18} className="text-black" />
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">You</div>
            <div className="text-lg font-black uppercase tracking-tight">{myPublic?.name}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">VP</div>
          <div className="text-2xl font-black tracking-tighter text-orange-400">{myPublic?.vp ?? 0}</div>
        </div>
      </div>

      <PhaseTimer
        deadline={state.phaseDeadline}
        label={`Round ${state.round} / ${state.totalRounds}`}
      />

      {isEliminated && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 text-center">
          <div className="text-sm font-black uppercase tracking-widest text-red-300">Eliminated</div>
        </div>
      )}

      {/* Alliance phase */}
      {state.phase === 'alliance' && !isEliminated && (
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
              Pre-game
            </div>
            <p className="text-sm text-zinc-300">
              Form an alliance (max 3) and/or transfer VP. The hunt begins when the timer ends.
            </p>
          </div>

          {!myAlliance ? (
            <div className="space-y-3 bg-zinc-900/50 border border-white/10 rounded-xl p-4">
              <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500 flex items-center gap-2">
                <Users size={11} /> Form alliance
              </div>
              <input
                value={allianceName}
                onChange={(e) => setAllianceName(e.target.value)}
                placeholder="Alliance name"
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
              />
              <div className="text-[9px] uppercase tracking-widest text-zinc-500">Invite up to 2:</div>
              <div className="flex flex-wrap gap-2">
                {state.players
                  .filter((p) => p.id !== me.playerId && !p.isEliminated && !p.allianceId)
                  .map((p) => {
                    const picked = allianceInvites.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() =>
                          setAllianceInvites((prev) =>
                            picked
                              ? prev.filter((id) => id !== p.id)
                              : prev.length < 2
                                ? [...prev, p.id]
                                : prev,
                          )
                        }
                        className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border ${
                          picked
                            ? 'bg-orange-500 text-black border-orange-300'
                            : 'bg-zinc-900 text-zinc-300 border-white/10'
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
              </div>
              <button
                onClick={submitFormAlliance}
                disabled={!allianceName.trim()}
                className="w-full py-3 rounded-xl font-bold uppercase tracking-widest text-xs bg-orange-500 text-black disabled:bg-zinc-800 disabled:text-zinc-600"
              >
                Form
              </button>
            </div>
          ) : (
            <div className="bg-orange-500/10 border border-orange-500/40 rounded-xl p-4 space-y-2">
              <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-orange-300">
                Your alliance
              </div>
              <div className="text-sm font-bold">{myAlliance.name}</div>
              <div className="text-xs text-zinc-400">
                {myAlliance.memberIds
                  .map((id) => state.players.find((p) => p.id === id)?.name ?? id)
                  .join(' · ')}
              </div>
            </div>
          )}

          <div className="space-y-3 bg-zinc-900/50 border border-white/10 rounded-xl p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500">
              Transfer VP
            </div>
            <select
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">Select recipient</option>
              {state.players
                .filter((p) => p.id !== me.playerId && !p.isEliminated)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <input
              type="number"
              min={1}
              max={myPublic?.vp ?? 0}
              value={transferAmount}
              onChange={(e) => setTransferAmount(parseInt(e.target.value) || 0)}
              className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            />
            <button
              onClick={submitTransfer}
              disabled={!transferTo || transferAmount <= 0 || transferAmount > (myPublic?.vp ?? 0)}
              className="w-full py-2 rounded-xl font-bold uppercase tracking-widest text-xs bg-white text-black disabled:bg-zinc-800 disabled:text-zinc-600"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Turn phase */}
      {state.phase === 'turn' && !isEliminated && (
        <>
          {isMyTurn ? (
            <div className="space-y-4">
              <div className="text-center bg-orange-500/10 border border-orange-500/40 rounded-xl py-3">
                <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-orange-300">
                  Your turn
                </div>
                <div className="text-sm text-zinc-300 mt-1">Pick a weapon, then a target.</div>
              </div>

              {/* weapon hand */}
              <div className="space-y-2">
                <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500 flex items-center gap-2">
                  <Sword size={11} /> Weapons
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {me.private.weapons.length === 0 && (
                    <div className="col-span-2 text-zinc-600 text-xs italic">no weapons</div>
                  )}
                  {me.private.weapons.map((w, i) => (
                    <button
                      key={`${w.weaponId}_${i}`}
                      onClick={() => setSelectedWeapon(w.weaponId)}
                      className={`p-3 rounded-xl border text-left ${
                        selectedWeapon === w.weaponId
                          ? 'bg-orange-500 text-black border-orange-300'
                          : 'bg-zinc-900 border-white/10 text-white'
                      }`}
                    >
                      <div className="text-[11px] font-black uppercase tracking-tight">
                        {WEAPON_LABELS[w.weaponId]}
                      </div>
                      <div
                        className={`text-[8px] font-bold uppercase tracking-widest ${
                          selectedWeapon === w.weaponId ? 'text-black/70' : 'text-zinc-500'
                        }`}
                      >
                        DMG {WEAPON_DAMAGE[w.weaponId]} ·{' '}
                        {w.usesRemaining === null ? 'reusable' : `${w.usesRemaining} use`}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* targets */}
              {selectedWeapon && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500">
                    Pick target
                  </div>
                  <div className="space-y-2">
                    {state.monsters
                      .filter((m) => m.zone === 'battlefield')
                      .map((m) => (
                        <button
                          key={m.instanceId}
                          onClick={() => submitAttack('monster', m.instanceId)}
                          className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-white/10 hover:border-orange-500/50 text-left"
                        >
                          <div>
                            <div className="text-sm font-bold uppercase tracking-tight">
                              {MONSTER_LABELS[m.defId]}
                            </div>
                            <div className="text-[9px] text-zinc-500 uppercase tracking-widest">
                              HP {m.hp}/{m.maxHp}
                            </div>
                          </div>
                          <div className="text-[9px] font-bold uppercase tracking-widest text-orange-400">
                            {m.vp} VP
                          </div>
                        </button>
                      ))}

                    {/* player-targets — always offered to anyone trying them */}
                    <div className="text-[8px] font-bold uppercase tracking-[0.3em] text-zinc-700 mt-3">
                      Other players (Hidden Twist)
                    </div>
                    {state.players
                      .filter((p) => p.id !== me.playerId && !p.isEliminated)
                      .map((p) => (
                        <button
                          key={p.id}
                          onClick={() => submitAttack('player', p.id)}
                          className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-900 border-double border-2 border-orange-500/30 hover:border-orange-500/70 text-left"
                        >
                          <div>
                            <div className="text-sm font-bold uppercase tracking-tight">{p.name}</div>
                            <div className="text-[9px] text-zinc-500 uppercase tracking-widest">
                              {p.vp} VP
                            </div>
                          </div>
                          <div className="text-[9px] font-bold uppercase tracking-widest text-red-300">
                            attack
                          </div>
                        </button>
                      ))}
                  </div>
                </motion.div>
              )}
            </div>
          ) : (
            <div className="text-center text-zinc-500 text-xs uppercase tracking-widest font-bold space-y-2">
              <div>Waiting for {state.players.find((p) => p.id === state.currentPlayerId)?.name}</div>
            </div>
          )}
        </>
      )}

      {/* Resolve phase */}
      {state.phase === 'resolve' && state.lastAttack && (
        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 space-y-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500">
            Last attack
          </div>
          <div className="text-sm">
            {state.players.find((p) => p.id === state.lastAttack?.attackerId)?.name} hit with{' '}
            <span className="font-bold">{WEAPON_LABELS[state.lastAttack.weaponUsed]}</span>
            {state.lastAttack.killed && <span className="text-orange-400 font-bold"> — KILL</span>}
          </div>
          {state.lastAttack.twistRevealed && (
            <div className="text-[9px] uppercase tracking-widest text-orange-400 font-bold">
              The Hidden Twist is revealed.
            </div>
          )}
        </div>
      )}

      {/* Shop phase */}
      {state.phase === 'shop' && !isEliminated && (
        <div className="space-y-3 bg-zinc-900/50 border border-white/10 rounded-xl p-4">
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500 flex items-center gap-2">
            <ShoppingBag size={11} /> Shop
          </div>
          <button
            onClick={() => submitBuy('scouter')}
            disabled={(myPublic?.vp ?? 0) < 2}
            className="w-full p-3 rounded-xl bg-zinc-900 border border-white/10 disabled:opacity-40 text-left"
          >
            <div className="text-[11px] font-black uppercase tracking-tight">Scouter — 2 VP</div>
            <div className="text-[8px] uppercase tracking-widest text-zinc-500">
              Peek a player's hand
            </div>
          </button>
          <button
            onClick={() => submitBuy('change-order')}
            disabled={(myPublic?.vp ?? 0) < 3}
            className="w-full p-3 rounded-xl bg-zinc-900 border border-white/10 disabled:opacity-40 text-left"
          >
            <div className="text-[11px] font-black uppercase tracking-tight">
              Change Order — 3 VP
            </div>
            <div className="text-[8px] uppercase tracking-widest text-zinc-500">
              Reorder turn lineup once
            </div>
          </button>
        </div>
      )}

      {state.phase === 'finished' && (
        <div className="text-center space-y-4 mt-8">
          <Trophy size={48} className="mx-auto text-orange-400" />
          <div className="text-2xl font-black uppercase tracking-tighter">Hunt over</div>
          <div className="text-sm text-zinc-400">Final VP: {myPublic?.vp ?? 0}</div>
        </div>
      )}

      {/* Footer: own hand summary always visible */}
      <div className="mt-auto pt-4 border-t border-white/5 grid grid-cols-2 gap-3 text-[9px] uppercase tracking-widest font-bold">
        <div>
          <div className="text-zinc-500">Hand</div>
          <div className="text-white">
            {me.private.weapons.length === 0
              ? '—'
              : me.private.weapons.map((w) => WEAPON_LABELS[w.weaponId]).join(', ')}
          </div>
        </div>
        <div>
          <div className="text-zinc-500">Items</div>
          <div className="text-white">
            {me.private.specialItems.length === 0
              ? '—'
              : me.private.specialItems.map((i) => i.itemId).join(', ')}
          </div>
        </div>
      </div>
    </div>
  );
}
