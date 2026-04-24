import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Trophy } from 'lucide-react';
import { PhaseTimer } from '../../primitives/PhaseTimer';
import { socket } from '../../lib/socket';
import type { Dish, DishColor, MancalaStateForPlayer } from './types';
import { RING_SIZE } from './types';

const DISH_LABEL: Record<DishColor, string> = {
  R: 'RED',
  B: 'BLUE',
  G: 'GREEN',
  W: 'ANGEL',
  K: 'DEVIL',
};

const DISH_BG: Record<DishColor, string> = {
  R: 'bg-red-500/20 border-red-400/40',
  B: 'bg-blue-500/20 border-blue-400/40',
  G: 'bg-emerald-500/20 border-emerald-400/40',
  W: 'bg-white/15 border-white/40',
  K: 'bg-zinc-950 border-zinc-700',
};

function ownerColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) & 0xfff;
  return `hsl(${h % 360}, 70%, 60%)`;
}

// preview where each picked stone would land if you sowed from `dishIndex`.
// matches the server engine (sowAndScore in src/games/balance-mancala/rules.ts).
function previewSow(dishes: Dish[], dishIndex: number): { landedAt: number; trail: number[] } {
  const stones = dishes[dishIndex].stones.length;
  if (stones === 0) return { landedAt: dishIndex, trail: [] };
  const trail: number[] = [];
  let cursor = dishIndex;
  for (let i = 0; i < stones; i += 1) {
    cursor = (cursor + 1) % RING_SIZE;
    trail.push(cursor);
  }
  return { landedAt: cursor, trail };
}

