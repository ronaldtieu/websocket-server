import { motion, AnimatePresence } from 'motion/react';
import { Shield, Trophy, Radar, Footprints, Siren } from 'lucide-react';
import { socket } from '../../lib/socket';
import {
  PixelBadge,
  PixelButton,
  PixelPanel,
  PIXEL_GRID_STYLE,
  type PixelTone,
} from '../../primitives/PixelHUD';
import { PhaseTimer } from '../../primitives/PhaseTimer';
import type { CrookedCopsPublicState, NodeId, TeamColor, WinnerKind } from './types';

const PHASE_LABELS: Record<string, string> = {
  'thief-phase': 'Thieves moving',
  'police-phase': 'Police acting',
  'arrest-resolution': 'Arrest resolution',
  checkpoint: 'Checkpoint reveal',
  'whistleblower-vote': 'Whistleblower vote',
  finished: 'Case closed',
};

const TEAM_COLORS: Record<TeamColor, string> = {
  red: '#ef4444',
  blue: '#60a5fa',
  green: '#34d399',
};

const VIEW_W = 800;
const VIEW_H = 600;

function phaseTone(phase: string): PixelTone {
  if (phase === 'thief-phase') return 'amber';
  if (phase === 'police-phase') return 'cyan';
  if (phase === 'arrest-resolution') return 'rose';
  if (phase === 'checkpoint') return 'emerald';
  if (phase === 'whistleblower-vote') return 'amber';
  if (phase === 'finished') return 'slate';
  return 'slate';
}

