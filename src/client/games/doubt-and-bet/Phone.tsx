import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Coins, Layers, AlertTriangle, Plus, Minus, Trophy } from 'lucide-react';
import { PhaseTimer } from '../../primitives/PhaseTimer';
import { socket } from '../../lib/socket';
import {
  ALL_COLORS,
  COLOR_HEX,
  COLOR_LABEL,
  isLegalRaise,
  type Claim,
  type DoubtColor,
  type DoubtStateForPlayer,
} from './types';

export function DoubtAndBetPhone({ state }: { state: DoubtStateForPlayer }) {
  const me = state.me;
  const myPublic = me ? state.players.find((p) => p.id === me.playerId) : null;
  const totalTable = state.players
    .filter((p) => !p.isEliminated)
    .reduce((sum, p) => sum + p.cardCount, 0);

  // local form state for claim/raise picker
  const [pickN, setPickN] = useState<number>(1);
  const [pickColor, setPickColor] = useState<DoubtColor>('yellow');
  const [doubtModalOpen, setDoubtModalOpen] = useState(false);

  // when phase changes, reset picker defaults to be sensible
  useEffect(() => {
    if (state.phase === 'claiming') {
      setPickN(Math.max(1, Math.min(3, totalTable)));
      setPickColor('yellow');
    } else if (state.phase === 'responding' && state.currentClaim) {
      // default raise: same n + next color, or n+1 if at top color
      const next = nextLegalDefault(state.currentClaim, totalTable);
      setPickN(next.n);
      setPickColor(next.color);
    }
    setDoubtModalOpen(false);
  }, [state.phase, state.currentClaim?.n, state.currentClaim?.color, totalTable]);

  if (!me || !myPublic) {
    return (
      <div className="min-h-screen bg-black p-6 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-zinc-500 text-xs uppercase font-bold tracking-widest">Spectating</div>
        </div>
      </div>
    );
  }

  if (myPublic.isEliminated) {
    return (
      <div className="min-h-screen bg-black p-6 flex items-center justify-center text-center space-y-4">
        <div>
          <AlertTriangle size={48} className="mx-auto text-red-400" />
          <div className="text-2xl font-black uppercase tracking-tight mt-3">Eliminated</div>
          <div className="text-xs text-zinc-500 uppercase tracking-widest mt-2">
            Watch the main screen for the rest of the round.
          </div>
        </div>
      </div>
    );
  }

  const isMyTurnToClaim = state.phase === 'claiming' && state.activeSeat === me.seat;
  const isMyTurnToRespond = state.phase === 'responding' && state.responderSeat === me.seat;
  const canBuySlot =
    state.phase === 'buy-slot' &&
    !me.private.boughtSlotThisRound &&
    myPublic.slots < 5 &&
    myPublic.pieces >= 1;
  const neighbor = state.players.find((p) => p.id === me.neighborId);

  const submitClaim = () => {
    socket.emit('game-action', {
      type: 'doubt/claim',
      payload: { n: pickN, color: pickColor },
    });
  };
  const submitRaise = () => {
    if (!state.currentClaim) return;
    if (!isLegalRaise(state.currentClaim, { n: pickN, color: pickColor })) return;
    if (pickN > totalTable) return;
    socket.emit('game-action', {
      type: 'doubt/raise',
      payload: { n: pickN, color: pickColor },
    });
  };
  const submitDoubt = () => {
    socket.emit('game-action', { type: 'doubt/doubt', payload: {} });
    setDoubtModalOpen(false);
  };
  const submitBuySlot = () => {
    socket.emit('game-action', { type: 'doubt/buy-slot', payload: {} });
  };

  return (
    <div className="min-h-screen bg-black text-white p-5 flex flex-col gap-5">
      {/* chrome */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">You</div>
          <div className="text-lg font-black uppercase tracking-tight">{myPublic.name}</div>
        </div>
        <div className="text-right flex flex-col gap-0.5">
          <div className="flex items-center gap-2 justify-end">
            <Coins size={12} className="text-amber-300" />
            <span className="text-lg font-black tracking-tighter text-amber-200">
              {myPublic.pieces}
            </span>
          </div>
          <div className="flex items-center gap-2 justify-end text-zinc-300">
            <Layers size={11} />
            <span className="text-xs font-bold">{myPublic.slots} slots</span>
          </div>
        </div>
      </div>

      <PhaseTimer deadline={state.phaseDeadline} label={`Round ${state.round}`} />

      {/* Your cards */}
      <div className="space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Your cards
        </div>
        <div className="grid grid-cols-5 gap-2">
          {me.private.cards.map((card, i) => (
            <div
              key={i}
              className="aspect-[3/4] rounded-lg border-2 flex items-center justify-center font-black text-[10px] uppercase tracking-widest"
              style={{
                background: COLOR_HEX[card],
                borderColor: 'rgba(255,255,255,0.18)',
                color: card === 'yellow' || card === 'rainbow' ? '#000' : '#000',
              }}
            >
              {COLOR_LABEL[card].slice(0, 3)}
            </div>
          ))}
        </div>
      </div>

      {/* Current claim */}
      {state.currentClaim && (
        <div
          className="rounded-xl border-2 p-3 flex items-center justify-between"
          style={{
            borderColor: COLOR_HEX[state.currentClaim.color],
            background: `${COLOR_HEX[state.currentClaim.color]}10`,
          }}
        >
          <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-300">
            Current claim
          </div>
          <div className="text-xl font-black tracking-tighter">
            ≥ {state.currentClaim.n} ×{' '}
            <span style={{ color: COLOR_HEX[state.currentClaim.color] }}>
              {COLOR_LABEL[state.currentClaim.color]}
            </span>
          </div>
        </div>
      )}

      {/* Neighbor card */}
      {neighbor && (
        <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 text-center">
          Your neighbor: <span className="text-amber-300">{neighbor.name}</span>
        </div>
      )}

      {/* Phase content */}
      <div className="flex-1 flex flex-col gap-4">
        {(isMyTurnToClaim || isMyTurnToRespond) && (
          <NumberColorPicker
            n={pickN}
            color={pickColor}
            min={state.currentClaim ? state.currentClaim.n : 1}
            max={Math.max(1, totalTable)}
            onN={setPickN}
            onColor={setPickColor}
            currentClaim={state.currentClaim}
          />
        )}

        {isMyTurnToClaim && (
          <button
            onClick={submitClaim}
            className="py-4 rounded-xl font-bold uppercase tracking-widest text-xs bg-white text-black hover:bg-zinc-200 transition-all"
          >
            Submit claim · ≥{pickN} {COLOR_LABEL[pickColor]}
          </button>
        )}

        {isMyTurnToRespond && state.currentClaim && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={submitRaise}
              disabled={
                !isLegalRaise(state.currentClaim, { n: pickN, color: pickColor }) ||
                pickN > totalTable
              }
              className={`py-4 rounded-xl font-bold uppercase tracking-widest text-xs transition-all ${
                isLegalRaise(state.currentClaim, { n: pickN, color: pickColor }) && pickN <= totalTable
                  ? 'bg-white text-black hover:bg-zinc-200'
                  : 'bg-zinc-900 text-zinc-600 border border-white/5'
              }`}
            >
              Raise
            </button>
            <button
              onClick={() => setDoubtModalOpen(true)}
              className="py-4 rounded-xl font-bold uppercase tracking-widest text-xs bg-red-500/20 text-red-200 border border-red-500/40 hover:bg-red-500/30 transition-all"
            >
              Doubt
            </button>
          </div>
        )}

        {state.phase === 'responding' && !isMyTurnToRespond && (
          <div className="text-center text-xs text-zinc-500 mt-4 uppercase tracking-widest font-bold">
            Waiting for {state.players[state.responderSeat! - 1]?.name ?? 'next player'} to act
          </div>
        )}

        {state.phase === 'claiming' && !isMyTurnToClaim && (
          <div className="text-center text-xs text-zinc-500 mt-4 uppercase tracking-widest font-bold">
            Waiting for {state.players[state.activeSeat - 1]?.name ?? 'claimant'} to open
          </div>
        )}

        {state.phase === 'reveal' && (
          <div className="text-center space-y-2 mt-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-500">
              Reveal
            </div>
            <div className="text-sm text-zinc-300">Check the main screen.</div>
          </div>
        )}

        {state.phase === 'round-end' && state.lastResolution && (
          <div className="text-center space-y-2">
            {state.lastResolution.loserId === me.playerId ? (
              <div className="text-red-400 text-sm font-bold uppercase tracking-widest">
                You lost the showdown · −1 slot · −{state.lastResolution.pieceTransfer} piece
              </div>
            ) : (
              <div className="text-emerald-300 text-sm font-bold uppercase tracking-widest">
                {state.players.find((p) => p.id === state.lastResolution!.loserId)?.name} lost
              </div>
            )}
          </div>
        )}

        {state.phase === 'buy-slot' && (
          <div className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-500 text-center">
              Buy-slot window
            </div>
            {canBuySlot ? (
              <button
                onClick={submitBuySlot}
                className="w-full py-4 rounded-xl font-bold uppercase tracking-widest text-xs bg-amber-300/20 text-amber-200 border border-amber-300/40 hover:bg-amber-300/30 transition-all"
              >
                Spend 1 piece · gain 1 slot
              </button>
            ) : (
              <div className="text-center text-xs text-zinc-500 uppercase tracking-widest font-bold">
                {me.private.boughtSlotThisRound
                  ? 'Bought a slot this round'
                  : myPublic.slots >= 5
                    ? 'Already at max slots'
                    : 'Not enough pieces'}
              </div>
            )}
          </div>
        )}

        {state.phase === 'finished' && (
          <div className="text-center space-y-3 mt-8">
            <Trophy size={48} className="mx-auto text-amber-300" />
            <div className="text-2xl font-black uppercase tracking-tighter">Game Over</div>
          </div>
        )}
      </div>

      {/* doubt modal */}
      {doubtModalOpen && state.currentClaim && (
        <div className="fixed inset-0 z-40 bg-black/85 flex items-center justify-center p-6">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-zinc-900 rounded-2xl border border-white/10 p-6 space-y-4 max-w-sm w-full"
          >
            <AlertTriangle size={32} className="mx-auto text-red-400" />
            <div className="text-center text-lg font-black uppercase tracking-tight">
              Confirm Doubt?
            </div>
            <div className="text-center text-xs text-zinc-400 leading-relaxed">
              You're calling that there are FEWER than{' '}
              <span className="font-bold text-white">
                {state.currentClaim.n} × {COLOR_LABEL[state.currentClaim.color]}
              </span>{' '}
              cards on the table (Rainbows count as the claimed color). Loser pays 1 piece + loses 1 slot.
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setDoubtModalOpen(false)}
                className="py-3 rounded-xl font-bold uppercase tracking-widest text-[10px] bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={submitDoubt}
                className="py-3 rounded-xl font-bold uppercase tracking-widest text-[10px] bg-red-500/30 text-red-100 border border-red-500/50 hover:bg-red-500/50 transition-all"
              >
                Confirm doubt
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function nextLegalDefault(claim: Claim, maxN: number): { n: number; color: DoubtColor } {
  // try same n with strictly stricter color first
  for (const c of ALL_COLORS) {
    if (
      ALL_COLORS.indexOf(c) > ALL_COLORS.indexOf(claim.color) &&
      isLegalRaise(claim, { n: claim.n, color: c })
    ) {
      return { n: claim.n, color: c };
    }
  }
  // else bump n by 1 (or cap at maxN), default to yellow
  return { n: Math.min(maxN, claim.n + 1), color: 'yellow' };
}

function NumberColorPicker({
  n,
  color,
  min,
  max,
  onN,
  onColor,
  currentClaim,
}: {
  n: number;
  color: DoubtColor;
  min: number;
  max: number;
  onN: (n: number) => void;
  onColor: (c: DoubtColor) => void;
  currentClaim: Claim | null;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4 space-y-4">
      <div>
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500 mb-2">
          Quantity
        </div>
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => onN(Math.max(min, n - 1))}
            className="w-12 h-12 rounded-xl bg-zinc-800 border border-white/10 flex items-center justify-center hover:bg-zinc-700"
          >
            <Minus size={20} />
          </button>
          <div className="text-5xl font-black tracking-tighter">{n}</div>
          <button
            onClick={() => onN(Math.min(max, n + 1))}
            className="w-12 h-12 rounded-xl bg-zinc-800 border border-white/10 flex items-center justify-center hover:bg-zinc-700"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
      <div>
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500 mb-2">
          Color
        </div>
        <div className="grid grid-cols-4 gap-2">
          {ALL_COLORS.map((c) => {
            const legal =
              !currentClaim ||
              isLegalRaise(currentClaim, { n, color: c }) ||
              (n > currentClaim.n);
            const isPicked = c === color;
            return (
              <button
                key={c}
                onClick={() => onColor(c)}
                disabled={!legal}
                className={`py-3 rounded-lg border-2 text-[10px] font-bold uppercase tracking-widest transition-all ${
                  isPicked ? 'shadow-lg' : ''
                } ${legal ? '' : 'opacity-30 cursor-not-allowed'}`}
                style={{
                  background: isPicked ? COLOR_HEX[c] : `${COLOR_HEX[c]}25`,
                  borderColor: COLOR_HEX[c],
                  color: isPicked ? '#000' : '#fff',
                  boxShadow: isPicked ? `0 0 16px ${COLOR_HEX[c]}66` : undefined,
                }}
              >
                {COLOR_LABEL[c]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
