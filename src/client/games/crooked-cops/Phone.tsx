import { useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import { PhaseTimer } from '../../primitives/PhaseTimer';
import { socket } from '../../lib/socket';
import {
  PixelBadge,
  PixelButton,
  PixelPanel,
  PIXEL_GRID_STYLE,
  type PixelTone,
} from '../../primitives/PixelHUD';
import type { CrookedCopsStateForPlayer, NodeId, TeamColor } from './types';

const TEAM_COLORS: Record<TeamColor, string> = {
  red: '#ef4444',
  blue: '#60a5fa',
  green: '#34d399',
};

const VIEW_W = 360;
const VIEW_H = 360;

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    'thief-phase': 'Thief phase',
    'police-phase': 'Police phase',
    'arrest-resolution': 'Arrest resolution',
    checkpoint: 'Checkpoint',
    'whistleblower-vote': 'Whistleblower vote',
    finished: 'Finished',
  };
  return map[phase] ?? phase;
}

function phaseTone(phase: string): PixelTone {
  if (phase === 'thief-phase') return 'amber';
  if (phase === 'police-phase') return 'cyan';
  if (phase === 'arrest-resolution') return 'rose';
  if (phase === 'checkpoint') return 'emerald';
  if (phase === 'whistleblower-vote') return 'amber';
  if (phase === 'finished') return 'slate';
  return 'slate';
}

export function CrookedCopsPhone({ state }: { state: CrookedCopsStateForPlayer }) {
  const me = state.me;

  if (!me) {
    return (
      <div className="min-h-screen bg-[#040707] p-6 flex items-center justify-center font-mono">
        <PixelBadge tone="slate">Spectating</PixelBadge>
      </div>
    );
  }

  const myPlayer = state.players.find((player) => player.id === me.playerId);
  const teamColor = me.team ? TEAM_COLORS[me.team] : '#888';
  const roleText = me.role === 'thief' ? 'Thief' : `${me.team ?? 'cop'} cop`;
  const currentPhaseTone = phaseTone(state.phase);

  return (
    <div className="min-h-screen bg-[#040707] text-white p-4 flex flex-col gap-4 selection:bg-white selection:text-black relative overflow-hidden font-mono">
      <div className="absolute inset-0 opacity-30 pointer-events-none" style={PIXEL_GRID_STYLE} />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.08),transparent_30%),radial-gradient(circle_at_bottom,rgba(96,165,250,0.08),transparent_36%)]" />

      <div className="relative z-10 grid grid-cols-2 gap-3">
        <PixelPanel tone="emerald" title="Operator" subtitle={myPlayer?.name ?? 'Player'}>
          <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: teamColor }}>
            {roleText}
          </div>
        </PixelPanel>

        <PixelPanel tone={currentPhaseTone} title="Phase" subtitle={`Round ${state.round} / ${state.totalRounds}`}>
          <PhaseTimer deadline={state.phaseDeadline} label={phaseLabel(state.phase)} />
        </PixelPanel>
      </div>

      <div className="relative z-10 flex-1 flex flex-col gap-4">
        {state.phase === 'thief-phase' && me.role === 'thief' && <ThiefMovePanel state={state} />}
        {state.phase === 'thief-phase' && me.role !== 'thief' && (
          <CenterMessage tone="amber">Thieves are moving through the subway...</CenterMessage>
        )}

        {state.phase === 'police-phase' && (me.role === 'cop' || me.role === 'crooked-cop') && (
          <CopActionPanel state={state} />
        )}
        {state.phase === 'police-phase' && me.role === 'thief' && (
          <CenterMessage tone="cyan">Police are acting. Stay hidden.</CenterMessage>
        )}

        {state.phase === 'arrest-resolution' && (
          <CenterMessage tone="rose">
            {state.lastArrest ? 'Resolving arrest attempt...' : 'No arrest this turn.'}
          </CenterMessage>
        )}

        {state.phase === 'checkpoint' && (
          <CenterMessage tone="emerald">
            Checkpoint. Public pieces: <span className="font-black text-white">{state.publicPieceCount ?? '?'}</span>
          </CenterMessage>
        )}

        {state.phase === 'whistleblower-vote' &&
          (me.role === 'cop' || me.role === 'crooked-cop') && <VotePanel state={state} />}
        {state.phase === 'whistleblower-vote' && me.role === 'thief' && (
          <CenterMessage tone="amber">Cops are voting on the crooked one...</CenterMessage>
        )}

        {state.phase === 'finished' && (
          <CenterMessage tone="slate">
            <div className="text-center space-y-3">
              <Trophy size={48} className="mx-auto text-white" />
              <div className="text-2xl font-black uppercase tracking-[-0.1em] text-white">Game Over</div>
              {state.outcome && (
                <PixelBadge tone="amber">
                  {state.outcome.winner.replace('-', ' ')} / pieces {state.outcome.piecesCollected}/12
                </PixelBadge>
              )}
            </div>
          </CenterMessage>
        )}

        {me.lastInvestigation && (me.role === 'cop' || me.role === 'crooked-cop') && (
          <PixelPanel tone="cyan" title="Investigation Result" subtitle={me.lastInvestigation.node}>
            <div className="text-sm uppercase tracking-[0.16em] text-white">
              {me.lastInvestigation.thiefPassed ? 'Thief passed through.' : 'No trace found.'}
            </div>
          </PixelPanel>
        )}

        {(me.role === 'cop' || me.role === 'crooked-cop') && me.team && (
          <RadioPanel state={state} team={me.team} />
        )}

        {me.role === 'crooked-cop' && <CrookedTrackerPanel state={state} />}
      </div>
    </div>
  );
}