export function CrookedCopsMainScreen({
  state,
  isHost,
  onReturnToLobby,
}: {
  state: CrookedCopsPublicState;
  isHost: boolean;
  onReturnToLobby: () => void;
}) {
  const currentPhaseTone = phaseTone(state.phase);
  const thiefCount = state.players.filter((player) => player.publicRole === 'thief').length;
  const copCount = state.players.filter((player) => player.publicRole === 'cop').length;

  return (
    <div className="min-h-screen bg-[#040707] text-white px-4 md:px-10 pt-8 pb-28 flex flex-col gap-4 relative overflow-hidden font-mono">
      <div className="absolute inset-0 opacity-30 pointer-events-none" style={PIXEL_GRID_STYLE} />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.08),transparent_30%),radial-gradient(circle_at_bottom,rgba(96,165,250,0.08),transparent_36%)]" />

      <div className="relative z-10 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <PixelPanel
          tone="emerald"
          title="Metro Control"
          subtitle={`Round ${state.round} / ${state.totalRounds}`}
          meta={<PixelBadge tone={currentPhaseTone}>{PHASE_LABELS[state.phase] ?? state.phase}</PixelBadge>}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center border-[3px] border-emerald-100 bg-[#7af0bd] text-[#042015] shadow-[6px_6px_0_rgba(0,0,0,0.35)]">
                <Shield size={32} strokeWidth={2.6} />
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-black uppercase tracking-[-0.12em] leading-none">
                  Crooked Cops
                </h1>
                <div className="mt-2 text-[11px] uppercase tracking-[0.24em] text-emerald-200">
                  Tactical subway pursuit with hidden traitors.
                </div>
              </div>
            </div>
            <div className="min-w-full lg:min-w-[260px]">
              <PhaseTimer deadline={state.phaseDeadline} label="phase timer" />
            </div>
          </div>
        </PixelPanel>

        <PixelPanel tone="slate" title="Live Count" subtitle="Public roster">
          <div className="grid grid-cols-3 gap-3">
            <div className="border-[3px] border-white/8 bg-black/25 px-3 py-3 shadow-[4px_4px_0_rgba(0,0,0,0.35)]">
              <div className="text-[9px] uppercase tracking-[0.24em] text-zinc-400">Pieces</div>
              <div className="mt-2 text-4xl font-black tracking-[-0.14em] text-white">
                {state.publicPieceCount ?? '?'}
              </div>
            </div>
            <div className="border-[3px] border-white/8 bg-black/25 px-3 py-3 shadow-[4px_4px_0_rgba(0,0,0,0.35)]">
              <div className="text-[9px] uppercase tracking-[0.24em] text-zinc-400">Thieves</div>
              <div className="mt-2 text-4xl font-black tracking-[-0.14em] text-white">{thiefCount}</div>
            </div>
            <div className="border-[3px] border-white/8 bg-black/25 px-3 py-3 shadow-[4px_4px_0_rgba(0,0,0,0.35)]">
              <div className="text-[9px] uppercase tracking-[0.24em] text-zinc-400">Cops</div>
              <div className="mt-2 text-4xl font-black tracking-[-0.14em] text-white">{copCount}</div>
            </div>
          </div>
        </PixelPanel>
      </div>

      <AnimatePresence>
        {state.lastArrest && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="relative z-10"
          >
            <PixelPanel
              tone={
                state.lastArrest.success
                  ? 'emerald'
                  : state.lastArrest.nullifiedByCrookedCop
                    ? 'amber'
                    : 'rose'
              }
              title="Arrest Attempt"
              subtitle={state.lastArrest.byName}
              meta={
                <PixelBadge
                  tone={
                    state.lastArrest.success
                      ? 'emerald'
                      : state.lastArrest.nullifiedByCrookedCop
                        ? 'amber'
                        : 'rose'
                  }
                >
                  {state.lastArrest.targetNode}
                </PixelBadge>
              }
            >
              <div className="text-sm uppercase tracking-[0.18em]">
                {state.lastArrest.success
                  ? 'Thief caught.'
                  : state.lastArrest.nullifiedByCrookedCop
                    ? 'Arrest was nullified.'
                    : 'No thief at the target.'}
              </div>
            </PixelPanel>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 grid flex-1 gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <PixelPanel
          tone={currentPhaseTone}
          title="Subway Grid"
          subtitle="Live tactical map"
          className="min-h-[420px]"
        >
          <div className="flex h-full items-center justify-center">
            {state.phase === 'finished' && state.outcome ? (
              <FinishedView state={state} />
            ) : (
              <svg
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                className="w-full h-full max-h-[620px]"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <pattern id="metro-grid" width="16" height="16" patternUnits="userSpaceOnUse">
                    <path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width={VIEW_W} height={VIEW_H} fill="#08110f" />
                <rect width={VIEW_W} height={VIEW_H} fill="url(#metro-grid)" />

                {state.graph.edges.map(([a, b]) => {
                  const pa = state.graph.layout[a];
                  const pb = state.graph.layout[b];
                  if (!pa || !pb) return null;

                  return (
                    <g key={`${a}-${b}`}>
                      <line
                        x1={pa.x * VIEW_W}
                        y1={pa.y * VIEW_H}
                        x2={pb.x * VIEW_W}
                        y2={pb.y * VIEW_H}
                        stroke="#04110f"
                        strokeWidth={10}
                      />
                      <line
                        x1={pa.x * VIEW_W}
                        y1={pa.y * VIEW_H}
                        x2={pb.x * VIEW_W}
                        y2={pb.y * VIEW_H}
                        stroke="rgba(255,255,255,0.16)"
                        strokeWidth={4}
                      />
                    </g>
                  );
                })}

                {state.graph.pieceNodes.map((id) => {
                  const pos = state.graph.layout[id];
                  if (!pos) return null;

                  return (
                    <rect
                      key={`piece-${id}`}
                      x={pos.x * VIEW_W - 5}
                      y={pos.y * VIEW_H - 5}
                      width={10}
                      height={10}
                      fill="#ffd36e"
                      stroke="#402300"
                      strokeWidth={2}
                    />
                  );
                })}

                {state.graph.nodes.map((id) => {
                  const pos = state.graph.layout[id];
                  if (!pos) return null;

                  return (
                    <g key={id} transform={`translate(${pos.x * VIEW_W}, ${pos.y * VIEW_H})`}>
                      <rect x={-7} y={-7} width={14} height={14} fill="#d8f6ea" stroke="#04110f" strokeWidth={3} />
                      <rect x={-4} y={-4} width={8} height={8} fill="#0b1b17" />
                      <text
                        x={12}
                        y={4}
                        fontSize={10}
                        fill="rgba(216,246,234,0.75)"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {id}
                      </text>
                    </g>
                  );
                })}

                {state.players
                  .filter((player) => player.publicRole === 'thief' && player.node)
                  .map((player) => {
                    const pos = state.graph.layout[player.node as NodeId];
                    if (!pos) return null;

                    return (
                      <g key={`thief-${player.id}`} transform={`translate(${pos.x * VIEW_W}, ${pos.y * VIEW_H - 18})`}>
                        <rect x={-10} y={-10} width={20} height={20} fill="#ffffff" stroke="#111111" strokeWidth={3} />
                        <text x={0} y={4} fontSize={10} fill="#111111" fontWeight="bold" textAnchor="middle">
                          T
                        </text>
                      </g>
                    );
                  })}

                {state.players
                  .filter((player) => player.publicRole === 'cop' && player.node)
                  .map((player, index) => {
                    const pos = state.graph.layout[player.node as NodeId];
                    if (!pos) return null;
                    const teamColor = player.team ? TEAM_COLORS[player.team] : '#888';

                    return (
                      <rect
                        key={`cop-${player.id}`}
                        x={pos.x * VIEW_W - 5 + ((index % 3) - 1) * 8}
                        y={pos.y * VIEW_H + 12}
                        width={10}
                        height={10}
                        fill={teamColor}
                        stroke="#04110f"
                        strokeWidth={2}
                      />
                    );
                  })}
              </svg>
            )}
          </div>
        </PixelPanel>

        <div className="flex flex-col gap-4">
          <PixelPanel tone="amber" title="Case Notes" subtitle="Current operation">
            <div className="space-y-3">
              <div className="flex items-start gap-3 border-[3px] border-white/8 bg-black/25 px-3 py-3 shadow-[4px_4px_0_rgba(0,0,0,0.25)]">
                <Footprints size={16} className="mt-0.5 text-amber-200" />
                <div>
                  <div className="text-[9px] uppercase tracking-[0.24em] text-amber-200">Pieces</div>
                  <div className="mt-1 text-sm uppercase tracking-[0.16em] text-white">
                    Public trail count: {state.publicPieceCount ?? '?'} / 12
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 border-[3px] border-white/8 bg-black/25 px-3 py-3 shadow-[4px_4px_0_rgba(0,0,0,0.25)]">
                <Radar size={16} className="mt-0.5 text-cyan-200" />
                <div>
                  <div className="text-[9px] uppercase tracking-[0.24em] text-cyan-200">Phase</div>
                  <div className="mt-1 text-sm uppercase tracking-[0.16em] text-white">
                    {PHASE_LABELS[state.phase] ?? state.phase}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 border-[3px] border-white/8 bg-black/25 px-3 py-3 shadow-[4px_4px_0_rgba(0,0,0,0.25)]">
                <Siren size={16} className="mt-0.5 text-rose-200" />
                <div>
                  <div className="text-[9px] uppercase tracking-[0.24em] text-rose-200">Latest arrest</div>
                  <div className="mt-1 text-sm uppercase tracking-[0.16em] text-white">
                    {state.lastArrest
                      ? `${state.lastArrest.byName} at ${state.lastArrest.targetNode}`
                      : 'No arrest this round'}
                  </div>
                </div>
              </div>
            </div>
          </PixelPanel>

          <PixelPanel tone="slate" title="Field Units" subtitle="Public assignments">
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {state.players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between gap-3 border-[3px] border-white/8 bg-black/25 px-3 py-2 shadow-[4px_4px_0_rgba(0,0,0,0.25)]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="h-3 w-3 shrink-0 border border-black/40"
                      style={{
                        background:
                          player.publicRole === 'thief'
                            ? '#ffffff'
                            : player.team
                              ? TEAM_COLORS[player.team]
                              : '#888',
                      }}
                    />
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] truncate text-white">
                        {player.name}
                      </div>
                      <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                        {player.publicRole === 'thief' ? 'Thief' : `${player.team ?? 'cop'} cop`}
                        {player.arrestedThisRound ? ' / sitting out' : ''}
                      </div>
                    </div>
                  </div>
                  {player.team && <PixelBadge tone="slate">{player.team}</PixelBadge>}
                </div>
              ))}
            </div>
          </PixelPanel>
        </div>
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

