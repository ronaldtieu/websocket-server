import { motion, AnimatePresence } from 'motion/react';
import { Coins, Layers, Crown } from 'lucide-react';
import { PhaseTimer } from '../../primitives/PhaseTimer';
import { socket } from '../../lib/socket';
import {
  ALL_COLORS,
  COLOR_HEX,
  COLOR_LABEL,
  type DoubtPublicState,
} from './types';

const PHASE_LABELS: Record<string, string> = {
  claiming: 'Claim — opener picks a number and color',
  responding: 'Respond — Raise or Doubt',
  reveal: 'Reveal — flipping cards',
  'round-end': 'Round resolved',
  'buy-slot': 'Buy-slot window',
  finished: 'Game over',
};

export function DoubtAndBetMainScreen({
  state,
  isHost,
  onReturnToLobby,
}: {
  state: DoubtPublicState;
  isHost: boolean;
  onReturnToLobby: () => void;
}) {
  const players = state.players;
  // ring layout positions
  const radius = 38; // % of container
  const centerX = 50;
  const centerY = 50;
  const positions = players.map((_, i) => {
    const angle = (i / Math.max(1, players.length)) * Math.PI * 2 - Math.PI / 2;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  const activePlayer = state.players[state.activeSeat - 1];
  const responderPlayer =
    state.responderSeat !== null ? state.players[state.responderSeat - 1] : null;

  const showReveal = state.phase === 'reveal' || state.phase === 'round-end';

  // attrition/rotate countdowns
  const roundsToAttrition = state.attritionEvery - ((state.round - 1) % state.attritionEvery || state.attritionEvery);
  const roundsToRotate = state.rotateEvery - ((state.round - 1) % state.rotateEvery || state.rotateEvery);

  return (
    <div className="min-h-screen bg-black text-white px-12 pt-12 pb-28 flex flex-col gap-8 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-2xl">
            <Layers size={32} className="text-black" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">Doubt and Bet</h1>
            <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-[0.4em] mt-2">
              Round {state.round} · Attrition in {roundsToAttrition} · Rotate in {roundsToRotate}
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

      {/* Color rank reference */}
      <div className="flex items-center justify-center gap-3 relative z-10">
        <span className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-600">Color rank</span>
        {ALL_COLORS.map((c, i) => (
          <div key={c} className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded"
              style={{ backgroundColor: COLOR_HEX[c], boxShadow: `0 0 14px ${COLOR_HEX[c]}55` }}
            />
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">
              {COLOR_LABEL[c]}
            </span>
            {i < ALL_COLORS.length - 1 && <span className="text-zinc-700">{'<'}</span>}
          </div>
        ))}
      </div>

      {/* Current claim banner */}
      <AnimatePresence>
        {state.currentClaim && !showReveal && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="relative z-10 flex justify-center"
          >
            <div
              className="px-8 py-4 rounded-2xl border-2 flex items-center gap-4"
              style={{
                borderColor: COLOR_HEX[state.currentClaim.color],
                boxShadow: `0 0 40px ${COLOR_HEX[state.currentClaim.color]}33`,
                background: `${COLOR_HEX[state.currentClaim.color]}10`,
              }}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-400">
                {activePlayer?.name ?? 'Player'} claims
              </div>
              <div className="text-3xl font-black tracking-tighter">
                ≥ {state.currentClaim.n} ×{' '}
                <span style={{ color: COLOR_HEX[state.currentClaim.color] }}>
                  {COLOR_LABEL[state.currentClaim.color]}
                </span>
              </div>
              {responderPlayer && (
                <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-400">
                  → <span className="text-white">{responderPlayer.name}</span> must respond
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player ring */}
      <div className="relative z-10 flex-1 flex items-center justify-center">
        <div className="relative aspect-square w-full max-w-2xl">
          {/* Center: claim chain or reveal summary */}
          <div className="absolute inset-1/4 flex items-center justify-center">
            {showReveal && state.lastResolution ? (
              <div className="text-center space-y-2 max-w-xs">
                <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
                  Doubt resolved
                </div>
                <div className="text-2xl font-black tracking-tighter">
                  {state.lastResolution.actualCount} ×{' '}
                  <span style={{ color: COLOR_HEX[state.lastResolution.claim.color] }}>
                    {COLOR_LABEL[state.lastResolution.claim.color]}
                  </span>
                </div>
                <div
                  className={`text-sm font-bold uppercase tracking-widest ${
                    state.lastResolution.claimWasTrue ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  Claim was {state.lastResolution.claimWasTrue ? 'true' : 'false'}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
                  Loser: {players.find((p) => p.id === state.lastResolution!.loserId)?.name}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-600 mb-1">
                  History
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {state.claimHistory.slice(-4).map((c, i) => (
                    <div key={i} className="text-[10px] font-bold tracking-widest text-zinc-400">
                      {players.find((p) => p.id === c.playerId)?.name}: ≥{c.n}{' '}
                      <span style={{ color: COLOR_HEX[c.color] }}>{COLOR_LABEL[c.color]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {players.map((p, i) => {
            const pos = positions[i];
            const isActive = i === state.activeSeat - 1;
            const isResponder = state.responderSeat !== null && i === state.responderSeat - 1;
            return (
              <div
                key={p.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                <div
                  className={`px-3 py-2 rounded-lg border ${
                    isActive
                      ? 'border-white bg-white/10 shadow-lg shadow-white/30'
                      : isResponder
                        ? 'border-amber-300 bg-amber-300/10 shadow-lg shadow-amber-300/20'
                        : p.isEliminated
                          ? 'border-red-500/30 bg-red-500/5 opacity-60'
                          : 'border-white/10 bg-zinc-900/60'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-300 max-w-[100px] truncate">
                    {p.name}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <div className="flex items-center gap-1">
                      <Layers size={10} className="text-zinc-500" />
                      <span className="text-xs font-black">{p.slots}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Coins size={10} className="text-amber-300" />
                      <span className="text-xs font-black text-amber-200">{p.pieces}</span>
                    </div>
                  </div>
                </div>

                {/* Cards: face-down backs by default, revealed during reveal */}
                <div className="flex gap-0.5">
                  {(p.revealedCards && p.revealedCards.length > 0 ? p.revealedCards : Array(p.cardCount).fill(null)).map(
                    (card: string | null, ci: number) => {
                      const matched =
                        showReveal &&
                        state.lastResolution &&
                        card !== null &&
                        (card === state.lastResolution.claim.color || card === 'rainbow');
                      return (
                        <motion.div
                          key={ci}
                          initial={card ? { rotateY: 180, opacity: 0 } : false}
                          animate={card ? { rotateY: 0, opacity: 1 } : { opacity: 1 }}
                          transition={{ delay: ci * 0.06, duration: 0.4, type: 'spring', stiffness: 200 }}
                          className={`w-4 h-6 rounded-sm border ${
                            matched ? 'border-white shadow-md' : 'border-white/20'
                          }`}
                          style={{
                            background: card
                              ? COLOR_HEX[card as keyof typeof COLOR_HEX]
                              : 'linear-gradient(135deg, #18181b 0%, #27272a 100%)',
                            boxShadow: matched ? `0 0 10px ${COLOR_HEX[card as keyof typeof COLOR_HEX]}` : undefined,
                          }}
                        />
                      );
                    },
                  )}
                </div>
                {isActive && (
                  <div className="text-[8px] font-black uppercase tracking-[0.3em] text-white">
                    Claimant
                  </div>
                )}
                {isResponder && !isActive && (
                  <div className="text-[8px] font-black uppercase tracking-[0.3em] text-amber-300">
                    Must respond
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scoreboard footer */}
      <div className="relative z-10 border-t border-white/5 pt-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-500 mb-4">
          Standings
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {[...state.players]
            .sort((a, b) => b.pieces + b.slots - (a.pieces + a.slots))
            .map((p) => (
              <div
                key={p.id}
                className={`rounded-xl border p-4 flex flex-col gap-1 ${
                  p.isEliminated
                    ? 'border-red-500/20 bg-red-500/5 opacity-60'
                    : 'border-white/5 bg-zinc-900/40'
                }`}
              >
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 truncate">
                  {p.name}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Coins size={10} className="text-amber-300" />
                  <span className="font-black text-amber-200">{p.pieces}</span>
                  <Layers size={10} className="text-zinc-500" />
                  <span className="font-black">{p.slots}</span>
                </div>
                {p.isEliminated && (
                  <div className="text-[7px] font-bold uppercase tracking-[0.3em] text-red-400">out</div>
                )}
              </div>
            ))}
        </div>
      </div>

      {state.phase === 'finished' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="text-center space-y-6">
            <Crown size={64} className="mx-auto text-amber-300" />
            <h2 className="text-5xl font-black uppercase tracking-tighter">Game Over</h2>
            <p className="text-zinc-500 text-xs uppercase font-bold tracking-[0.4em]">
              Survivor bonus +2 pieces awarded
            </p>
          </div>
        </div>
      )}

      {/* Host controls */}
      {isHost && (
        <>
          <div className="absolute bottom-6 left-6 flex gap-2 z-30">
            <button
              onClick={() => socket.emit('host-skip-phase')}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-white/10 hover:text-white transition-all"
            >
              Skip Phase
            </button>
          </div>
          <button
            onClick={onReturnToLobby}
            className="absolute bottom-6 right-6 z-30 px-4 py-2 bg-red-500/10 border border-red-500/40 rounded-lg text-[9px] font-bold uppercase tracking-widest text-red-300 hover:bg-red-500/20 hover:text-white transition-all"
          >
            End Game
          </button>
        </>
      )}
    </div>
  );
}