function CenterMessage({
  children,
  tone = 'slate',
}: {
  children: React.ReactNode;
  tone?: PixelTone;
}) {
  return (
    <PixelPanel tone={tone} title="Status" subtitle="Live feed" className="text-center">
      <div className="text-sm uppercase tracking-[0.16em] text-zinc-300 leading-relaxed">{children}</div>
    </PixelPanel>
  );
}

function ThiefMovePanel({ state }: { state: CrookedCopsStateForPlayer }) {
  const me = state.me!;
  const myPlayer = state.players.find((player) => player.id === me.playerId);
  const myNode = myPlayer?.node ?? null;
  const partner = state.players.find((player) => player.id === me.partnerId);

  const reachable = useMemo(() => {
    if (!myNode) return [];
    const within = nodesWithin(state.graph.adjacency, myNode, 2);
    const cops = new Set(
      state.players.filter((player) => player.publicRole === 'cop' && player.node).map((player) => player.node as NodeId),
    );
    return within.filter((node) => node !== myNode && !cops.has(node));
  }, [myNode, state.graph.adjacency, state.players]);

  const pieces = new Set(me.visiblePieceNodes ?? []);
  const [hover, setHover] = useState<NodeId | null>(null);

  return (
    <PixelPanel
      tone="amber"
      title="Move"
      subtitle="Up to 2 stations"
      meta={<PixelBadge tone="amber">{myNode ?? '?'}</PixelBadge>}
    >
      <div className="space-y-3">
        <MiniGraph
          state={state}
          highlight={new Set(reachable)}
          you={myNode}
          partner={partner?.node ?? null}
          pieces={pieces}
          hover={hover}
          onTap={(node) => {
            if (!reachable.includes(node)) return;
            socket.emit('game-action', {
              type: 'crooked-cops/move',
              payload: { toNode: node },
            });
          }}
          onHover={setHover}
        />
        <div className="text-[10px] uppercase tracking-[0.18em] text-amber-200 text-center">
          Tap a glowing station. Cops block your tile.
        </div>
        {partner && (
          <div className="text-center">
            <PixelBadge tone="slate">Partner {partner.name} @ {partner.node ?? '?'}</PixelBadge>
          </div>
        )}
      </div>
    </PixelPanel>
  );
}

