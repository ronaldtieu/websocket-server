import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Clock, Coins } from 'lucide-react';
import { socket } from '../../lib/socket';
import type { TimeAuctionPublicState } from './types';

const PHASE_LABELS: Record<string, string> = {
  countdown: 'Get ready',
  bidding: 'Bidding open — hold to bid',
  reveal: 'Round result',
  finished: 'Game over',
};

function formatSeconds(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  return `${total.toFixed(1)}s`;
}

// big count-up clock for the bidding window. drives off the
// server-supplied biddingStartedAt timestamp; the client just renders.
function RoundClock({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [startedAt]);

  if (startedAt === null) {
    return <div className="text-7xl font-black tracking-tighter font-mono text-zinc-700">0.0s</div>;
  }
  const elapsed = Math.max(0, now - startedAt);
  return (
    <div className="text-7xl font-black tracking-tighter font-mono text-white">
      {formatSeconds(elapsed)}
    </div>
  );
}

export function TimeAuctionMainScreen({
  state,
  isHost,
  onReturnToLobby,
}: {
  state: TimeAuctionPublicState;
  isHost: boolean;
  onReturnToLobby: () => void;
}) {
  const phaseLabel = PHASE_LABELS[state.phase] ?? state.phase;

  return (
    <div className="min-h-screen bg-black text-white px-12 pt-12 pb-28 flex flex-col gap-8 relative overflow-hidden">
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
            <Clock size={32} className="text-black" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">Time Auction</h1>
            <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-[0.4em] mt-2">
              Round {Math.max(state.round, 1)} / {state.totalRounds}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 min-w-[220px] items-end">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
            {phaseLabel}
          </div>
        </div>
      </div>

      {/* round progress bar */}
      <div className="relative z-10">
        <div className="h-[3px] bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-white"
            initial={false}
            animate={{
              width: `${(Math.max(0, state.round - (state.phase === 'finished' ? 0 : 1)) / state.totalRounds) * 100}%`,
            }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>

      {/* center stage */}
      <div className="flex-1 flex items-center justify-center relative z-10">
        {state.phase === 'countdown' && (
          <CountdownDisplay deadline={state.phaseDeadline} />
        )}

        {state.phase === 'bidding' && (
          <div className="flex flex-col items-center gap-6">
            <div className="text-[10px] font-bold uppercase tracking-[0.5em] text-zinc-500">
              Round Clock
            </div>
            <RoundClock startedAt={state.biddingStartedAt} />
            <div className="text-zinc-500 text-xs uppercase font-bold tracking-[0.3em]">
              Hidden bids in progress
            </div>
          </div>
        )}

        {state.phase === 'reveal' && state.lastReveal && (
          <RevealBanner reveal={state.lastReveal} />
        )}

        {state.phase === 'finished' && <GameOver state={state} />}
      </div>

      {/* player tiles */}
      <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        {state.players.map((p) => {
          const dim = state.phase === 'bidding' && p.hasReleased;
          const lit = state.phase === 'bidding' && p.isHolding;
          return (
            <motion.div
              key={p.id}
              initial={false}
              animate={{ opacity: dim ? 0.4 : 1 }}
              className={`rounded-xl border p-4 flex flex-col gap-2 transition-colors ${
                p.isEliminated
                  ? 'border-red-500/20 bg-red-500/5'
                  : lit
                    ? 'border-white/40 bg-white/10'
                    : p.isTopTokens
                      ? 'border-white/30 bg-white/5'
                      : 'border-white/5 bg-zinc-900/40'
              }`}
            >
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 truncate">
                {p.name}
              </div>
              <div className="flex items-baseline gap-2">
                <Coins size={12} className="text-zinc-500" />
                <span className="text-2xl font-black tracking-tighter">{p.tokens}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">tok</span>
              </div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 font-mono">
                {formatSeconds(p.timeBankMs)} bank
              </div>
              {state.phase === 'bidding' && (
                <div className="text-[8px] font-bold uppercase tracking-[0.3em] text-zinc-500">
                  {p.isHolding ? 'holding' : p.hasReleased ? 'locked' : 'idle'}
                </div>
              )}
              {p.isEliminated && (
                <div className="text-[7px] font-bold uppercase tracking-[0.3em] text-red-400">out</div>
              )}
              {p.isTopTokens && !p.isEliminated && (
                <div className="text-[7px] font-bold uppercase tracking-[0.3em] text-white/70">top</div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* host controls */}
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

function CountdownDisplay({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [deadline]);
  const remainingSec = deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <div className="text-center space-y-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.5em] text-zinc-500">Get ready</div>
      <div className="text-9xl font-black tracking-tighter text-white">{remainingSec}</div>
    </div>
  );
}

function RevealBanner({
  reveal,
}: {
  reveal: { round: number; winnerName: string | null; winningBidMs: number | null; awardedRandomly: boolean };
}) {
  return (
    <AnimatePresence>
      <motion.div
        key={reveal.round}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ opacity: 0 }}
        className="text-center space-y-4"
      >
        <Trophy size={56} className="mx-auto text-white" />
        <div className="text-[10px] font-bold uppercase tracking-[0.5em] text-zinc-500">
          Round {reveal.round} winner
        </div>
        {reveal.winnerName ? (
          <>
            <div className="text-6xl font-black uppercase tracking-tighter">{reveal.winnerName}</div>
            <div className="text-zinc-400 text-sm uppercase tracking-widest font-bold">
              {reveal.awardedRandomly
                ? 'No bids — random award'
                : `Winning bid: ${formatSeconds(reveal.winningBidMs ?? 0)}`}
            </div>
          </>
        ) : (
          <div className="text-zinc-500 uppercase tracking-widest font-bold">No winner</div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function GameOver({ state }: { state: TimeAuctionPublicState }) {
  const sorted = [...state.players].sort((a, b) => b.tokens - a.tokens);
  return (
    <div className="text-center space-y-6">
      <Trophy size={64} className="mx-auto text-white" />
      <h2 className="text-5xl font-black uppercase tracking-tighter">Game Over</h2>
      <div className="text-zinc-500 text-xs uppercase font-bold tracking-[0.4em]">
        Final tokens
      </div>
      <div className="flex justify-center gap-3 flex-wrap max-w-3xl mx-auto">
        {sorted.map((p) => (
          <div
            key={p.id}
            className={`px-4 py-3 rounded-xl border text-left ${
              p.isEliminated
                ? 'border-red-500/40 bg-red-500/10'
                : p.isTopTokens
                  ? 'border-white/40 bg-white/10'
                  : 'border-white/10 bg-zinc-900/40'
            }`}
          >
            <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
              {p.name}
            </div>
            <div className="text-2xl font-black">{p.tokens} tok</div>
            {p.isTopTokens && <div className="text-[8px] uppercase tracking-widest text-white/70">+1 piece</div>}
            {p.isEliminated && <div className="text-[8px] uppercase tracking-widest text-red-300">eliminated</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
