// phone view for archduke. renders a different UI depending on phase and
// whether it's your turn. when it's your turn to decide, we show the drawn
// card plus three choice buttons: swap into slot N, discard, or match slot N.

import { useState } from 'react';
import { motion } from 'motion/react';
import { Eye, Trophy } from 'lucide-react';
import { PhaseTimer } from '../../primitives/PhaseTimer';
import { socket } from '../../lib/socket';
import type { ArchdukeStateForPlayer, SlotId } from './types';
import { cardLabel, cardTint, cardValue } from './types';

export function ArchdukePhone({ state }: { state: ArchdukeStateForPlayer }) {
  const me = state.me;
  if (!me) {
    return (
      <div className="min-h-screen bg-black p-6 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-zinc-500 text-xs uppercase font-bold tracking-widest">Spectating</div>
        </div>
      </div>
    );
  }
  const myPublic = state.players.find((p) => p.id === me.playerId);
  const isMyTurn = state.turn?.activePlayerId === me.playerId;
  const pendingAction = state.turn?.pendingAction ?? null;
  const resolving = state.phase === 'resolving-action' && isMyTurn;

  return (
    <div className="min-h-screen bg-black text-white p-5 flex flex-col gap-5 selection:bg-white selection:text-black">
      {/* chrome */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">You</div>
          <div className="text-lg font-black uppercase tracking-tight">{myPublic?.name ?? 'Player'}</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">Total</div>
          <div className="text-lg font-black tracking-tighter">{myPublic?.totalScore ?? 0}</div>
        </div>
      </div>

      <PhaseTimer deadline={state.phaseDeadline} label={`Round ${state.round} / ${state.totalRounds}`} />

      {/* Your set */}
      <MySet state={state} />

      {/* Peeked foreign card banner */}
      {me.peekedForeignCard && (
        <div className="p-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-[11px] text-cyan-200 flex items-center justify-between">
          <span>
            Peeked {playerName(state, me.peekedForeignCard.targetPlayerId)} slot {me.peekedForeignCard.slot + 1}:
          </span>
          <span className="font-black">{cardLabel(me.peekedForeignCard.card)}</span>
        </div>
      )}

      {/* Main interaction area */}
      <div className="flex-1 flex flex-col gap-4">
        {state.phase === 'initial-peek' && <InitialPeekPanel state={state} />}

        {state.phase === 'turn-draw' && isMyTurn && (
          <button
            onClick={() => socket.emit('game-action', { type: 'archduke/draw', payload: {} })}
            className="py-5 rounded-xl bg-white text-black font-black uppercase tracking-widest text-sm"
          >
            Draw a card
          </button>
        )}

        {state.phase === 'turn-draw' && !isMyTurn && (
          <WaitingPanel label={`${playerName(state, state.turn?.activePlayerId)} is drawing`} />
        )}

        {state.phase === 'turn-decide' && isMyTurn && me.myDrawnCard && (
          <DecidePanel state={state} />
        )}

        {state.phase === 'turn-decide' && !isMyTurn && (
          <WaitingPanel label={`${playerName(state, state.turn?.activePlayerId)} is deciding`} />
        )}

        {resolving && pendingAction && <ResolvePanel state={state} action={pendingAction} />}

        {state.phase === 'resolving-action' && !isMyTurn && (
          <WaitingPanel
            label={`${playerName(state, state.turn?.activePlayerId)} is using ${pendingAction}`}
          />
        )}

        {(state.phase === 'round-end' || state.phase === 'scoring-break') && (
          <div className="text-center space-y-2 mt-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
              Round over
            </div>
            <div className="text-sm text-zinc-300">Check the main screen for reveals.</div>
            {myPublic?.roundScore !== null && myPublic?.roundScore !== undefined && (
              <div className="text-xs mt-2 text-zinc-400">
                Your round score: <span className="text-white font-bold">{myPublic.roundScore}</span>
              </div>
            )}
          </div>
        )}

        {state.phase === 'finished' && (
          <div className="text-center space-y-3 mt-4">
            <Trophy size={40} className="mx-auto text-white" />
            <div className="text-2xl font-black uppercase tracking-tighter">Game Over</div>
            {state.winnerId === me.playerId ? (
              <div className="text-sm text-white uppercase tracking-widest font-bold">You won!</div>
            ) : (
              <div className="text-sm text-zinc-400 uppercase tracking-widest font-bold">
                Winner: {playerName(state, state.winnerId)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MySet({ state }: { state: ArchdukeStateForPlayer }) {
  const me = state.me!;
  const myPublic = state.players.find((p) => p.id === me.playerId);
  if (!myPublic) return null;
  return (
    <div className="space-y-2">
      <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">Your set</div>
      <div className="grid grid-cols-4 gap-2">
        {myPublic.slots.map((slot, i) => {
          const known = me.knownSlots[i];
          if (slot.empty) {
            return (
              <div
                key={i}
                className="aspect-[3/4] rounded-lg border border-dashed border-white/10 flex items-center justify-center text-[8px] text-zinc-600 uppercase tracking-widest"
              >
                empty
              </div>
            );
          }
          if (known) {
            return (
              <div
                key={i}
                className={`aspect-[3/4] rounded-lg border flex flex-col items-center justify-center ${cardTint(known)}`}
              >
                <div className="font-black text-xl">{cardLabel(known)}</div>
                <div className="text-[7px] uppercase font-bold tracking-widest mt-1 opacity-70">
                  slot {i + 1}
                </div>
              </div>
            );
          }
          return (
            <div
              key={i}
              className="aspect-[3/4] rounded-lg border border-white/10 bg-zinc-800 flex flex-col items-center justify-center"
            >
              <div className="w-3 h-3 rounded-full bg-white/10" />
              <div className="text-[7px] uppercase font-bold tracking-widest mt-1 text-zinc-600">
                slot {i + 1}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InitialPeekPanel({ state }: { state: ArchdukeStateForPlayer }) {
  const me = state.me!;
  const known = me.knownSlots;
  return (
    <div className="space-y-3 text-center mt-2">
      <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">Memorize</div>
      <div className="text-sm text-zinc-300">
        You can see slots 3 and 4 of your set below. Memorize them — they stay hidden once play starts.
      </div>
      <div className="flex items-center justify-center gap-3 mt-3">
        {known.map((c, i) => {
          if (!c) return null;
          return (
            <div
              key={i}
              className={`w-14 h-20 rounded-xl border flex flex-col items-center justify-center ${cardTint(c)}`}
            >
              <div className="font-black text-xl">{cardLabel(c)}</div>
              <div className="text-[7px] uppercase font-bold tracking-widest mt-1 opacity-70">
                slot {i + 1}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DecidePanel({ state }: { state: ArchdukeStateForPlayer }) {
  const me = state.me!;
  const drawn = me.myDrawnCard!;
  const [chosenDecision, setChosenDecision] = useState<
    | { kind: 'swap'; slot: SlotId }
    | { kind: 'discard' }
    | { kind: 'match'; slot: SlotId }
    | null
  >(null);

  const knownSlots = me.knownSlots;

  const send = (decision: 'swap' | 'discard' | 'match', slot?: SlotId) => {
    const payload =
      decision === 'discard'
        ? { decision: 'discard' }
        : { decision, slot };
    socket.emit('game-action', { type: 'archduke/decide', payload });
  };

  return (
    <div className="space-y-4">
      <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500 text-center">
        You drew
      </div>
      <div className="flex items-center justify-center">
        <div
          className={`w-24 h-32 rounded-2xl border flex flex-col items-center justify-center ${cardTint(drawn)}`}
        >
          <div className="font-black text-3xl">{cardLabel(drawn)}</div>
          <div className="text-[8px] uppercase font-bold tracking-widest mt-1 opacity-70">
            value {cardValue(drawn)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mt-2">
        {[0, 1, 2, 3].map((i) => {
          const known = knownSlots[i];
          const canMatch = known !== null && known !== undefined && known && canMatchCards(drawn, known);
          return (
            <button
              key={i}
              onClick={() => setChosenDecision({ kind: 'swap', slot: i as SlotId })}
              className={`aspect-[3/4] rounded-lg border text-[9px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-1 ${
                chosenDecision?.kind === 'swap' && chosenDecision.slot === i
                  ? 'border-white bg-white text-black'
                  : 'border-white/10 bg-zinc-900 text-zinc-300 hover:border-white/30'
              }`}
            >
              <span>swap</span>
              <span className="text-[8px] text-zinc-500">slot {i + 1}</span>
              {canMatch && <span className="text-[7px] text-cyan-300">match ok</span>}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setChosenDecision({ kind: 'discard' })}
          className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all ${
            chosenDecision?.kind === 'discard'
              ? 'border-white bg-white text-black'
              : 'border-white/10 bg-zinc-900 text-zinc-300 hover:border-white/30'
          }`}
        >
          discard
        </button>
      </div>

      {/* known-match buttons */}
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => {
          const known = knownSlots[i];
          if (!known || !canMatchCards(drawn, known)) {
            return (
              <div
                key={i}
                className="aspect-[3/4] rounded-lg border border-white/5 opacity-30 flex items-center justify-center text-[8px] text-zinc-700 uppercase"
              >
                match?
              </div>
            );
          }
          return (
            <button
              key={i}
              onClick={() => setChosenDecision({ kind: 'match', slot: i as SlotId })}
              className={`aspect-[3/4] rounded-lg border text-[9px] font-bold uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-1 ${
                chosenDecision?.kind === 'match' && chosenDecision.slot === i
                  ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                  : 'border-cyan-500/40 bg-cyan-500/5 text-cyan-300 hover:bg-cyan-500/10'
              }`}
            >
              <span>match</span>
              <span className="text-[8px] text-zinc-400">slot {i + 1}</span>
            </button>
          );
        })}
      </div>

      <button
        disabled={!chosenDecision}
        onClick={() => {
          if (!chosenDecision) return;
          if (chosenDecision.kind === 'discard') send('discard');
          else send(chosenDecision.kind, chosenDecision.slot);
        }}
        className={`w-full py-4 rounded-xl font-bold uppercase tracking-widest text-xs transition-all ${
          chosenDecision ? 'bg-white text-black hover:bg-zinc-200' : 'bg-zinc-900 text-zinc-600 border border-white/5'
        }`}
      >
        {chosenDecision ? 'confirm' : 'choose an option'}
      </button>
    </div>
  );
}

function ResolvePanel({
  state,
  action,
}: {
  state: ArchdukeStateForPlayer;
  action: 'peek' | 'give' | 'swap';
}) {
  const [pick1, setPick1] = useState<{ playerId: string; slot: SlotId } | null>(null);
  const [pick2, setPick2] = useState<{ playerId: string; slot: SlotId } | null>(null);
  const [giveTarget, setGiveTarget] = useState<string | null>(null);

  const me = state.me!;

  const skip = () => socket.emit('game-action', { type: 'archduke/skip-action', payload: {} });

  if (action === 'peek') {
    return (
      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500 text-center">
          Peek — choose a slot
        </div>
        <SlotPicker
          state={state}
          value={pick1}
          onPick={(x) => setPick1(x)}
        />
        <div className="flex gap-2">
          <button
            onClick={skip}
            className="flex-1 py-3 rounded-xl border border-white/10 text-[10px] font-bold uppercase tracking-widest"
          >
            skip
          </button>
          <button
            disabled={!pick1}
            onClick={() => {
              if (!pick1) return;
              socket.emit('game-action', {
                type: 'archduke/resolve-action',
                payload: { action: 'peek', targetPlayerId: pick1.playerId, slot: pick1.slot },
              });
            }}
            className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest ${
              pick1 ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-600 border border-white/5'
            }`}
          >
            peek
          </button>
        </div>
      </div>
    );
  }

  if (action === 'give') {
    return (
      <div className="space-y-3">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500 text-center">
          Give — penalty card to another player
        </div>
        <div className="grid grid-cols-2 gap-2">
          {state.players
            .filter((p) => p.id !== me.playerId && !p.isEliminated)
            .map((p) => (
              <button
                key={p.id}
                onClick={() => setGiveTarget(p.id)}
                className={`py-3 rounded-lg text-[10px] font-bold uppercase tracking-widest border ${
                  giveTarget === p.id
                    ? 'border-white bg-white text-black'
                    : 'border-white/10 bg-zinc-900 text-zinc-300'
                }`}
              >
                {p.name}
              </button>
            ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={skip}
            className="flex-1 py-3 rounded-xl border border-white/10 text-[10px] font-bold uppercase tracking-widest"
          >
            skip
          </button>
          <button
            disabled={!giveTarget}
            onClick={() => {
              if (!giveTarget) return;
              socket.emit('game-action', {
                type: 'archduke/resolve-action',
                payload: { action: 'give', targetPlayerId: giveTarget },
              });
            }}
            className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest ${
              giveTarget ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-600 border border-white/5'
            }`}
          >
            give
          </button>
        </div>
      </div>
    );
  }

  // swap
  return (
    <div className="space-y-3">
      <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500 text-center">
        Swap — pick two slots
      </div>
      <div className="text-[10px] text-zinc-500 text-center">First slot:</div>
      <SlotPicker state={state} value={pick1} onPick={setPick1} />
      <div className="text-[10px] text-zinc-500 text-center">Second slot:</div>
      <SlotPicker state={state} value={pick2} onPick={setPick2} />
      <div className="flex gap-2">
        <button
          onClick={skip}
          className="flex-1 py-3 rounded-xl border border-white/10 text-[10px] font-bold uppercase tracking-widest"
        >
          skip
        </button>
        <button
          disabled={!pick1 || !pick2}
          onClick={() => {
            if (!pick1 || !pick2) return;
            socket.emit('game-action', {
              type: 'archduke/resolve-action',
              payload: {
                action: 'swap',
                aPlayerId: pick1.playerId,
                aSlot: pick1.slot,
                bPlayerId: pick2.playerId,
                bSlot: pick2.slot,
              },
            });
          }}
          className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest ${
            pick1 && pick2 ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-600 border border-white/5'
          }`}
        >
          swap
        </button>
      </div>
    </div>
  );
}

function SlotPicker({
  state,
  value,
  onPick,
}: {
  state: ArchdukeStateForPlayer;
  value: { playerId: string; slot: SlotId } | null;
  onPick: (v: { playerId: string; slot: SlotId }) => void;
}) {
  return (
    <div className="space-y-2">
      {state.players
        .filter((p) => !p.isEliminated)
        .map((p) => (
          <div key={p.id} className="space-y-1">
            <div className="text-[8px] uppercase font-bold tracking-widest text-zinc-500">
              {p.name}
              {p.id === state.me?.playerId && ' (you)'}
            </div>
            <div className="grid grid-cols-4 gap-1">
              {p.slots.map((slot, i) => {
                const selected = value?.playerId === p.id && value.slot === i;
                const disabled = slot.empty;
                return (
                  <button
                    key={i}
                    disabled={disabled}
                    onClick={() => onPick({ playerId: p.id, slot: i as SlotId })}
                    className={`aspect-[3/4] rounded-lg border text-[8px] font-bold uppercase ${
                      disabled
                        ? 'border-white/5 opacity-30'
                        : selected
                          ? 'border-white bg-white text-black'
                          : 'border-white/10 bg-zinc-900 text-zinc-300'
                    }`}
                  >
                    {disabled ? '—' : i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}

function WaitingPanel({ label }: { label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <motion.div
        animate={{ opacity: [0.3, 0.9, 0.3] }}
        transition={{ duration: 1.6, repeat: Infinity }}
        className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500"
      >
        {label}
      </motion.div>
      <Eye size={24} className="text-zinc-700" />
    </div>
  );
}

function playerName(state: ArchdukeStateForPlayer, id: string | undefined | null): string {
  if (!id) return 'someone';
  return state.players.find((p) => p.id === id)?.name ?? 'someone';
}

function canMatchCards(a: { kind: { kind: string } } & any, b: { kind: { kind: string } } & any): boolean {
  if (a.kind.kind === 'archduke' || b.kind.kind === 'archduke') return false;
  if (a.kind.kind === 'number' && b.kind.kind === 'number') return a.kind.value === b.kind.value;
  if (a.kind.kind === 'face' && b.kind.kind === 'face') return a.kind.suit === b.kind.suit;
  if (a.kind.kind === 'eclipse' && b.kind.kind === 'eclipse') return true;
  return false;
}
