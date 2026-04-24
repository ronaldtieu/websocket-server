import { useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import { PhaseTimer } from '../../primitives/PhaseTimer';
import { socket } from '../../lib/socket';
import type { CrookedCopsStateForPlayer, NodeId, TeamColor } from './types';

const TEAM_COLORS: Record<TeamColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
};

const VIEW_W = 360;
const VIEW_H = 360;

export function CrookedCopsPhone({ state }: { state: CrookedCopsStateForPlayer }) {
  const me = state.me;
  if (!me) {
    return (
      <div className="min-h-screen bg-black p-6 flex items-center justify-center">
        <div className="text-center text-zinc-500 text-xs uppercase font-bold tracking-widest">
          Spectating
        </div>
      </div>
    );
  }

  const myPlayer = state.players.find((p) => p.id === me.playerId);
  const teamColor = me.team ? TEAM_COLORS[me.team] : '#888';

  return (
    <div className="min-h-screen bg-black text-white p-5 flex flex-col gap-4 selection:bg-white selection:text-black">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">You</div>
          <div className="text-lg font-black uppercase tracking-tight">
            {myPlayer?.name ?? 'Player'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">Role</div>
          <div className="text-sm font-black uppercase tracking-widest" style={{ color: teamColor }}>
            {/* Crooked cop and ordinary cop look identical here — only the
                tracker panel below differs. */}
            {me.role === 'thief' ? 'Thief' : `${me.team ?? 'cop'} cop`}
          </div>
        </div>
      </div>

      <PhaseTimer
        deadline={state.phaseDeadline}
        label={`Round ${state.round} / ${state.totalRounds} · ${phaseLabel(state.phase)}`}
      />

      {/* Phase content */}
      <div className="flex-1 flex flex-col gap-4">
        {state.phase === 'thief-phase' && me.role === 'thief' && (
          <ThiefMovePanel state={state} />
        )}
        {state.phase === 'thief-phase' && me.role !== 'thief' && (
          <CenterMessage>Thieves are moving...</CenterMessage>
        )}

        {state.phase === 'police-phase' &&
          (me.role === 'cop' || me.role === 'crooked-cop') && (
            <CopActionPanel state={state} />
          )}
        {state.phase === 'police-phase' && me.role === 'thief' && (
          <CenterMessage>Police are acting. Hide.</CenterMessage>
        )}

        {state.phase === 'arrest-resolution' && (
          <CenterMessage>{state.lastArrest ? 'Resolving arrest...' : 'No arrest this turn.'}</CenterMessage>
        )}

        {state.phase === 'checkpoint' && (
          <CenterMessage>
            Checkpoint! Pieces so far: <span className="text-white font-bold">{state.publicPieceCount ?? '?'}</span>
          </CenterMessage>
        )}

        {state.phase === 'whistleblower-vote' &&
          (me.role === 'cop' || me.role === 'crooked-cop') && <VotePanel state={state} />}
        {state.phase === 'whistleblower-vote' && me.role === 'thief' && (
          <CenterMessage>Cops are voting on the crooked one...</CenterMessage>
        )}

        {state.phase === 'finished' && (
          <div className="text-center mt-6 space-y-3">
            <Trophy size={48} className="mx-auto text-white" />
            <div className="text-xl font-black uppercase tracking-tighter">Game over</div>
            {state.outcome && (
              <div className="text-zinc-400 text-sm">
                {state.outcome.winner.replace('-', ' ')} · pieces {state.outcome.piecesCollected}/12
              </div>
            )}
          </div>
        )}

        {/* Investigation result modal — only for cops */}
        {me.lastInvestigation && (me.role === 'cop' || me.role === 'crooked-cop') && (
          <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500">
              Investigation result
            </div>
            <div className="text-sm mt-1">
              <span className="font-mono">{me.lastInvestigation.node}</span>:{' '}
              <span className="font-bold">
                {me.lastInvestigation.thiefPassed ? 'Thief passed through!' : 'No trace.'}
              </span>
            </div>
          </div>
        )}

        {/* Radio chat — cops only */}
        {(me.role === 'cop' || me.role === 'crooked-cop') && me.team && (
          <RadioPanel state={state} team={me.team} />
        )}

        {/* Crooked-cop-only tracker panel. The ONLY place the role differs
            visually from an ordinary cop. */}
        {me.role === 'crooked-cop' && (
          <CrookedTrackerPanel state={state} />
        )}
      </div>
    </div>
  );
}

function phaseLabel(p: string): string {
  const map: Record<string, string> = {
    'thief-phase': 'Thief',
    'police-phase': 'Police',
    'arrest-resolution': 'Arrest',
    checkpoint: 'Checkpoint',
    'whistleblower-vote': 'Vote',
    finished: 'Done',
  };
  return map[p] ?? p;
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center text-sm text-zinc-400 mt-8 px-4 leading-relaxed">{children}</div>
  );
}

