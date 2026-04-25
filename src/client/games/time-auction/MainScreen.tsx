import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Clock, Coins, Users, Hourglass } from 'lucide-react';
import { socket } from '../../lib/socket';
import {
  PixelBadge,
  PixelButton,
  PixelMeter,
  PixelPanel,
  PIXEL_GRID_STYLE,
  type PixelTone,
} from '../../primitives/PixelHUD';
import type { TimeAuctionPublicState } from './types';

const PHASE_LABELS: Record<string, string> = {
  countdown: 'Boot sequence',
  bidding: 'Auction live',
  reveal: 'Mint result',
  finished: 'Session closed',
};

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

function statusTextForPlayer(player: TimeAuctionPublicState['players'][number]) {
  if (player.isEliminated) return 'out';
  if (player.isHolding) return 'holding';
  if (player.hasReleased) return 'locked';
  if (player.isTopTokens) return 'leader';
  return 'idle';
}

function RoundClock({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [startedAt]);

  if (startedAt === null) {
    return <div className="text-7xl md:text-8xl font-black tracking-[-0.12em] text-zinc-700">0.0s</div>;
  }

  const elapsed = Math.max(0, now - startedAt);
  return (
    <div className="text-7xl md:text-8xl font-black tracking-[-0.12em] text-white">
      {formatSeconds(elapsed)}
    </div>
  );
}

