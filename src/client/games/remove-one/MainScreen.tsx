import { motion } from 'motion/react';
import { Shield, Trophy } from 'lucide-react';
import { PhaseTimer } from '../../primitives/PhaseTimer';
import { RevealOverlay } from '../../primitives/RevealOverlay';
import { PixelPlayingCard, PixelCardBack } from '../../primitives/PixelPlayingCard';
import type { RemoveOnePublicState } from './types';
import { socket } from '../../lib/socket';

const PHASE_LABELS: Record<string, string> = {
  selecting: 'Selection — pick two',
  'peek-reveal': 'Peek reveal',
  choosing: 'Choice — commit one',
  'play-reveal': 'Play reveal',
  scoring: 'Scoring',
  checkpoint: 'Survival checkpoint',
  finished: 'Game over',
};

export function RemoveOneMainScreen({
  state,
  isHost,
  onReturnToLobby,
}: {
  state: RemoveOnePublicState;
  isHost: boolean;
  onReturnToLobby: () => void;
}) {
  const isCheckpointRound = state.checkpointRounds.includes(state.round);
  const showPeek = state.phase === 'peek-reveal' || state.phase === 'choosing';
  const showPlay =
    state.phase === 'play-reveal' || state.phase === 'scoring' || state.phase === 'checkpoint';

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
            <Shield size={32} className="text-black" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">Remove One</h1>
            <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-[0.4em] mt-2">
              Round {state.round} / {state.totalRounds}
              {isCheckpointRound && ' · Checkpoint'}
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

      {/* Reveals */}
      <div className="flex-1 flex items-center justify-center relative z-10">
        {showPeek && (
          <div className="w-full max-w-5xl space-y-6">
            <div className="text-center text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-500">
              Everyone's two candidates
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {state.players.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-zinc-900/40 rounded-2xl border border-white/5 p-5 flex flex-col items-center gap-3"
                >
                  <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 max-w-[100px] truncate">
                    {p.name}
                  </div>
                  <div className="flex gap-3">
                    {p.peekCards ? (
                      p.peekCards.map((c, i) => (
                        <div key={i} className="w-14 md:w-16 aspect-[3/4]">
                          <PixelPlayingCard value={c} size="sm" className="h-full w-full" />
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="w-14 md:w-16 aspect-[3/4]">
                          <PixelCardBack size="sm" className="h-full w-full" />
                        </div>
                        <div className="w-14 md:w-16 aspect-[3/4]">
                          <PixelCardBack size="sm" className="h-full w-full" />
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {showPlay && (
          <RevealOverlay
            title="played cards"
            subtitle={state.lastScoring?.cardValue != null ? `Smallest unique: ${state.lastScoring.cardValue}` : undefined}
            players={state.players.map((p) => ({
              id: p.id,
              name: p.name,
              card: p.playedCard,
              winner: state.lastScoring?.roundWinner === p.id,
              clashed: p.playedCard != null && state.lastScoring?.clashed.includes(p.playedCard) === true,
            }))}
          />
        )}

        {state.phase === 'selecting' && (
          <div className="text-center space-y-4">
            <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-[0.5em]">
              Players are picking
            </p>
            <div className="flex items-center justify-center gap-2">
              {state.players.map((p) => (
                <div
                  key={p.id}
                  className={`w-2 h-2 rounded-full ${p.hasSubmittedSelection ? 'bg-white' : 'bg-zinc-800 animate-pulse'}`}
                />
              ))}
            </div>
          </div>
        )}

        {state.phase === 'finished' && (
          <div className="text-center space-y-6">
            <Trophy size={64} className="mx-auto text-white" />
            <h2 className="text-5xl font-black uppercase tracking-tighter">Game Over</h2>
            <p className="text-zinc-500 text-xs uppercase font-bold tracking-[0.4em]">
              Final scoreboard below
            </p>
          </div>
        )}
      </div>

      {/* Scoreboard */}
      <div className="relative z-10 border-t border-white/5 pt-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-500 mb-4">
          Scoreboard
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {[...state.players]
            .sort((a, b) => b.score + b.victoryTokens - (a.score + a.victoryTokens))
            .map((p) => (
              <div
                key={p.id}
                className={`rounded-xl border p-4 flex flex-col gap-2 ${
                  p.isEliminated
                    ? 'border-red-500/20 bg-red-500/5 opacity-60'
                    : p.isSafe
                      ? 'border-white/20 bg-white/5'
                      : 'border-white/5 bg-zinc-900/40'
                }`}
              >
                <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 truncate">
                  {p.name}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black tracking-tighter">{p.score}</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">pts</span>
                </div>
                <div className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest text-zinc-500">
                  <Trophy size={10} />
                  <span>{p.victoryTokens} VT</span>
                </div>
                {p.isSafe && (
                  <div className="text-[7px] font-bold uppercase tracking-[0.3em] text-white/70">safe</div>
                )}
                {p.isEliminated && (
                  <div className="text-[7px] font-bold uppercase tracking-[0.3em] text-red-400">out</div>
                )}
              </div>
            ))}
        </div>
      </div>

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
