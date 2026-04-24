import { motion, AnimatePresence } from 'motion/react';
import { Shield, Trophy } from 'lucide-react';
import { PhaseTimer } from '../../primitives/PhaseTimer';
import { socket } from '../../lib/socket';
import type { CrookedCopsPublicState, NodeId, TeamColor, WinnerKind } from './types';

const PHASE_LABELS: Record<string, string> = {
  'thief-phase': 'Thieves on the move',
  'police-phase': 'Police acting',
  'arrest-resolution': 'Arrest resolution',
  checkpoint: 'Checkpoint reveal',
  'whistleblower-vote': 'Whistleblower vote',
  finished: 'Game over',
};

const TEAM_COLORS: Record<TeamColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
};

const VIEW_W = 800;
const VIEW_H = 600;

export function CrookedCopsMainScreen({
  state,
  isHost,
  onReturnToLobby,
}: {
  state: CrookedCopsPublicState;
  isHost: boolean;
  onReturnToLobby: () => void;
}) {
  const layout = state.graph.layout;

  return (
    <div className="min-h-screen bg-black text-white px-12 pt-12 pb-28 flex flex-col gap-6 relative overflow-hidden">
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
            <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">
              Crooked Cops
            </h1>
            <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-[0.4em] mt-2">
              Round {state.round} / {state.totalRounds}
              {state.publicPieceCount != null &&
                ` · Pieces ${state.publicPieceCount} / 12`}
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

      {/* Arrest banner */}
      <AnimatePresence>
        {state.lastArrest && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`relative z-10 rounded-xl border px-6 py-4 ${
              state.lastArrest.success
                ? 'border-green-500/40 bg-green-500/5 text-green-200'
                : state.lastArrest.nullifiedByCrookedCop
                  ? 'border-amber-500/40 bg-amber-500/5 text-amber-200'
                  : 'border-zinc-500/30 bg-zinc-500/5 text-zinc-300'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-70">
              Arrest attempt
            </div>
            <div className="text-base mt-1">
              <span className="font-bold">{state.lastArrest.byName}</span> attempted arrest at{' '}
              <span className="font-mono">{state.lastArrest.targetNode}</span> —{' '}
              {state.lastArrest.success
                ? 'thief caught!'
                : state.lastArrest.nullifiedByCrookedCop
                  ? 'somehow it failed...'
                  : 'no thief here'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subway graph */}
      <div className="flex-1 flex items-center justify-center relative z-10">
        {state.phase === 'finished' && state.outcome ? (
          <FinishedView state={state} />
        ) : (
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="w-full h-full max-h-[600px]"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Edges */}
            {state.graph.edges.map(([a, b]) => {
              const pa = layout[a];
              const pb = layout[b];
              if (!pa || !pb) return null;
              return (
                <line
                  key={`${a}-${b}`}
                  x1={pa.x * VIEW_W}
                  y1={pa.y * VIEW_H}
                  x2={pb.x * VIEW_W}
                  y2={pb.y * VIEW_H}
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth={1.5}
                />
              );
            })}
            {/* Nodes */}
            {state.graph.nodes.map((id) => {
              const pos = layout[id];
              if (!pos) return null;
              return (
                <g key={id} transform={`translate(${pos.x * VIEW_W}, ${pos.y * VIEW_H})`}>
                  <circle r={6} fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" />
                  <text
                    x={9}
                    y={4}
                    fontSize={9}
                    fill="rgba(255,255,255,0.4)"
                    fontFamily="monospace"
                  >
                    {id}
                  </text>
                </g>
              );
            })}
            {/* Thief markers (hidden until reveal — main screen never sees them
                unless server sends them as null we skip). */}
            {state.players
              .filter((p) => p.publicRole === 'thief' && p.node)
              .map((p) => {
                const pos = layout[p.node as NodeId];
                if (!pos) return null;
                return (
                  <g key={`thief-${p.id}`} transform={`translate(${pos.x * VIEW_W}, ${pos.y * VIEW_H})`}>
                    <circle r={11} fill="white" stroke="black" strokeWidth={2} />
                    <text x={0} y={4} fontSize={10} fill="black" fontWeight="bold" textAnchor="middle">
                      T
                    </text>
                  </g>
                );
              })}
            {/* Cop markers (always public) */}
            {state.players
              .filter((p) => p.publicRole === 'cop' && p.node)
              .map((p, idx) => {
                const pos = layout[p.node as NodeId];
                if (!pos) return null;
                const teamColor = p.team ? TEAM_COLORS[p.team] : '#888';
                return (
                  <g
                    key={`cop-${p.id}`}
                    transform={`translate(${pos.x * VIEW_W + ((idx % 3) - 1) * 6}, ${pos.y * VIEW_H + 12})`}
                  >
                    <circle r={6} fill={teamColor} stroke="black" strokeWidth={1} />
                  </g>
                );
              })}
          </svg>
        )}
      </div>

      {/* Roster strip */}
      <div className="relative z-10 border-t border-white/5 pt-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-500 mb-3">
          Roster
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {state.players.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-white/5 bg-zinc-900/40 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    background:
                      p.publicRole === 'thief'
                        ? '#ffffff'
                        : p.team
                          ? TEAM_COLORS[p.team]
                          : '#666',
                  }}
                />
                <span className="text-[10px] font-bold uppercase tracking-widest truncate">
                  {p.name}
                </span>
              </div>
              <div className="text-[9px] text-zinc-500 mt-1 uppercase tracking-widest">
                {p.publicRole === 'thief' ? 'Thief' : `${p.team ?? 'cop'} cop`}
                {p.arrestedThisRound ? ' · sitting out' : ''}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Host controls */}
      {isHost && (
        <>
          <button
            onClick={() => socket.emit('host-skip-phase')}
            className="absolute bottom-6 left-6 z-20 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-white/10 hover:text-white transition-all"
          >
            Skip Phase
          </button>
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

function FinishedView({ state }: { state: CrookedCopsPublicState }) {
  const outcome = state.outcome!;
  const winnerLabel: Record<WinnerKind, string> = {
    thieves: 'THIEVES WIN',
    police: 'POLICE WIN',
    'timeout-thieves': 'TIMEOUT — Thieves',
    'timeout-police': 'TIMEOUT — Police',
  };
  return (
    <div className="w-full max-w-3xl space-y-8 text-center">
      <Trophy size={56} className="mx-auto text-white" />
      <h2 className="text-5xl font-black tracking-tighter">{winnerLabel[outcome.winner]}</h2>
      <div className="text-zinc-400 text-sm">
        Pieces collected: {outcome.piecesCollected} / 12
      </div>

      {outcome.voteResults.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {outcome.voteResults.map((r) => (
            <div
              key={r.team}
              className="rounded-xl border border-white/10 bg-zinc-900/40 p-4 text-left"
            >
              <div
                className="text-[10px] font-bold uppercase tracking-widest mb-2"
                style={{ color: TEAM_COLORS[r.team] }}
              >
                {r.team} team verdict
              </div>
              <div className="text-sm font-bold">
                {r.suspectName ?? 'no decision'}
                {r.caughtCrookedCop && (
                  <span className="ml-2 text-green-300">caught!</span>
                )}
              </div>
              <div className="text-[10px] text-zinc-500 mt-2">
                {r.tally
                  .sort((a, b) => b.votes - a.votes)
                  .map((t) => `${t.playerName}: ${t.votes}`)
                  .join(' · ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