export function BalanceMancalaPhone({ state }: { state: MancalaStateForPlayer }) {
  const me = state.me;
  const myId = me?.playerId ?? null;
  const myPublic = state.players.find((p) => p.id === myId);
  const isMyTurn = myId !== null && state.currentPlayerId === myId;
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  // clear preview on any turn / phase change so stale highlights don't linger
  useEffect(() => {
    setPreviewIdx(null);
  }, [state.currentPlayerId, state.phase]);

  if (!me) {
    return (
      <div className="min-h-screen bg-black p-6 flex items-center justify-center">
        <div className="text-zinc-500 text-xs uppercase font-bold tracking-widest">Spectating</div>
      </div>
    );
  }

  const tappableIndices: number[] = (() => {
    if (!isMyTurn) return [];
    if (state.phase === 'placement') {
      return Array.from({ length: RING_SIZE }, (_, i) => i);
    }
    if (state.phase === 'playing') {
      return state.dishes
        .filter((d) => d.stones.some((s) => s.ownerId === myId))
        .map((d) => d.index);
    }
    return [];
  })();

  const preview = previewIdx !== null && state.phase === 'playing' ? previewSow(state.dishes, previewIdx) : null;
  const previewLandedColor = preview ? state.dishes[preview.landedAt].color : null;

  const handleConfirm = () => {
    if (previewIdx === null) return;
    if (state.phase === 'placement') {
      socket.emit('game-action', {
        type: 'mancala/place-initial',
        payload: { dishIndex: previewIdx },
      });
    } else if (state.phase === 'playing') {
      socket.emit('game-action', {
        type: 'mancala/pick-dish',
        payload: { dishIndex: previewIdx },
      });
    }
    setPreviewIdx(null);
  };

  return (
    <div className="min-h-screen bg-black text-white p-5 flex flex-col gap-4 selection:bg-white selection:text-black">
      {/* chrome */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">You</div>
          <div className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
            <span
              className="inline-block rounded-full"
              style={{
                width: 12,
                height: 12,
                background: ownerColor(myId ?? ''),
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            />
            {myPublic?.name ?? 'Player'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">Final</div>
          <div className="text-lg font-black tracking-tighter">{myPublic?.finalScore ?? 0}</div>
        </div>
      </div>

      <PhaseTimer
        deadline={state.phaseDeadline}
        label={isMyTurn ? 'Your turn' : `Turn: ${state.players.find((p) => p.id === state.currentPlayerId)?.name ?? '—'}`}
      />

      {/* color totals */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-red-500/10 border border-red-400/20 px-3 py-2 text-center">
          <div className="text-[8px] font-bold uppercase tracking-[0.3em] text-red-300">RED</div>
          <div className="text-xl font-black">{myPublic?.totals.R ?? 0}</div>
        </div>
        <div className="rounded-xl bg-blue-500/10 border border-blue-400/20 px-3 py-2 text-center">
          <div className="text-[8px] font-bold uppercase tracking-[0.3em] text-blue-300">BLUE</div>
          <div className="text-xl font-black">{myPublic?.totals.B ?? 0}</div>
        </div>
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/20 px-3 py-2 text-center">
          <div className="text-[8px] font-bold uppercase tracking-[0.3em] text-emerald-300">GREEN</div>
          <div className="text-xl font-black">{myPublic?.totals.G ?? 0}</div>
        </div>
      </div>

      {/* dish grid */}
      <div className="text-center text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500 mt-2">
        {state.phase === 'placement'
          ? `Placement — ${myPublic?.stonesToPlace ?? 0} stones left`
          : state.phase === 'playing'
            ? 'Pick a dish you own'
            : state.phase === 'finished'
              ? 'Game over'
              : 'Waiting'}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {state.dishes.map((dish) => {
          const tappable = tappableIndices.includes(dish.index);
          const isPreviewed = previewIdx === dish.index;
          const isInTrail = preview?.trail.includes(dish.index) ?? false;
          const isLandedPreview = preview?.landedAt === dish.index;
          return (
            <motion.button
              key={dish.index}
              whileTap={tappable ? { scale: 0.95 } : {}}
              disabled={!tappable}
              onClick={() => setPreviewIdx(dish.index)}
              className={`relative aspect-square rounded-xl border-2 p-1 flex flex-col items-center justify-center transition-all ${DISH_BG[dish.color]} ${
                isPreviewed
                  ? 'ring-2 ring-white scale-105'
                  : isLandedPreview
                    ? 'ring-2 ring-yellow-300'
                    : isInTrail
                      ? 'ring-1 ring-white/40'
                      : ''
              } ${!tappable ? 'opacity-50' : ''}`}
            >
              <div className="text-[7px] font-black uppercase tracking-widest opacity-80">
                {DISH_LABEL[dish.color]}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-[2px] py-1 max-w-full">
                {dish.stones.slice(0, 8).map((s, i) => (
                  <span
                    key={i}
                    className="inline-block rounded-full"
                    style={{
                      width: 7,
                      height: 7,
                      background: ownerColor(s.ownerId),
                      border: '1px solid rgba(0,0,0,0.4)',
                    }}
                  />
                ))}
                {dish.stones.length > 8 && (
                  <span className="text-[8px] font-bold">+{dish.stones.length - 8}</span>
                )}
              </div>
              <div className="text-[8px] font-mono text-white/40">{dish.index}</div>
            </motion.button>
          );
        })}
      </div>

      {/* preview / confirm */}
      {previewIdx !== null && state.phase === 'playing' && preview && previewLandedColor && (
        <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-[10px] uppercase tracking-widest text-zinc-300">
          Land on dish <span className="text-white font-bold">{preview.landedAt}</span> ({DISH_LABEL[previewLandedColor]}). Final stack:{' '}
          <span className="text-white font-bold">
            {(() => {
              // start from current stones, subtract picked-up if source is landed,
              // add every trail entry that hits the landed dish.
              const base = state.dishes[preview.landedAt].stones.length;
              const removed = previewIdx === preview.landedAt ? state.dishes[previewIdx].stones.length : 0;
              const added = preview.trail.filter((i) => i === preview.landedAt).length;
              return base - removed + added;
            })()}
          </span>
        </div>
      )}

      <button
        disabled={previewIdx === null || !isMyTurn}
        onClick={handleConfirm}
        className={`mt-auto py-4 rounded-xl font-bold uppercase tracking-widest text-xs transition-all ${
          previewIdx !== null && isMyTurn
            ? 'bg-white text-black hover:bg-zinc-200'
            : 'bg-zinc-900 text-zinc-600 border border-white/5'
        }`}
      >
        {!isMyTurn ? (
          'Waiting for turn'
        ) : previewIdx === null ? (
          'Tap a dish'
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Check size={14} /> Confirm dish {previewIdx}
          </span>
        )}
      </button>

      {state.phase === 'finished' && (
        <div className="text-center mt-4">
          <Trophy size={32} className="mx-auto text-white" />
          <div className="text-sm font-black uppercase tracking-widest mt-2">
            {state.winnerId === myId ? 'You won!' : `${state.players.find((p) => p.id === state.winnerId)?.name ?? '—'} wins`}
          </div>
        </div>
      )}
    </div>
  );
}