function FinishedView({ state }: { state: CrookedCopsPublicState }) {
  const outcome = state.outcome!;
  const winnerLabel: Record<WinnerKind, string> = {
    thieves: 'THIEVES WIN',
    police: 'POLICE WIN',
    'timeout-thieves': 'TIMEOUT - THIEVES',
    'timeout-police': 'TIMEOUT - POLICE',
  };

  return (
    <div className="w-full max-w-4xl space-y-6 text-center">
      <Trophy size={60} className="mx-auto text-white" />
      <div className="text-5xl md:text-6xl font-black tracking-[-0.12em] text-white">
        {winnerLabel[outcome.winner]}
      </div>
      <div className="inline-flex justify-center">
        <PixelBadge tone="amber">Pieces {outcome.piecesCollected} / 12</PixelBadge>
      </div>

      {outcome.voteResults.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {outcome.voteResults.map((result) => (
            <PixelPanel key={result.team} tone="slate" title={`${result.team} team`} subtitle="Vote result">
              <div className="space-y-2 text-left">
                <div className="text-base font-black uppercase tracking-[0.12em] text-white">
                  {result.suspectName ?? 'No decision'}
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                  {result.caughtCrookedCop ? 'Crooked cop caught' : 'No crooked cop found'}
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  {result.tally
                    .sort((a, b) => b.votes - a.votes)
                    .map((entry) => `${entry.playerName}:${entry.votes}`)
                    .join(' / ')}
                </div>
              </div>
            </PixelPanel>
          ))}
        </div>
      )}
    </div>
  );
}
