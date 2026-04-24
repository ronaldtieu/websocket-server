import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, Coins, Clock } from 'lucide-react';
import { socket } from '../../lib/socket';
import type { TimeAuctionStateForPlayer } from './types';

function formatSeconds(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  return `${total.toFixed(1)}s`;
}

export function TimeAuctionPhone({ state }: { state: TimeAuctionStateForPlayer }) {
  const me = state.me;
  // local "is currently pressed" mirror — used for instant button visual
  // feedback before the server round-trip lands. authoritative source is
  // still state.me.pressStartedAt.
  const [localPressed, setLocalPressed] = useState(false);
  // animated round-clock and bank tickers reuse the same now timer.
  const [now, setNow] = useState(() => Date.now());
  // ref so the pointerup cleanup doesn't double-fire.
  const sentReleaseRef = useRef(false);

  useEffect(() => {
    if (state.phase !== 'bidding' && state.phase !== 'countdown') return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [state.phase]);

  // reset local-pressed mirror when the round resets or we get a server-
  // confirmed release.
  useEffect(() => {
    if (state.phase !== 'bidding') {
      setLocalPressed(false);
      sentReleaseRef.current = false;
      return;
    }
    if (me?.lockedBidMs !== null) {
      setLocalPressed(false);
    }
    if (me?.pressStartedAt === null) {
      setLocalPressed(false);
    } else if (me?.pressStartedAt !== null) {
      setLocalPressed(true);
    }
  }, [state.phase, me?.lockedBidMs, me?.pressStartedAt]);

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
  const bankMs = myPublic?.timeBankMs ?? 0;
  const tokens = myPublic?.tokens ?? 0;
  const bankEmpty = bankMs <= 0;
  const lockedThisRound = me.lockedBidMs !== null;
  const eliminated = myPublic?.isEliminated ?? false;
  const canBid =
    state.phase === 'bidding' && !lockedThisRound && !bankEmpty && !eliminated;

  // live elapsed for my own button while held — I'm allowed to see my own
  // bid in real time, just nobody else's.
  const myElapsed =
    me.pressStartedAt !== null ? Math.max(0, now - me.pressStartedAt) : 0;
  const liveBank = me.pressStartedAt !== null ? Math.max(0, bankMs - myElapsed) : bankMs;

  const handlePress = () => {
    if (!canBid) return;
    if (sentReleaseRef.current) return;
    setLocalPressed(true);
    socket.emit('game-action', { type: 'time-auction/press', payload: {} });
  };

  const handleRelease = () => {
    if (state.phase !== 'bidding') return;
    if (!localPressed && me.pressStartedAt === null) return;
    if (sentReleaseRef.current) return;
    sentReleaseRef.current = true;
    setLocalPressed(false);
    socket.emit('game-action', { type: 'time-auction/release', payload: {} });
  };

  // past rounds, but only show my own outcome label per row — for losing
  // rounds we don't expose anyone's bid duration. spec: "no display of
  // other players' bids, ever."
  const pastRounds = state.log.slice().reverse();

  return (
    <div className="min-h-screen bg-black text-white p-5 flex flex-col gap-5 selection:bg-white selection:text-black">
      {/* chrome */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">You</div>
          <div className="text-lg font-black uppercase tracking-tight">
            {myPublic?.name ?? 'Player'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">Tokens</div>
          <div className="text-lg font-black tracking-tighter flex items-center justify-end gap-1">
            <Coins size={14} className="text-zinc-500" />
            {tokens}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border border-white/5 rounded-xl px-4 py-3 bg-zinc-900/40">
        <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500">
          <Clock size={12} /> Time Bank
        </div>
        <div className="text-2xl font-black tracking-tighter font-mono text-white">
          {formatSeconds(liveBank)}
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500">
        <span>
          Round {Math.max(state.round, 1)} / {state.totalRounds}
        </span>
        <span>{state.phase}</span>
      </div>

      {/* main area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        {state.phase === 'countdown' && (
          <div className="text-center space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.5em] text-zinc-500">
              Get ready
            </div>
            <div className="text-7xl font-black tracking-tighter">
              {state.phaseDeadline !== null
                ? Math.max(0, Math.ceil((state.phaseDeadline - now) / 1000))
                : 0}
            </div>
          </div>
        )}

        {state.phase === 'bidding' && (
          <>
            <motion.button
              onPointerDown={handlePress}
              onPointerUp={handleRelease}
              onPointerLeave={handleRelease}
              onPointerCancel={handleRelease}
              disabled={!canBid && !localPressed}
              animate={{ scale: localPressed ? 0.96 : 1 }}
              transition={{ duration: 0.08 }}
              className={`w-full aspect-square max-w-[320px] rounded-full border-4 flex flex-col items-center justify-center font-black uppercase tracking-widest text-sm transition-colors select-none touch-none ${
                lockedThisRound
                  ? 'bg-zinc-900 text-zinc-500 border-white/10'
                  : bankEmpty
                    ? 'bg-zinc-900 text-zinc-700 border-white/5'
                    : localPressed
                      ? 'bg-white text-black border-white shadow-2xl shadow-white/30'
                      : 'bg-zinc-950 text-white border-white/30 hover:border-white/60'
              }`}
            >
              {lockedThisRound ? (
                <>
                  <Trophy size={28} className="mb-2" />
                  <span>Locked</span>
                  <span className="text-[10px] font-bold tracking-widest mt-1 text-zinc-400 font-mono">
                    {formatSeconds(me.lockedBidMs ?? 0)}
                  </span>
                </>
              ) : bankEmpty ? (
                <span>Bank Empty</span>
              ) : localPressed ? (
                <>
                  <span className="text-3xl font-black mb-2 font-mono">
                    {formatSeconds(myElapsed)}
                  </span>
                  <span className="text-[10px] tracking-widest">Hold</span>
                </>
              ) : (
                <>
                  <span className="text-2xl mb-2">HOLD</span>
                  <span>to bid</span>
                </>
              )}
            </motion.button>
            {!lockedThisRound && (
              <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.3em] text-center">
                Release to lock your bid
              </p>
            )}
          </>
        )}

        {state.phase === 'reveal' && state.lastReveal && (
          <div className="text-center space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.5em] text-zinc-500">
              Round {state.lastReveal.round}
            </div>
            {state.lastReveal.winnerId === me.playerId ? (
              <div className="space-y-2">
                <Trophy size={48} className="mx-auto text-white" />
                <div className="text-2xl font-black uppercase tracking-tight">You won!</div>
                <div className="text-xs text-zinc-500 uppercase tracking-widest font-bold font-mono">
                  Bid {formatSeconds(state.lastReveal.winningBidMs ?? 0)}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-lg font-black uppercase tracking-tight text-zinc-300">
                  {state.lastReveal.winnerName ?? 'No winner'}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  {state.lastReveal.awardedRandomly
                    ? 'random award'
                    : `won the token`}
                </div>
              </div>
            )}
          </div>
        )}

        {state.phase === 'finished' && (
          <div className="text-center space-y-3">
            <Trophy size={48} className="mx-auto text-white" />
            <div className="text-2xl font-black uppercase tracking-tighter">Game Over</div>
            {myPublic?.isTopTokens && (
              <div className="text-sm text-white uppercase tracking-widest font-bold">
                Most tokens — +1 piece
              </div>
            )}
            {myPublic?.isEliminated && (
              <div className="text-sm text-red-400 uppercase tracking-widest font-bold">Eliminated</div>
            )}
          </div>
        )}
      </div>

      {/* past rounds log — only winners shown, never losing bids */}
      {pastRounds.length > 0 && (
        <div className="border-t border-white/5 pt-4 max-h-40 overflow-y-auto">
          <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500 mb-2">
            Past rounds
          </div>
          <ul className="space-y-1 text-[11px] font-mono">
            {pastRounds.map((r) => {
              const wonByMe = r.winnerId === me.playerId;
              return (
                <li
                  key={r.round}
                  className={`flex items-center justify-between ${
                    wonByMe ? 'text-white' : 'text-zinc-500'
                  }`}
                >
                  <span>R{r.round}</span>
                  <span>
                    {wonByMe ? 'won by me' : `won by ${r.winnerName ?? '—'}`}
                    {r.awardedRandomly && ' (random)'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