function ThiefMovePanel({ state }: { state: CrookedCopsStateForPlayer }) {
  const me = state.me!;
  const myPlayer = state.players.find((p) => p.id === me.playerId);
  const myNode = myPlayer?.node ?? null;
  const partner = state.players.find((p) => p.id === me.partnerId);

  const reachable = useMemo(() => {
    if (!myNode) return [];
    const within = nodesWithin(state.graph.adjacency, myNode, 2);
    const cops = new Set(
      state.players.filter((p) => p.publicRole === 'cop' && p.node).map((p) => p.node as NodeId),
    );
    return within.filter((n) => n !== myNode && !cops.has(n));
  }, [myNode, state.graph.adjacency, state.players]);

  const pieces = new Set(me.visiblePieceNodes ?? []);
  const [hover, setHover] = useState<NodeId | null>(null);

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-500">
        Move (up to 2 stations)
      </div>
      <MiniGraph
        state={state}
        highlight={new Set(reachable)}
        you={myNode}
        partner={partner?.node ?? null}
        pieces={pieces}
        hover={hover}
        onTap={(n) => {
          if (!reachable.includes(n)) return;
          socket.emit('game-action', {
            type: 'crooked-cops/move',
            payload: { toNode: n },
          });
        }}
        onHover={setHover}
      />
      <div className="text-[10px] text-zinc-500 text-center">
        Tap a glowing station. Cops block your tile.
      </div>
      {partner && (
        <div className="text-[10px] text-zinc-500 text-center">
          Partner thief: {partner.name} @ {partner.node ?? '?'}
        </div>
      )}
    </div>
  );
}

function CopActionPanel({ state }: { state: CrookedCopsStateForPlayer }) {
  const me = state.me!;
  const myPlayer = state.players.find((p) => p.id === me.playerId);
  const myNode = myPlayer?.node ?? null;

  const reachable = useMemo(() => {
    if (!myNode) return [];
    const within = nodesWithin(state.graph.adjacency, myNode, 1);
    return within.filter((n) => n !== myNode);
  }, [myNode, state.graph.adjacency]);

  const arrestTargets = useMemo(() => {
    if (!myNode) return [];
    return [myNode, ...(state.graph.adjacency[myNode] ?? [])];
  }, [myNode, state.graph.adjacency]);

  const hasMoved = myPlayer?.hasActedThisPhase || (reachable.length > 0 && false);
  // hasActedThisPhase is true only after both move + action; but server gates
  // re-moves with a clear error. Show buttons regardless and rely on errors.

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-500">
        Police phase — move 1, then act
      </div>
      <MiniGraph
        state={state}
        highlight={new Set(reachable)}
        you={myNode}
        partner={null}
        pieces={new Set(me.visiblePieceNodes ?? [])}
        onTap={(n) => {
          if (!reachable.includes(n)) return;
          socket.emit('game-action', {
            type: 'crooked-cops/move',
            payload: { toNode: n },
          });
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() =>
            socket.emit('game-action', {
              type: 'crooked-cops/investigate',
              payload: { node: myNode },
            })
          }
          disabled={!myNode}
          className="py-3 rounded-xl bg-white text-black font-bold uppercase tracking-widest text-xs disabled:opacity-30"
        >
          Investigate
        </button>
        <ArrestButton targets={arrestTargets} />
      </div>
      {hasMoved && (
        <div className="text-[10px] text-zinc-500 text-center">Acted this round.</div>
      )}
    </div>
  );
}