function CopActionPanel({ state }: { state: CrookedCopsStateForPlayer }) {
  const me = state.me!;
  const myPlayer = state.players.find((player) => player.id === me.playerId);
  const myNode = myPlayer?.node ?? null;

  const reachable = useMemo(() => {
    if (!myNode) return [];
    const within = nodesWithin(state.graph.adjacency, myNode, 1);
    return within.filter((node) => node !== myNode);
  }, [myNode, state.graph.adjacency]);

  const arrestTargets = useMemo(() => {
    if (!myNode) return [];
    return [myNode, ...(state.graph.adjacency[myNode] ?? [])];
  }, [myNode, state.graph.adjacency]);

  return (
    <PixelPanel
      tone="cyan"
      title="Police Actions"
      subtitle="Move 1, then act"
      meta={<PixelBadge tone="cyan">{myNode ?? '?'}</PixelBadge>}
    >
      <div className="space-y-3">
        <MiniGraph
          state={state}
          highlight={new Set(reachable)}
          you={myNode}
          partner={null}
          pieces={new Set(me.visiblePieceNodes ?? [])}
          onTap={(node) => {
            if (!reachable.includes(node)) return;
            socket.emit('game-action', {
              type: 'crooked-cops/move',
              payload: { toNode: node },
            });
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          <PixelButton
            tone="cyan"
            className="w-full"
            disabled={!myNode}
            onClick={() =>
              socket.emit('game-action', {
                type: 'crooked-cops/investigate',
                payload: { node: myNode },
              })
            }
          >
            Investigate
          </PixelButton>
          <ArrestButton targets={arrestTargets} />
        </div>
        {myPlayer?.hasActedThisPhase && (
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 text-center">
            Acted this phase.
          </div>
        )}
      </div>
    </PixelPanel>
  );
}

function ArrestButton({ targets }: { targets: NodeId[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <PixelButton tone="rose" className="w-full" onClick={() => setOpen((value) => !value)}>
        Arrest
      </PixelButton>
      {open && (
        <div className="absolute left-0 right-0 mt-2 z-10 border-[3px] border-rose-300/30 bg-[#17080d] p-2 shadow-[6px_6px_0_rgba(0,0,0,0.35)]">
          <div className="grid grid-cols-3 gap-1">
            {targets.map((node) => (
              <PixelButton
                key={node}
                tone="rose"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setOpen(false);
                  socket.emit('game-action', {
                    type: 'crooked-cops/arrest',
                    payload: { targetNode: node },
                  });
                }}
              >
                {node}
              </PixelButton>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VotePanel({ state }: { state: CrookedCopsStateForPlayer }) {
  const me = state.me!;
  const teammates = state.players.filter((player) => player.team === me.team && player.id !== me.playerId);

  return (
    <PixelPanel tone="amber" title="Whistleblower Vote" subtitle="Pick the crooked cop">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {teammates.map((player) => (
            <PixelButton
              key={player.id}
              tone="amber"
              variant={me.hasVoted ? 'ghost' : 'solid'}
              className="w-full"
              disabled={me.hasVoted}
              onClick={() =>
                socket.emit('game-action', {
                  type: 'crooked-cops/vote',
                  payload: { suspectId: player.id },
                })
              }
            >
              {player.name}
            </PixelButton>
          ))}
        </div>
        {me.hasVoted && (
          <div className="text-center">
            <PixelBadge tone="amber">Vote locked</PixelBadge>
          </div>
        )}
      </div>
    </PixelPanel>
  );
}

function RadioPanel({ state, team }: { state: CrookedCopsStateForPlayer; team: TeamColor }) {
  const [text, setText] = useState('');

  return (
    <PixelPanel tone="slate" title={`Team Radio ${team}`} subtitle="Private chat">
      <div className="space-y-3">
        <div className="max-h-40 overflow-y-auto space-y-2 text-[12px]">
          {state.radio.length === 0 && (
            <div className="text-zinc-600 italic text-[11px] uppercase tracking-[0.16em]">
              No chatter yet.
            </div>
          )}
          {state.radio.map((message, index) => (
            <div key={index} className="border-[3px] border-white/8 bg-black/25 px-3 py-2 shadow-[4px_4px_0_rgba(0,0,0,0.25)]">
              <span className="font-black uppercase tracking-[0.16em] text-white">{message.fromName}:</span>{' '}
              <span className="text-zinc-300 uppercase tracking-[0.12em]">{message.text}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="say something..."
            className="flex-1 bg-[#0d0d12] border-[3px] border-white/10 rounded-[6px] px-3 py-2 text-xs uppercase tracking-[0.14em] outline-none text-white"
          />
          <PixelButton
            tone="cyan"
            size="sm"
            onClick={() => {
              const trimmed = text.trim();
              if (!trimmed) return;
              socket.emit('game-action', {
                type: 'crooked-cops/radio',
                payload: { team, text: trimmed },
              });
              setText('');
            }}
          >
            Send
          </PixelButton>
        </div>
      </div>
    </PixelPanel>
  );
}

function CrookedTrackerPanel({ state }: { state: CrookedCopsStateForPlayer }) {
  const me = state.me!;
  const recent = me.privatePings.slice(-5);

  return (
    <PixelPanel tone="rose" title="Private Feed" subtitle="Crooked intel">
      <div className="space-y-2">
        {recent.length === 0 ? (
          <div className="text-[11px] uppercase tracking-[0.16em] text-rose-200/60">
            No thief moves yet this game.
          </div>
        ) : (
          recent.map((ping, index) => (
            <div
              key={index}
              className="border-[3px] border-white/8 bg-black/25 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-rose-100 shadow-[4px_4px_0_rgba(0,0,0,0.25)]"
            >
              <span className="text-rose-200/60">R{ping.round}</span> / {ping.text}
            </div>
          ))
        )}
        {me.partnerName && (
          <div className="text-center">
            <PixelBadge tone="amber">Other crooked cop {me.partnerName}</PixelBadge>
          </div>
        )}
      </div>
    </PixelPanel>
  );
}

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
  onTap: (node: NodeId) => void;
  onHover?: (node: NodeId | null) => void;
}) {
  const layout = state.graph.layout;
  const cops = state.players.filter((player) => player.publicRole === 'cop' && player.node);
  const thieves = state.players.filter((player) => player.publicRole === 'thief' && player.node);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full aspect-square border-[3px] border-white/10 bg-[#07110f] shadow-[6px_6px_0_rgba(0,0,0,0.35)]"
    >
      <defs>
        <pattern id="mini-grid" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M 12 0 L 0 0 0 12" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={VIEW_W} height={VIEW_H} fill="#07110f" />
      <rect width={VIEW_W} height={VIEW_H} fill="url(#mini-grid)" />

      {state.graph.edges.map(([a, b]) => {
        const pa = layout[a];
        const pb = layout[b];
        if (!pa || !pb) return null;
        return (
          <g key={`${a}-${b}`}>
            <line
              x1={pa.x * VIEW_W}
              y1={pa.y * VIEW_H}
              x2={pb.x * VIEW_W}
              y2={pb.y * VIEW_H}
              stroke="#04110f"
              strokeWidth={6}
            />
            <line
              x1={pa.x * VIEW_W}
              y1={pa.y * VIEW_H}
              x2={pb.x * VIEW_W}
              y2={pb.y * VIEW_H}
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={2}
            />
          </g>
        );
      })}

      {state.graph.nodes.map((id) => {
        const pos = layout[id];
        if (!pos) return null;

        const isYou = id === you;
        const isPartner = id === partner;
        const isHighlight = highlight.has(id);
        const hasPiece = pieces.has(id);
        const isHover = hover === id;

        return (
          <g
            key={id}
            transform={`translate(${pos.x * VIEW_W}, ${pos.y * VIEW_H})`}
            onClick={() => onTap(id)}
            onMouseEnter={() => onHover?.(id)}
            onMouseLeave={() => onHover?.(null)}
            style={{ cursor: isHighlight ? 'pointer' : 'default' }}
          >
            <rect
              x={isHighlight ? -10 : -7}
              y={isHighlight ? -10 : -7}
              width={isHighlight ? 20 : 14}
              height={isHighlight ? 20 : 14}
              fill={
                isYou
                  ? '#ffffff'
                  : isPartner
                    ? '#94a3b8'
                    : isHighlight
                      ? '#ffd36e'
                      : hasPiece
                        ? '#fbbf24'
                        : '#d6f5e8'
              }
              stroke={isHover ? '#ffffff' : '#04110f'}
              strokeWidth={isHover ? 3 : 2}
            />
            <rect x={-3} y={-3} width={6} height={6} fill={isYou ? '#111111' : '#0a1613'} />
          </g>
        );
      })}

      {cops.map((cop, index) => {
        const pos = layout[cop.node as NodeId];
        if (!pos) return null;
        const team = (cop.team ?? 'red') as TeamColor;
        return (
          <rect
            key={`c-${cop.id}`}
            x={pos.x * VIEW_W - 4 + ((index % 3) - 1) * 6}
            y={pos.y * VIEW_H + 10}
            width={8}
            height={8}
            fill={TEAM_COLORS[team]}
            stroke="#04110f"
            strokeWidth={2}
          />
        );
      })}

      {thieves.map((thief) => {
        const pos = layout[thief.node as NodeId];
        if (!pos) return null;
        return (
          <g key={`t-${thief.id}`} transform={`translate(${pos.x * VIEW_W}, ${pos.y * VIEW_H - 16})`}>
            <rect x={-8} y={-8} width={16} height={16} fill="#ffffff" stroke="#111111" strokeWidth={2.5} />
            <text x={0} y={3} fontSize={8} textAnchor="middle" fontWeight="bold" fill="#111111">
              T
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function nodesWithin(
  adjacency: Record<NodeId, NodeId[]>,
  from: NodeId,
  maxSteps: number,
): NodeId[] {
  const visited = new Set<NodeId>([from]);
  let frontier: NodeId[] = [from];

  for (let i = 0; i < maxSteps; i += 1) {
    const next: NodeId[] = [];
    for (const current of frontier) {
      for (const node of adjacency[current] ?? []) {
        if (visited.has(node)) continue;
        visited.add(node);
        next.push(node);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }

  return Array.from(visited);
}
