import { motion } from 'motion/react';
import { Skull, Trophy, Crown, Swords } from 'lucide-react';
import { PhaseTimer } from '../../primitives/PhaseTimer';
import { socket } from '../../lib/socket';
import {
  type HalloweenPublicState,
  type MonsterInstance,
  MONSTER_LABELS,
  WEAPON_LABELS,
} from './types';

const PHASE_LABELS: Record<string, string> = {
  alliance: 'Alliance phase',
  turn: 'Dealer room',
  resolve: 'Resolve',
  shop: 'Shop',
  finished: 'Game over',
};

export function HalloweenMonsterMainScreen({
  state,
  isHost,
  onReturnToLobby,
}: {
  state: HalloweenPublicState;
  isHost: boolean;
  onReturnToLobby: () => void;
}) {
  const battlefield = state.monsters.filter((m) => m.zone === 'battlefield');
  const standby = state.monsters.filter((m) => m.zone === 'standby');
  const graveyard = state.monsters.filter((m) => m.zone === 'graveyard');
  const sortedPlayers = [...state.players].sort((a, b) => b.vp - a.vp);
  const lineup = [...state.players]
    .filter((p) => p.turnSlot >= 0)
    .sort((a, b) => a.turnSlot - b.turnSlot);

  return (
    <div className="min-h-screen bg-black text-white px-12 pt-12 pb-28 flex flex-col gap-8 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 2px 2px, rgba(255,140,40,0.6) 1px, transparent 0)',
          backgroundSize: '36px 36px',
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-orange-500/30">
            <Skull size={32} className="text-black" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">
              Halloween Monster
            </h1>
            <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-[0.4em] mt-2">
              Round {state.round} / {state.totalRounds}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 min-w-[220px]">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
            {PHASE_LABELS[state.phase] ?? state.phase}
          </div>
          <PhaseTimer deadline={state.phaseDeadline} />
        </div>
      </div>

      {/* Turn-order lineup with twist styling */}
      <div className="relative z-10">
        <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-500 mb-3">
          Turn order
        </div>
        <div className="flex flex-wrap gap-3">
          {lineup.map((p) => {
            const isCurrent = state.currentPlayerId === p.id;
            // double-border slot: visually distinct from the start, meaning
            // unexplained until twist fires
            const isTwistSlot = p.isPlayerTargetSlot;
            return (
              <div
                key={p.id}
                className={`relative px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest ${
                  isCurrent
                    ? 'bg-orange-500 text-black border-2 border-orange-300'
                    : isTwistSlot
                      ? 'bg-zinc-900 text-white border-double border-4 border-orange-500/60'
                      : 'bg-zinc-900 text-zinc-400 border border-white/10'
                }`}
              >
                <span className="text-[7px] text-zinc-500 mr-2">#{p.turnSlot + 1}</span>
                {p.name}
                <span className="ml-2 text-zinc-500">{p.vp} VP</span>
              </div>
            );
          })}
        </div>
        {state.twistRevealed && (
          <div className="mt-3 text-[9px] font-bold uppercase tracking-[0.3em] text-orange-400">
            Twist revealed — double-bordered slots are player-targets.
          </div>
        )}
      </div>

      {/* Monster zones */}
      <div className="relative z-10 flex-1 flex flex-col gap-6">
        <MonsterZone
          title="Battlefield"
          subtitle="Attackable now"
          monsters={battlefield}
          doubleBorder
        />
        <MonsterZone
          title="Standby"
          subtitle="Queued"
          monsters={standby}
        />
        {graveyard.length > 0 && (
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">
            Graveyard: {graveyard.length} dead
          </div>
        )}
      </div>

      {/* Last attack flash */}
      {state.lastAttack && state.phase === 'resolve' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 mx-auto bg-orange-500/10 border border-orange-500/50 rounded-xl px-6 py-3 flex items-center gap-4"
        >
          <Swords className="text-orange-400" size={18} />
          <div className="text-[11px] font-bold uppercase tracking-widest text-white">
            {state.players.find((p) => p.id === state.lastAttack?.attackerId)?.name}
            {' → '}
            {WEAPON_LABELS[state.lastAttack.weaponUsed]}
            {state.lastAttack.killed && (
              <span className="ml-2 text-orange-400">KILL</span>
            )}
            {state.lastAttack.vpGained > 0 && (
              <span className="ml-2 text-zinc-400">+{state.lastAttack.vpGained} VP</span>
            )}
          </div>
        </motion.div>
      )}

      {/* VP leaderboard */}
      <div className="relative z-10 border-t border-white/5 pt-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-500 mb-4">
          Leaderboard
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {sortedPlayers.map((p, i) => (
            <div
              key={p.id}
              className={`rounded-xl border p-4 flex flex-col gap-2 ${
                p.isEliminated
                  ? 'border-red-500/20 bg-red-500/5 opacity-60'
                  : i === 0
                    ? 'border-orange-500/40 bg-orange-500/5'
                    : 'border-white/5 bg-zinc-900/40'
              }`}
            >
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 truncate flex items-center gap-1">
                {i === 0 && !p.isEliminated && <Crown size={10} className="text-orange-400" />}
                {p.name}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tracking-tighter">{p.vp}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">VP</span>
              </div>
              <div className="text-[8px] font-bold uppercase tracking-widest text-zinc-500">
                {p.weaponCount} weapon{p.weaponCount === 1 ? '' : 's'}
              </div>
              {p.allianceId && (
                <div className="text-[7px] font-bold uppercase tracking-[0.3em] text-orange-300">
                  {state.alliances.find((a) => a.id === p.allianceId)?.name ?? 'allied'}
                </div>
              )}
              {p.isEliminated && (
                <div className="text-[7px] font-bold uppercase tracking-[0.3em] text-red-400">out</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {state.phase === 'finished' && (
        <div className="relative z-10 text-center space-y-4">
          <Trophy size={48} className="mx-auto text-orange-400" />
          <h2 className="text-3xl font-black uppercase tracking-tighter">Hunt complete</h2>
        </div>
      )}

      {/* Host controls */}
      {isHost && (
        <>
          <div className="absolute bottom-6 left-6 flex gap-2 z-20">
            <button
              onClick={() => socket.emit('host-skip-phase')}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-white/10 hover:text-white transition-all"
            >
              Skip Phase
            </button>
          </div>
          <button
            onClick={onReturnToLobby}
            className="absolute bottom-6 right-6 z-20 px-4 py-2 bg-red-500/10 border border-red-500/40 rounded-lg text-[9px] font-bold uppercase tracking-widest text-red-300 hover:bg-red-500/20 hover:text-white transition-all"
          >
            End Game
          </button>
        </>
      )}
    </div>
  );
}

function MonsterZone({
  title,
  subtitle,
  monsters,
  doubleBorder,
}: {
  title: string;
  subtitle: string;
  monsters: MonsterInstance[];
  doubleBorder?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-5 ${
        doubleBorder
          ? 'border-double border-4 border-orange-500/40 bg-orange-500/[0.03]'
          : 'border border-white/10 bg-zinc-900/40'
      }`}
    >
      <div className="flex items-baseline justify-between mb-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-400">
          {title}
        </div>
        <div className="text-[8px] font-bold uppercase tracking-[0.3em] text-zinc-600">
          {subtitle}
        </div>
      </div>
      {monsters.length === 0 ? (
        <div className="text-zinc-600 text-xs italic">empty</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {monsters.map((m) => (
            <MonsterCard key={m.instanceId} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MonsterCard({ m }: { m: MonsterInstance }) {
  const pct = (m.hp / m.maxHp) * 100;
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-black uppercase tracking-tight">
          {MONSTER_LABELS[m.defId]}
        </div>
        <div className="text-[9px] font-bold uppercase tracking-widest text-orange-400">
          {m.vp} VP
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[8px] font-bold uppercase tracking-widest text-zinc-500">
          <span>HP</span>
          <span>
            {m.hp} / {m.maxHp}
          </span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-400 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1 text-[8px] font-bold uppercase tracking-widest">
        {m.poisonStacks > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">
            poison ×{m.poisonStacks}
          </span>
        )}
        {m.iceTurnsRemaining > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
            frozen {m.iceTurnsRemaining}
          </span>
        )}
        {m.dynamiteTurnsRemaining !== null && (
          <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">
            dynamite {m.dynamiteTurnsRemaining}
          </span>
        )}
      </div>
    </div>
  );
}
