import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, Coins, Clock } from 'lucide-react';
import { socket } from '../../lib/socket';
import {
  PixelBadge,
  PixelButton,
  PixelMeter,
  PixelPanel,
  PIXEL_GRID_STYLE,
  type PixelTone,
} from '../../primitives/PixelHUD';
import type { TimeAuctionStateForPlayer } from './types';

function formatSeconds(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  return `${total.toFixed(1)}s`;
}

function phaseTone(phase: string): PixelTone {
  if (phase === 'countdown') return 'amber';
  if (phase === 'bidding') return 'cyan';
  if (phase === 'reveal') return 'rose';
  if (phase === 'finished') return 'emerald';
  return 'slate';
}

export function TimeAuctionPhone({ state }: { state: TimeAuctionStateForPlayer }) {
  const me = state.me;
  const [localPressed, setLocalPressed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const sentReleaseRef = useRef(false);

  useEffect(() => {
    if (state.phase !== 'bidding' && state.phase !== 'countdown') return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== 'bidding') {
      setLocalPressed(false);
      sentReleaseRef.current = false;
      return;
    }
    if (me?.lockedBidMs !== null || me?.pressStartedAt === null) {
      setLocalPressed(false);
    } else {
      setLocalPressed(true);
    }
  }, [state.phase, me?.lockedBidMs, me?.pressStartedAt]);

  if (!me) {
    return (
      <div className="min-h-screen bg-[#05060a] p-6 flex items-center justify-center font-mono">
        <div className="text-center space-y-4">
          <PixelBadge tone="slate">Spectating</PixelBadge>
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
  const canBid = state.phase === 'bidding' && !lockedThisRound && !bankEmpty && !eliminated;
  const myElapsed = me.pressStartedAt !== null ? Math.max(0, now - me.pressStartedAt) : 0;
  const liveBank = me.pressStartedAt !== null ? Math.max(0, bankMs - myElapsed) : bankMs;
  const pastRounds = state.log.slice().reverse();
  const currentPhaseTone = phaseTone(state.phase);

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

  return (
    <div className="min-h-screen bg-[#05060a] text-white p-4 flex flex-col gap-4 selection:bg-white selection:text-black relative overflow-hidden font-mono">
      <div className="absolute inset-0 opacity-35 pointer-events-none" style={PIXEL_GRID_STYLE} />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,rgba(156,236,255,0.08),transparent_30%),radial-gradient(circle_at_bottom,rgba(255,211,110,0.08),transparent_35%)]" />

      <div className="relative z-10 grid grid-cols-2 gap-3">
        <PixelPanel tone="amber" title="Operator" subtitle={myPublic?.name ?? 'Player'}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-amber-200">
            Round {Math.max(state.round, 1)} / {state.totalRounds}
          </div>
        </PixelPanel>

        <PixelPanel tone="cyan" title="Tokens" subtitle="Current stack">
          <div className="flex items-end gap-2 text-white">
            <Coins size={16} className="mb-1 text-zinc-500" />
            <span className="text-4xl font-black tracking-[-0.12em]">{tokens}</span>
          </div>
        </PixelPanel>
      </div>

      <div className="relative z-10">
        <PixelPanel
          tone={currentPhaseTone}
          title="Time Bank"
          subtitle={state.phase}
          meta={<PixelBadge tone={currentPhaseTone}>{formatSeconds(liveBank)}</PixelBadge>}
        >
          <PixelMeter
            value={liveBank}
            max={Math.max(bankMs, liveBank, 30_000)}
            blocks={12}
            tone={currentPhaseTone}
            label="Reserve"
            valueLabel={formatSeconds(liveBank)}
          />
        </PixelPanel>
      </div>

      <div className="relative z-10 flex-1 flex flex-col gap-4">
        {(state.phase === 'countdown' || state.phase === 'bidding' || state.phase === 'reveal' || state.phase === 'finished') && (
          <PixelPanel
            tone={currentPhaseTone}
            title="Bid Pad"
            subtitle={
              state.phase === 'countdown'
                ? 'Stand by'
                : state.phase === 'bidding'
                  ? 'Press and hold'
                  : state.phase === 'reveal'
                    ? 'Result feed'
                    : 'Session closed'
            }
            className="flex-1"
          >
            <div className="flex h-full flex-col items-center justify-center gap-4">
              {state.phase === 'countdown' && (
                <>
                  <PixelBadge tone="amber">Boot sequence</PixelBadge>
                  <div className="text-7xl font-black tracking-[-0.16em] text-white">
                    {state.phaseDeadline !== null
                      ? Math.max(0, Math.ceil((state.phaseDeadline - now) / 1000))
                      : 0}
                  </div>
                </>
              )}

              {state.phase === 'bidding' && (
                <>
                  <motion.button
                    onPointerDown={handlePress}
                    onPointerUp={handleRelease}
                    onPointerLeave={handleRelease}
                    onPointerCancel={handleRelease}
                    disabled={!canBid && !localPressed}
                    animate={{ scale: localPressed ? 0.97 : 1 }}
                    transition={{ duration: 0.08 }}
                    className={`relative w-full aspect-square max-w-[320px] overflow-hidden border-[4px] rounded-[8px] shadow-[10px_10px_0_rgba(0,0,0,0.35)] transition-all ${
                      lockedThisRound
                        ? 'border-zinc-700 bg-[#111216] text-zinc-500'
                        : bankEmpty
                          ? 'border-zinc-800 bg-[#0c0d10] text-zinc-700'
                          : localPressed
                            ? 'border-cyan-100 bg-[#9cecff] text-[#06161d]'
                            : 'border-cyan-300/70 bg-[#07141b] text-white'
                    }`}
                  >
                    <span className="absolute inset-0 opacity-25 pointer-events-none" style={PIXEL_GRID_STYLE} />
                    <div className="absolute inset-[8px] border border-white/10 pointer-events-none" />
                    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3 px-6 text-center uppercase">
                      {lockedThisRound ? (
                        <>
                          <Trophy size={32} />
                          <div className="text-3xl font-black tracking-[-0.12em]">Locked</div>
                          <PixelBadge tone="amber">{formatSeconds(me.lockedBidMs ?? 0)}</PixelBadge>
                        </>
                      ) : bankEmpty ? (
                        <>
                          <Clock size={32} />
                          <div className="text-3xl font-black tracking-[-0.12em]">Bank Empty</div>
                        </>
                      ) : localPressed ? (
                        <>
                          <div className="text-5xl font-black tracking-[-0.14em]">
                            {formatSeconds(myElapsed)}
                          </div>
                          <PixelBadge tone="cyan">Holding</PixelBadge>
                        </>
                      ) : (
                        <>
                          <div className="text-5xl font-black tracking-[-0.14em]">Hold</div>
                          <div className="text-[11px] tracking-[0.26em] text-cyan-200">to bid</div>
                        </>
                      )}
                    </div>
                  </motion.button>

                  {!lockedThisRound && (
                    <div className="text-center text-[10px] uppercase tracking-[0.22em] text-zinc-400">
                      Release to lock your bid
                    </div>
                  )}
                </>
              )}

              {state.phase === 'reveal' && state.lastReveal && (
                <div className="text-center space-y-3">
                  <PixelBadge tone="rose">Round {state.lastReveal.round}</PixelBadge>
                  {state.lastReveal.winnerId === me.playerId ? (
                    <>
                      <Trophy size={52} className="mx-auto text-white" />
                      <div className="text-3xl font-black uppercase tracking-[-0.12em] text-white">
                        You won
                      </div>
                      <PixelBadge tone="amber">
                        Bid {formatSeconds(state.lastReveal.winningBidMs ?? 0)}
                      </PixelBadge>
                    </>
                  ) : (
                    <>
                      <div className="text-2xl font-black uppercase tracking-[-0.1em] text-zinc-200">
                        {state.lastReveal.winnerName ?? 'No winner'}
                      </div>
                      <PixelBadge tone={state.lastReveal.awardedRandomly ? 'amber' : 'rose'}>
                        {state.lastReveal.awardedRandomly ? 'Random token' : 'Won the token'}
                      </PixelBadge>
                    </>
                  )}
                </div>
              )}

              {state.phase === 'finished' && (
                <div className="text-center space-y-3">
                  <Trophy size={52} className="mx-auto text-white" />
                  <div className="text-3xl font-black uppercase tracking-[-0.12em] text-white">
                    Game Over
                  </div>
                  {myPublic?.isTopTokens && <PixelBadge tone="amber">Most tokens +1 piece</PixelBadge>}
                  {myPublic?.isEliminated && <PixelBadge tone="rose">Eliminated</PixelBadge>}
                </div>
              )}
            </div>
          </PixelPanel>
        )}

        {pastRounds.length > 0 && (
          <PixelPanel tone="slate" title="Round Log" subtitle="Winners only">
            <ul className="space-y-2 text-[11px]">
              {pastRounds.map((round) => {
                const wonByMe = round.winnerId === me.playerId;
                return (
                  <li
                    key={round.round}
                    className={`flex items-center justify-between gap-3 border-[3px] px-3 py-2 shadow-[4px_4px_0_rgba(0,0,0,0.25)] ${
                      wonByMe
                        ? 'border-cyan-300/30 bg-cyan-300/10 text-white'
                        : 'border-white/8 bg-black/25 text-zinc-400'
                    }`}
                  >
                    <span className="font-black uppercase tracking-[0.2em]">R{round.round}</span>
                    <span className="text-right uppercase tracking-[0.16em]">
                      {wonByMe ? 'Won by me' : `Won by ${round.winnerName ?? 'none'}`}
                      {round.awardedRandomly && ' / random'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </PixelPanel>
        )}
      </div>

      {state.phase === 'bidding' && !lockedThisRound && (
        <div className="relative z-10">
          <PixelButton tone="cyan" variant="ghost" className="w-full" onClick={handleRelease}>
            Release Bid
          </PixelButton>
        </div>
      )}
    </div>
  );
}
