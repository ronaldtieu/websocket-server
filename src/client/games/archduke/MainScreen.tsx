// main-screen (host display) for archduke. shows every player's face-down
// set, the discard pile top, the active player, and a round/final reveal.

import { motion } from 'motion/react';
import { Crown, Trophy, Eye } from 'lucide-react';
import { PhaseTimer } from '../../primitives/PhaseTimer';
import { socket } from '../../lib/socket';
import type { ArchdukePublicState, SlotId } from './types';
import { cardLabel, cardTint } from './types';

const PHASE_LABELS: Record<string, string> = {
  'initial-peek': 'Initial peek — memorize your bottom two',
  'turn-draw': 'Draw from the pile',
  'turn-decide': 'Decide — swap, discard, or match',
  'resolving-action': 'Resolving face-card action',
  'round-end': 'Round reveal',
  'scoring-break': 'Tallying',
  finished: 'Game over',
};

export function ArchdukeMainScreen({
  state,
  isHost,
  onReturnToLobby,
}: {
  state: ArchdukePublicState;
  isHost: boolean;
  onReturnToLobby: () => void;
}) {
  const active = state.turn?.activePlayerId;
  const winner = state.phase === 'finished' ? state.players.find((p) => p.id === state.winnerId) : null;
  const isRevealing = state.phase === 'round-end' || state.phase === 'scoring-break';
  const lastRound = state.lastRoundSummary;

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
            <Crown size={32} className="text-black" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">Archduke</h1>
            <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-[0.4em] mt-2">
              Round {state.round} / {state.totalRounds}
              {state.turnsPerRound > 0 && ` · Turn ${state.turnsTakenThisRound} / ${state.turnsPerRound}`}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 min-w-[260px]">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
            {PHASE_LABELS[state.phase] ?? state.phase}
          </div>
          <PhaseTimer deadline={state.phaseDeadline} />
        </div>
      </div>

      {/* Center: discard top + deck, active player */}
      <div className="flex items-center justify-center gap-12 relative z-10">
        <div className="flex flex-col items-center gap-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">Deck</div>
          <div className="w-20 h-28 rounded-xl bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-600 font-black text-xl">
            {state.deckRemaining}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">Discard</div>
          {state.discardTop ? (
            <div
              className={`w-20 h-28 rounded-xl border flex items-center justify-center font-black text-2xl ${cardTint(state.discardTop)}`}
            >
              {cardLabel(state.discardTop)}
            </div>
          ) : (
            <div className="w-20 h-28 rounded-xl border border-dashed border-white/10" />
          )}
        </div>
        {active && state.phase !== 'finished' && !isRevealing && (
          <div className="flex flex-col items-center gap-2">
            <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">Active</div>
            <div className="px-5 py-4 rounded-xl border border-white bg-white/10 font-black uppercase tracking-widest">
              {state.players.find((p) => p.id === active)?.name ?? '—'}
            </div>
            {state.turn?.pendingAction && (
              <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-cyan-300 mt-1">
                <Eye size={10} />
                <span>{state.turn.pendingAction}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Players with their face-down sets */}
      <div className="flex-1 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {state.players.map((p) => {
            const isActive = p.id === active;
            const reveal = isRevealing ? lastRound?.revealed.find((r) => r.playerId === p.id) : null;
            return (
              <motion.div
                key={p.id}
                animate={isActive ? { scale: 1.02 } : { scale: 1 }}
                className={`rounded-2xl border p-5 flex flex-col gap-3 ${
                  isActive
                    ? 'border-white bg-white/5 shadow-2xl shadow-white/10'
                    : 'border-white/10 bg-zinc-900/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-black uppercase tracking-tight">{p.name}</div>
                  <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                    {p.roundScore !== null && <span>+{p.roundScore} rd</span>}
                    <span className="text-white">{p.totalScore} tot</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {p.slots.map((slot, i) => {
                    const revealedCard = reveal?.cards[i] ?? null;
                    const wasJustRevealed = p.lastRevealedSlot === i && !isRevealing;
                    if (revealedCard) {
                      return (
                        <div
                          key={i}
                          className={`aspect-[3/4] rounded-lg border flex items-center justify-center font-black text-lg ${cardTint(revealedCard)}`}
                        >
                          {cardLabel(revealedCard)}
                        </div>
                      );
                    }
                    if (slot.empty) {
                      return (
                        <div
                          key={i}
                          className="aspect-[3/4] rounded-lg border border-dashed border-white/10"
                        />
                      );
                    }
                    return (
                      <div
                        key={i}
                        className={`aspect-[3/4] rounded-lg border flex items-center justify-center ${
                          wasJustRevealed
                            ? 'border-cyan-400 bg-cyan-500/10'
                            : 'border-white/10 bg-zinc-800'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full bg-white/10" />
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Finished banner */}
      {state.phase === 'finished' && (
        <div className="relative z-10 text-center space-y-4 py-8">
          <Trophy size={48} className="mx-auto text-white" />
          <h2 className="text-4xl font-black uppercase tracking-tighter">Game Over</h2>
          {winner && (
            <p className="text-zinc-300 text-sm uppercase font-bold tracking-[0.3em]">
              {winner.name} wins with {winner.totalScore} points
            </p>
          )}
        </div>
      )}

      {/* Host controls */}
      {isHost && (
        <button
          onClick={onReturnToLobby}
          className="absolute bottom-6 right-6 z-20 px-4 py-2 bg-red-500/10 border border-red-500/40 rounded-lg text-[9px] font-bold uppercase tracking-widest text-red-300 hover:bg-red-500/20 hover:text-white transition-all"
        >
          End Game
        </button>
      )}

      {isHost && state.phase !== 'waiting' && state.phase !== 'finished' && (
        <button
          onClick={() => socket.emit('host-skip-phase')}
          className="absolute bottom-6 left-6 z-20 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-white/10 hover:text-white transition-all"
        >
          Skip Phase
        </button>
      )}
    </div>
  );
}