function ArrestButton({ targets }: { targets: NodeId[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full py-3 rounded-xl bg-red-600 text-white font-bold uppercase tracking-widest text-xs"
      >
        Arrest
      </button>
      {open && (
        <div className="absolute left-0 right-0 mt-2 bg-zinc-900 border border-white/10 rounded-lg p-2 z-10 grid grid-cols-3 gap-1">
          {targets.map((n) => (
            <button
              key={n}
              onClick={() => {
                setOpen(false);
                socket.emit('game-action', {
                  type: 'crooked-cops/arrest',
                  payload: { targetNode: n },
                });
              }}
              className="px-2 py-1 text-[10px] font-mono bg-zinc-800 hover:bg-zinc-700 rounded"
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VotePanel({ state }: { state: CrookedCopsStateForPlayer }) {
  const me = state.me!;
  const teammates = state.players.filter((p) => p.team === me.team && p.id !== me.playerId);
  return (
    <div className="space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-500">
        Whistleblower — pick the crooked one on your team
      </div>
      <div className="grid grid-cols-2 gap-2">
        {teammates.map((p) => (
          <button
            key={p.id}
            disabled={me.hasVoted}
            onClick={() =>
              socket.emit('game-action', {
                type: 'crooked-cops/vote',
                payload: { suspectId: p.id },
              })
            }
            className="py-3 rounded-xl border border-white/10 bg-zinc-900 text-sm font-bold uppercase tracking-widest hover:bg-zinc-800 disabled:opacity-30"
          >
            {p.name}
          </button>
        ))}
      </div>
      {me.hasVoted && (
        <div className="text-[10px] text-zinc-500 text-center">Vote locked in.</div>
      )}
    </div>
  );
}

function RadioPanel({ state, team }: { state: CrookedCopsStateForPlayer; team: TeamColor }) {
  const [text, setText] = useState('');
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-3 space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
        Team radio · {team}
      </div>
      <div className="max-h-40 overflow-y-auto space-y-1 text-[12px]">
        {state.radio.length === 0 && (
          <div className="text-zinc-600 italic text-[11px]">No chatter yet.</div>
        )}
        {state.radio.map((m, i) => (
          <div key={i}>
            <span className="font-bold">{m.fromName}:</span>{' '}
            <span className="text-zinc-300">{m.text}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="say something..."
          className="flex-1 bg-zinc-800 border border-white/10 rounded px-2 py-1 text-xs outline-none"
        />
        <button
          onClick={() => {
            const t = text.trim();
            if (!t) return;
            socket.emit('game-action', {
              type: 'crooked-cops/radio',
              payload: { team, text: t },
            });
            setText('');
          }}
          className="px-3 py-1 bg-white text-black text-[10px] font-bold uppercase tracking-widest rounded"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function CrookedTrackerPanel({ state }: { state: CrookedCopsStateForPlayer }) {
  const me = state.me!;
  const recent = me.privatePings.slice(-5);
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-300">
        Private feed
      </div>
      <div className="space-y-1 text-[11px] text-amber-100">
        {recent.length === 0 ? (
          <div className="italic text-amber-300/60">No thief moves yet this game.</div>
        ) : (
          recent.map((p, i) => (
            <div key={i}>
              <span className="opacity-60">R{p.round}:</span> {p.text}
            </div>
          ))
        )}
      </div>
      {me.partnerName && (
        <div className="text-[10px] text-amber-300/80">
          Other crooked cop: <span className="font-bold">{me.partnerName}</span>
        </div>
      )}
    </div>
  );
}

// --- mini-graph (used in both move panels) ---

function MiniGraph({
  state,
  highlight,
  you,
  partner,
  pieces,
  hover,
  onTap,
  onHover,
}: {
  state: CrookedCopsStateForPlayer;
  highlight: Set<NodeId>;
  you: NodeId | null;
  partner: NodeId | null;
  pieces: Set<NodeId>;
  hover?: NodeId | null;
  onTap: (n: NodeId) => void;
  onHover?: (n: NodeId | null) => void;
}) {
  const layout = state.graph.layout;
  const cops = state.players.filter((p) => p.publicRole === 'cop' && p.node);
  const thieves = state.players.filter((p) => p.publicRole === 'thief' && p.node);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full aspect-square bg-zinc-950 rounded-xl border border-white/5"
    >
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
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
          />
        );
      })}
      {state.graph.nodes.map((id) => {
        const pos = layout[id];
        if (!pos) return null;
        const isYou = id === you;
        const isPartner = id === partner;
        const isHL = highlight.has(id);
        const hasPiece = pieces.has(id);
        const isHover = hover === id;
        return (
          <g
            key={id}
            transform={`translate(${pos.x * VIEW_W}, ${pos.y * VIEW_H})`}
            onClick={() => onTap(id)}
            onMouseEnter={() => onHover?.(id)}
            onMouseLeave={() => onHover?.(null)}
            style={{ cursor: isHL ? 'pointer' : 'default' }}
          >
            <circle
              r={isHL ? 9 : 5}
              fill={
                isYou
                  ? '#ffffff'
                  : isPartner
                    ? '#94a3b8'
                    : isHL
                      ? 'rgba(255,255,255,0.4)'
                      : hasPiece
                        ? '#fbbf24'
                        : 'rgba(255,255,255,0.2)'
              }
              stroke={isHover ? '#fff' : 'rgba(255,255,255,0.3)'}
              strokeWidth={isHover ? 2 : 1}
            />
            {hasPiece && !isYou && !isPartner && (
              <circle r={3} fill="#fbbf24" />
            )}
          </g>
        );
      })}
      {/* Cop overlays */}
      {cops.map((c, idx) => {
        const pos = layout[c.node as NodeId];
        if (!pos) return null;
        const team = (c.team ?? 'red') as TeamColor;
        return (
          <circle
            key={`c-${c.id}`}
            cx={pos.x * VIEW_W + ((idx % 3) - 1) * 4}
            cy={pos.y * VIEW_H + 10}
            r={3}
            fill={TEAM_COLORS[team]}
          />
        );
      })}
      {/* Thief overlays — visible only when state includes their node (server-filtered) */}
      {thieves.map((t) => {
        const pos = layout[t.node as NodeId];
        if (!pos) return null;
        return (
          <g key={`t-${t.id}`} transform={`translate(${pos.x * VIEW_W}, ${pos.y * VIEW_H})`}>
            <circle r={7} fill="white" stroke="black" strokeWidth={1.5} />
            <text x={0} y={3} fontSize={7} textAnchor="middle" fontWeight="bold">
              T
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// BFS within N edges, client-side mirror of graph.ts helper.
function nodesWithin(
  adjacency: Record<NodeId, NodeId[]>,
  from: NodeId,
  maxSteps: number,
): NodeId[] {
  const visited = new Set<NodeId>([from]);
  let frontier: NodeId[] = [from];
  for (let i = 0; i < maxSteps; i += 1) {
    const next: NodeId[] = [];
    for (const cur of frontier) {
      for (const n of adjacency[cur] ?? []) {
        if (visited.has(n)) continue;
        visited.add(n);
        next.push(n);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return Array.from(visited);
}

