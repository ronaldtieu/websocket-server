import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, Check } from 'lucide-react';
import { CardHand, type CardTile } from '../../primitives/CardHand';
import { PhaseTimer } from '../../primitives/PhaseTimer';
import { socket } from '../../lib/socket';
import type { RemoveOneStateForPlayer } from './types';

const FULL_HAND = [1, 2, 3, 4, 5, 6, 7, 8];

export function RemoveOnePhone({ state }: { state: RemoveOneStateForPlayer }) {
  const me = state.me;
  const [selected, setSelected] = useState<number[]>([]);

  // clear local selection whenever phase changes back to selecting or choosing
  useEffect(() => {
    if (state.phase === 'selecting') setSelected([]);
  }, [state.phase]);

  if (!me) {
    return (
      <div className="min-h-screen bg-black p-6 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-zinc-500 text-xs uppercase font-bold tracking-widest">Spectating</div>
        </div>
      </div>
    );
  }

  const myPlayerPublic = state.players.find((p) => p.id === me.playerId);
  const hand = me.private.hand;
  const locked = me.private.lockedNextRound;
  const alreadySubmittedSelection = me.private.selection !== null;
  const alreadySubmittedChoice = me.private.chosen !== null;

  const tiles: CardTile[] = FULL_HAND.map((v) => {
    if (hand.includes(v)) {
      return { value: v, state: locked === v ? 'locked' : 'available' };
    }
    return { value: v, state: 'discarded' };
  });

  const handleSubmitPair = () => {
    if (selected.length !== 2) return;
    socket.emit('game-action', {
      type: 'remove-one/select-pair',
      payload: { a: selected[0], b: selected[1] },
    });
  };

  const handleChoose = (card: number) => {
    socket.emit('game-action', {
      type: 'remove-one/choose-play',
      payload: { card },
    });
  };

  return (
    <div className="min-h-screen bg-black text-white p-5 flex flex-col gap-5 selection:bg-white selection:text-black">
      {/* chrome */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">You</div>
          <div className="text-lg font-black uppercase tracking-tight">
            {myPlayerPublic?.name ?? 'Player'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">Score</div>
          <div className="text-lg font-black tracking-tighter">
            {myPlayerPublic?.score ?? 0}{' '}
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
              · {myPlayerPublic?.victoryTokens ?? 0} VT
            </span>
          </div>
        </div>
      </div>

      <PhaseTimer deadline={state.phaseDeadline} label={`Round ${state.round} / ${state.totalRounds}`} />

      {/* content by phase */}
      <div className="flex-1 flex flex-col gap-5">
        {state.phase === 'selecting' && (
          <>
            <div className="text-center space-y-1 mt-2">
              <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
                Selection
              </div>
              <div className="text-sm text-zinc-300">Pick two cards. Both will peek to the table.</div>
            </div>

            <CardHand
              cards={tiles}
              selected={selected}
              selectLimit={2}
              onToggle={(v) => {
                setSelected((prev) =>
                  prev.includes(v) ? prev.filter((x) => x !== v) : prev.length < 2 ? [...prev, v] : prev,
                );
              }}
              disabled={alreadySubmittedSelection}
            />

            <button
              disabled={selected.length !== 2 || alreadySubmittedSelection}
              onClick={handleSubmitPair}
              className={`mt-auto py-4 rounded-xl font-bold uppercase tracking-widest text-xs transition-all ${
                selected.length === 2 && !alreadySubmittedSelection
                  ? 'bg-white text-black hover:bg-zinc-200'
                  : 'bg-zinc-900 text-zinc-600 border border-white/5'
              }`}
            >
              {alreadySubmittedSelection ? (
                <span className="flex items-center justify-center gap-2">
                  <Check size={14} /> Locked in
                </span>
              ) : selected.length === 2 ? (
                'Submit pair'
              ) : (
                `Select ${2 - selected.length} more`
              )}
            </button>
          </>
        )}

        {(state.phase === 'peek-reveal' || state.phase === 'choosing') && me.private.selection && (
          <>
            <div className="text-center space-y-1 mt-2">
              <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
                {state.phase === 'peek-reveal' ? 'Peek reveal' : 'Choice'}
              </div>
              <div className="text-sm text-zinc-300">
                {state.phase === 'peek-reveal'
                  ? 'Both candidates shown to the table.'
                  : alreadySubmittedChoice
                    ? 'Locked in. Waiting for others.'
                    : 'Tap the one to actually play.'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {me.private.selection.map((card, i) => {
                const isChosen = me.private.chosen === card;
                const canPick = state.phase === 'choosing' && !alreadySubmittedChoice;
                return (
                  <motion.button
                    key={i}
                    whileHover={canPick ? { scale: 1.03 } : {}}
                    whileTap={canPick ? { scale: 0.97 } : {}}
                    disabled={!canPick}
                    onClick={() => canPick && handleChoose(card)}
                    className={`aspect-[3/4] rounded-2xl border flex items-center justify-center font-black text-7xl transition-all ${
                      isChosen
                        ? 'bg-white text-black border-white shadow-2xl shadow-white/30'
                        : canPick
                          ? 'bg-zinc-900 text-white border-white/10 hover:border-white/30'
                          : 'bg-zinc-900 text-white border-white/5'
                    }`}
                  >
                    {card}
                    <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                      {i === 0 ? 'A' : 'B'}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </>
        )}

        {(state.phase === 'play-reveal' || state.phase === 'scoring') && (
          <div className="text-center space-y-3 mt-8">
            <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
              Reveal
            </div>
            <div className="text-sm text-zinc-300">Check the main screen.</div>
            {state.lastScoring?.roundWinner === me.playerId && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <Trophy size={32} className="text-white" />
                <div className="text-sm font-bold uppercase tracking-widest">You scored!</div>
              </div>
            )}
          </div>
        )}

        {state.phase === 'checkpoint' && (
          <div className="text-center space-y-3 mt-8">
            <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
              Survival checkpoint
            </div>
            {myPlayerPublic?.isSafe && (
              <div className="text-lg font-black uppercase tracking-tight text-white">You're safe</div>
            )}
          </div>
        )}

        {state.phase === 'finished' && (
          <div className="text-center space-y-4 mt-8">
            <Trophy size={48} className="mx-auto text-white" />
            <div className="text-2xl font-black uppercase tracking-tighter">Game Over</div>
            {myPlayerPublic?.isEliminated && (
              <div className="text-sm text-red-400 uppercase tracking-widest font-bold">Eliminated</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
