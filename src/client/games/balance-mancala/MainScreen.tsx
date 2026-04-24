import { motion } from 'motion/react';
import { Trophy, Sparkles } from 'lucide-react';
import { PhaseTimer } from '../../primitives/PhaseTimer';
import { socket } from '../../lib/socket';
import type { Dish, DishColor, MancalaPublicState } from './types';

const PHASE_LABELS: Record<string, string> = {
  waiting: 'Waiting for players',
  placement: 'Placement — drop your stones',
  playing: 'Sow & score',
  finished: 'Game over',
};

// dish color → tailwind class trio (bg, border, ring)
const DISH_THEME: Record<DishColor, { bg: string; ring: string; label: string; text: string }> = {
  R: { bg: 'bg-red-500/15', ring: 'ring-red-400/40', label: 'RED', text: 'text-red-300' },
  B: { bg: 'bg-blue-500/15', ring: 'ring-blue-400/40', label: 'BLUE', text: 'text-blue-300' },
  G: { bg: 'bg-emerald-500/15', ring: 'ring-emerald-400/40', label: 'GREEN', text: 'text-emerald-300' },
  W: { bg: 'bg-white/10', ring: 'ring-white/40', label: 'ANGEL', text: 'text-white' },
  K: { bg: 'bg-zinc-950 border-zinc-700', ring: 'ring-zinc-600', label: 'DEVIL', text: 'text-zinc-400' },
};

// stable per-player ARGB used for stone tinting. derived from the player's
// id; not the same as their dicebear avatar but consistent.
function ownerColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) & 0xfff;
  return `hsl(${h % 360}, 70%, 60%)`;
}

function ringPosition(index: number, total: number, radius: number): { x: number; y: number } {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2; // start at top
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function DishView({
  dish,
  isCurrent,
  highlight,
  size,
}: {
  dish: Dish;
  isCurrent: boolean;
  highlight: boolean;
  size: number;
}) {
  const theme = DISH_THEME[dish.color];
  return (
    <motion.div
      animate={{
        scale: highlight ? 1.12 : 1,
        boxShadow: highlight ? '0 0 30px rgba(255,255,255,0.4)' : '0 0 0 rgba(0,0,0,0)',
      }}
      transition={{ duration: 0.2 }}
      className={`absolute rounded-full flex flex-col items-center justify-center ${theme.bg} ring-2 ${theme.ring} ${isCurrent ? 'outline outline-2 outline-white' : ''}`}
      style={{ width: size, height: size }}
    >
      <div className={`text-[8px] font-black uppercase tracking-[0.2em] ${theme.text} mt-1`}>
        {theme.label}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-[2px] px-1 py-1 max-w-full">
        {dish.stones.slice(0, 12).map((s, i) => (
          <span
            key={i}
            className="inline-block rounded-full"
            style={{
              width: 8,
              height: 8,
              background: ownerColor(s.ownerId),
              border: '1px solid rgba(0,0,0,0.4)',
            }}
          />
        ))}
        {dish.stones.length > 12 && (
          <span className="text-[8px] font-bold text-white/80">+{dish.stones.length - 12}</span>
        )}
      </div>
      <div className="text-[9px] font-mono text-white/40 mb-1">{dish.index}</div>
    </motion.div>
  );
}

export function BalanceMancalaMainScreen({
  state,
  isHost,
  onReturnToLobby,
}: {
  state: MancalaPublicState;
  isHost: boolean;
  onReturnToLobby: () => void;
}) {
  const ringRadius = 240;
  const dishSize = 96;
  const ringDiameter = (ringRadius + dishSize / 2) * 2;
  const currentPlayer = state.players.find((p) => p.id === state.currentPlayerId);
  const winner = state.winnerId ? state.players.find((p) => p.id === state.winnerId) : null;
  const lastMove = state.lastMove;

  return (
    <div className="min-h-screen bg-black text-white px-12 pt-12 pb-12 flex flex-col gap-8 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* header */}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-2xl">
            <Sparkles size={28} className="text-black" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">
              Balance Mancala
            </h1>
            <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-[0.4em] mt-2">
              {PHASE_LABELS[state.phase] ?? state.phase}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 min-w-[260px]">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
            {currentPlayer ? `Turn: ${currentPlayer.name}` : '—'}
          </div>
          <PhaseTimer deadline={state.phaseDeadline} />
        </div>
      </div>

      {/* ring + scoreboard */}
      <div className="flex-1 flex items-center justify-center gap-12 relative z-10">
        <div className="relative" style={{ width: ringDiameter, height: ringDiameter }}>
          {state.dishes.map((dish) => {
            const pos = ringPosition(dish.index, state.dishes.length, ringRadius);
            const isLanded = lastMove?.landedAt === dish.index;
            const isPicked = lastMove?.dishIndex === dish.index;
            return (
              <div
                key={dish.index}
                className="absolute"
                style={{
                  left: ringDiameter / 2 + pos.x - dishSize / 2,
                  top: ringDiameter / 2 + pos.y - dishSize / 2,
                  width: dishSize,
                  height: dishSize,
                }}
              >
                <DishView dish={dish} isCurrent={false} highlight={isLanded || isPicked} size={dishSize} />
              </div>
            );
          })}

          {/* center label */}
          <div
            className="absolute flex flex-col items-center justify-center text-center"
            style={{
              left: ringDiameter / 2 - 90,
              top: ringDiameter / 2 - 45,
              width: 180,
              height: 90,
            }}
          >
            {winner ? (
              <>
                <Trophy size={32} className="text-white mb-2" />
                <div className="text-xs font-black uppercase tracking-tight">{winner.name}</div>
                <div className="text-[8px] font-bold uppercase tracking-[0.3em] text-zinc-500">winner</div>
              </>
            ) : (
              <>
                <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-600">
                  {state.phase === 'placement' ? 'Place stones' : 'Sow clockwise'}
                </div>
                {lastMove?.scored && (
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white mt-2">
                    +{lastMove.scored.amount}{' '}
                    <span style={{ color: ownerColor(lastMove.scored.ownerId) }}>
                      {lastMove.scored.color}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* scoreboard */}
        <div className="flex flex-col gap-3 max-w-md">
          <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-500 mb-1">
            Scoreboard
          </div>
          {[...state.players]
            .sort((a, b) => b.finalScore - a.finalScore)
            .map((p) => {
              const isCurrent = p.id === state.currentPlayerId;
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-4 flex flex-col gap-2 min-w-[260px] ${
                    isCurrent ? 'border-white/40 bg-white/10' : 'border-white/5 bg-zinc-900/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block rounded-full"
                        style={{
                          width: 10,
                          height: 10,
                          background: ownerColor(p.id),
                          border: '1px solid rgba(255,255,255,0.2)',
                        }}
                      />
                      <span className="text-xs font-bold uppercase tracking-widest">{p.name}</span>
                    </div>
                    <span className="text-2xl font-black tracking-tighter">{p.finalScore}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                    <span className="text-red-400">R {p.totals.R}</span>
                    <span className="text-blue-400">B {p.totals.B}</span>
                    <span className="text-emerald-400">G {p.totals.G}</span>
                    {state.phase === 'placement' && (
                      <span className="ml-auto text-zinc-500">{p.stonesToPlace} left</span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* host controls */}
      {isHost && (
        <>
          <div className="absolute bottom-6 left-6 flex gap-2 z-20">
            <button
              onClick={() => socket.emit('host-skip-phase')}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-white/10 hover:text-white transition-all"
            >
              Skip Turn
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