function BiddingMeter({
  startedAt,
  deadline,
}: {
  startedAt: number | null;
  deadline: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null || deadline === null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [startedAt, deadline]);

  if (startedAt === null || deadline === null) return null;

  const total = Math.max(1, deadline - startedAt);
  const elapsed = Math.max(0, Math.min(total, now - startedAt));

  return (
    <PixelMeter
      value={elapsed}
      max={total}
      blocks={18}
      tone="cyan"
      label="Auction clock"
      valueLabel={formatSeconds(elapsed)}
    />
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
  const currentPhaseTone = phaseTone(state.phase);
  const phaseLabel = PHASE_LABELS[state.phase] ?? state.phase;
  const completedRounds = state.phase === 'finished' ? state.totalRounds : Math.max(state.round - 1, 0);
  const maxVisibleBank = Math.max(1, ...state.players.map((p) => p.timeBankMs));
  const recentRounds = state.log.slice(-4).reverse();
  const leaderCount = state.players.filter((p) => p.isTopTokens && !p.isEliminated).length;
  const activePlayers = state.players.filter((p) => !p.isEliminated).length;
  const totalTokens = useMemo(
    () => state.players.reduce((sum, player) => sum + player.tokens, 0),
    [state.players],
  );

  return (
    <div className="min-h-screen bg-[#05060a] text-white px-4 md:px-10 pt-8 pb-28 flex flex-col gap-4 relative overflow-hidden font-mono">
      <div className="absolute inset-0 opacity-40 pointer-events-none" style={PIXEL_GRID_STYLE} />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,rgba(255,211,110,0.10),transparent_28%),radial-gradient(circle_at_bottom,rgba(156,236,255,0.08),transparent_35%)]" />

      <div className="relative z-10 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <PixelPanel
          tone="amber"
          title="Arcade Market"
          subtitle={`Round ${Math.max(state.round, 1)} / ${state.totalRounds}`}
          meta={<PixelBadge tone={currentPhaseTone}>{phaseLabel}</PixelBadge>}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center border-[3px] border-amber-100 bg-[#ffd36e] text-[#1d1300] shadow-[6px_6px_0_rgba(0,0,0,0.35)]">
                <Clock size={32} strokeWidth={2.6} />
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-black uppercase tracking-[-0.12em] leading-none">
                  Time Auction
                </h1>
                <div className="mt-2 text-[11px] uppercase tracking-[0.24em] text-amber-200">
                  Hold to bid. Burn time. Mint tokens.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 min-w-full sm:min-w-[250px]">
              <div className="border-[3px] border-white/10 bg-black/25 px-3 py-2 shadow-[4px_4px_0_rgba(0,0,0,0.35)]">
                <div className="text-[9px] uppercase tracking-[0.24em] text-amber-200">Active</div>
                <div className="mt-1 flex items-end gap-2 text-white">
                  <Users size={14} className="mb-1" />
                  <span className="text-3xl font-black tracking-[-0.12em]">{activePlayers}</span>
                </div>
              </div>
              <div className="border-[3px] border-white/10 bg-black/25 px-3 py-2 shadow-[4px_4px_0_rgba(0,0,0,0.35)]">
                <div className="text-[9px] uppercase tracking-[0.24em] text-amber-200">Leaders</div>
                <div className="mt-1 flex items-end gap-2 text-white">
                  <Trophy size={14} className="mb-1" />
                  <span className="text-3xl font-black tracking-[-0.12em]">{leaderCount}</span>
                </div>
              </div>
            </div>
          </div>
        </PixelPanel>

        <PixelPanel tone="cyan" title="Round Progress" subtitle="Token ladder">
          <PixelMeter
            value={completedRounds}
            max={state.totalRounds}
            blocks={state.totalRounds}
            tone="cyan"
            label="Completed"
            valueLabel={`${completedRounds}/${state.totalRounds}`}
          />
        </PixelPanel>
      </div>

      <div className="relative z-10 grid flex-1 gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <PixelPanel
          tone={currentPhaseTone}
          title="Main Stage"
          subtitle={phaseLabel}
          className="min-h-[340px] flex flex-col"
        >
          <div className="flex-1 flex items-center justify-center">
            {state.phase === 'countdown' && <CountdownDisplay deadline={state.phaseDeadline} />}

            {state.phase === 'bidding' && (
              <div className="w-full max-w-2xl text-center space-y-8">
                <div className="space-y-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.38em] text-cyan-200">
                    Clock core
                  </div>
                  <RoundClock startedAt={state.biddingStartedAt} />
                </div>
                <BiddingMeter startedAt={state.biddingStartedAt} deadline={state.phaseDeadline} />
                <div className="inline-flex flex-wrap items-center justify-center gap-2">
                  <PixelBadge tone="cyan">Hidden bids</PixelBadge>
                  <PixelBadge tone="amber">{totalTokens} TOK in play</PixelBadge>
                </div>
              </div>
            )}

            {state.phase === 'reveal' && state.lastReveal && <RevealBanner reveal={state.lastReveal} />}

            {state.phase === 'finished' && <GameOver state={state} />}
          </div>
        </PixelPanel>

        <div className="flex flex-col gap-4">
          <PixelPanel tone="slate" title="Market Stats" subtitle="Session telemetry">
            <div className="grid grid-cols-2 gap-3">
              <div className="border-[3px] border-white/8 bg-black/25 px-3 py-3 shadow-[4px_4px_0_rgba(0,0,0,0.35)]">
                <div className="text-[9px] uppercase tracking-[0.24em] text-zinc-400">Tokens</div>
                <div className="mt-2 flex items-end gap-2 text-white">
                  <Coins size={16} className="mb-1 text-zinc-500" />
                  <span className="text-3xl font-black tracking-[-0.12em]">{totalTokens}</span>
                </div>
              </div>
              <div className="border-[3px] border-white/8 bg-black/25 px-3 py-3 shadow-[4px_4px_0_rgba(0,0,0,0.35)]">
                <div className="text-[9px] uppercase tracking-[0.24em] text-zinc-400">Largest Bank</div>
                <div className="mt-2 flex items-end gap-2 text-white">
                  <Hourglass size={16} className="mb-1 text-zinc-500" />
                  <span className="text-3xl font-black tracking-[-0.12em]">{formatSeconds(maxVisibleBank)}</span>
                </div>
              </div>
            </div>
          </PixelPanel>

          <PixelPanel tone="rose" title="Recent Winners" subtitle="Last four rounds">
            <div className="space-y-2">
              {recentRounds.length === 0 && (
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  No reveals yet.
                </div>
              )}
              {recentRounds.map((round) => (
                <div
                  key={round.round}
                  className="flex items-center justify-between gap-3 border-[3px] border-white/8 bg-black/25 px-3 py-2 shadow-[4px_4px_0_rgba(0,0,0,0.25)]"
                >
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.24em] text-rose-200">
                      Round {round.round}
                    </div>
                    <div className="mt-1 text-sm font-black uppercase tracking-[0.14em] text-white">
                      {round.winnerName ?? 'No winner'}
                    </div>
                  </div>
                  <PixelBadge tone={round.awardedRandomly ? 'amber' : 'rose'}>
                    {round.awardedRandomly ? 'Random' : formatSeconds(round.winningBidMs ?? 0)}
                  </PixelBadge>
                </div>
              ))}
            </div>
          </PixelPanel>
        </div>
      </div>

      <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        {state.players.map((player) => {
          const tone: PixelTone = player.isEliminated
            ? 'rose'
            : player.isHolding
              ? 'cyan'
              : player.isTopTokens
                ? 'amber'
                : 'slate';
          const status = statusTextForPlayer(player);

          return (
            <PixelPanel
              key={player.id}
              tone={tone}
              title={player.name}
              subtitle="Bidder unit"
              meta={<PixelBadge tone={tone}>{status}</PixelBadge>}
              className="min-h-[160px]"
            >
              <div className="space-y-3">
                <div className="flex items-end gap-2">
                  <Coins size={14} className="mb-1 text-zinc-500" />
                  <span className="text-3xl font-black tracking-[-0.12em] text-white">
                    {player.tokens}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">tok</span>
                </div>
                <PixelMeter
                  value={player.timeBankMs}
                  max={maxVisibleBank}
                  blocks={8}
                  tone={tone}
                  label="Bank"
                  valueLabel={formatSeconds(player.timeBankMs)}
                />
              </div>
            </PixelPanel>
          );
        })}
      </div>

      {isHost && (
        <>
          <div className="absolute bottom-6 left-6 z-20">
            <PixelButton tone="cyan" variant="ghost" onClick={() => socket.emit('host-skip-phase')}>
              Skip Phase
            </PixelButton>
          </div>
          <div className="absolute bottom-6 right-6 z-20">
            <PixelButton tone="rose" variant="ghost" onClick={onReturnToLobby}>
              End Game
            </PixelButton>
          </div>
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
    <div className="text-center space-y-5">
      <div className="inline-flex justify-center">
        <PixelBadge tone="amber">Get ready</PixelBadge>
      </div>
      <div className="text-8xl md:text-9xl font-black tracking-[-0.16em] text-white">
        {remainingSec}
      </div>
      <div className="text-[11px] uppercase tracking-[0.22em] text-amber-200">
        Auction bay opening
      </div>
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
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ opacity: 0 }}
        className="w-full max-w-xl text-center space-y-5"
      >
        <div className="inline-flex justify-center">
          <PixelBadge tone="rose">Round {reveal.round}</PixelBadge>
        </div>
        <Trophy size={56} className="mx-auto text-white" />
        {reveal.winnerName ? (
          <>
            <div className="text-5xl md:text-6xl font-black uppercase tracking-[-0.12em] text-white">
              {reveal.winnerName}
            </div>
            <div className="inline-flex justify-center">
              <PixelBadge tone={reveal.awardedRandomly ? 'amber' : 'rose'}>
                {reveal.awardedRandomly
                  ? 'No bids. Random token.'
                  : `Winning bid ${formatSeconds(reveal.winningBidMs ?? 0)}`}
              </PixelBadge>
            </div>
          </>
        ) : (
          <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">No winner</div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function GameOver({ state }: { state: TimeAuctionPublicState }) {
  const sorted = [...state.players].sort((a, b) => b.tokens - a.tokens);

  return (
    <div className="w-full max-w-4xl space-y-6 text-center">
      <Trophy size={64} className="mx-auto text-white" />
      <div className="text-5xl md:text-6xl font-black uppercase tracking-[-0.12em] text-white">
        Game Over
      </div>
      <div className="inline-flex justify-center">
        <PixelBadge tone="emerald">Final token stack</PixelBadge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {sorted.map((player) => (
          <PixelPanel
            key={player.id}
            tone={player.isEliminated ? 'rose' : player.isTopTokens ? 'amber' : 'slate'}
            title={player.name}
            subtitle="Final standing"
          >
            <div className="space-y-2">
              <div className="text-4xl font-black tracking-[-0.12em] text-white">{player.tokens}</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-400">tokens</div>
              {player.isTopTokens && (
                <PixelBadge tone="amber" className="mt-2">
                  +1 piece
                </PixelBadge>
              )}
              {player.isEliminated && (
                <PixelBadge tone="rose" className="mt-2">
                  Eliminated
                </PixelBadge>
              )}
            </div>
          </PixelPanel>
        ))}
      </div>
    </div>
  );
}
