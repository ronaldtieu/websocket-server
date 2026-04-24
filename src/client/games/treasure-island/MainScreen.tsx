import { motion } from 'motion/react';
import { Compass, Trophy } from 'lucide-react';
import { PhaseTimer } from '../../primitives/PhaseTimer';
import { socket } from '../../lib/socket';
import type {
  BoardLayout,
  PlayerPath,
  TreasureIslandPublicState,
} from './types';

const PHASE_LABELS: Record<string, string> = {
  auction: 'Auction — sealed bids',
  'auction-reveal': 'Auction reveal',
  exploration: 'Exploration — placing paths',
  'exploration-reveal': 'Exploration reveal',
  finished: 'Game over',
};

// derive a few small geometry helpers for the board grid.
function cellSize(boardSize: number, viewport = 540): number {
  return Math.floor(viewport / boardSize);
}

function cellPos(idxIn: number, boardSize: number) {
  const x = idxIn % boardSize;
  const y = Math.floor(idxIn / boardSize);
  return { x, y };
}

function PathOverlay({
  paths,
  board,
  viewport,
}: {
  paths: PlayerPath[];
  board: BoardLayout;
  viewport: number;
}) {
  const cs = cellSize(board.size, viewport);
  const colors = ['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'];
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={cs * board.size}
      height={cs * board.size}
    >
      {paths.flatMap((path, pi) =>
        path.arrows.map((arr, ai) => {
          const a = cellPos(arr.fromIdx, board.size);
          const b = cellPos(arr.toIdx, board.size);
          const x1 = a.x * cs + cs / 2;
          const y1 = a.y * cs + cs / 2;
          const x2 = b.x * cs + cs / 2;
          const y2 = b.y * cs + cs / 2;
          const color = colors[pi % colors.length];
          return (
            <line
              key={`${pi}-${ai}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={3}
              strokeDasharray={arr.crossesFence ? '6 4' : undefined}
              strokeLinecap="round"
              opacity={0.85}
            />
          );
        }),
      )}
    </svg>
  );
}

function Board({
  state,
  viewport = 540,
}: {
  state: TreasureIslandPublicState;
  viewport?: number;
}) {
  const board = state.board;
  const cs = cellSize(board.size, viewport);
  const fenceKeys = new Set(state.board.fences.map((f) => `${f.a}-${f.b}`));
  const openedSet = new Set(state.openedBoxes.map((o) => o.boxId));

  return (
    <div
      className="relative bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden"
      style={{ width: cs * board.size, height: cs * board.size }}
    >
      {/* terrain grid */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${board.size}, ${cs}px)`,
          gridTemplateRows: `repeat(${board.size}, ${cs}px)`,
        }}
      >
        {board.cells.map((c, i) => {
          const isLand = c.terrain === 'land';
          const dot = board.redDots.find((d) => d.x === c.x && d.y === c.y);
          const box = board.boxes.find((b) => b.x === c.x && b.y === c.y);
          const isOpened = box && openedSet.has(box.id);
          // fence indicators on the right + bottom edges of this cell
          const eastIdx = c.x + 1 < board.size ? i + 1 : -1;
          const southIdx = c.y + 1 < board.size ? i + board.size : -1;
          const eastFence =
            eastIdx >= 0 &&
            (fenceKeys.has(`${i}-${eastIdx}`) || fenceKeys.has(`${eastIdx}-${i}`));
          const southFence =
            southIdx >= 0 &&
            (fenceKeys.has(`${i}-${southIdx}`) || fenceKeys.has(`${southIdx}-${i}`));
          return (
            <div
              key={i}
              className={`relative flex items-center justify-center ${
                isLand ? 'bg-emerald-900/30' : 'bg-sky-900/40'
              }`}
              style={{
                borderRight: eastFence ? '3px solid #fbbf24' : '1px solid rgba(255,255,255,0.04)',
                borderBottom: southFence ? '3px solid #fbbf24' : '1px solid rgba(255,255,255,0.04)',
              }}
            >
              {dot && (
                <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.6)]" />
              )}
              {box && (
                <div
                  className={`absolute inset-1 rounded ${
                    isOpened
                      ? box.isTreasure
                        ? 'bg-yellow-500 border border-yellow-200'
                        : 'bg-zinc-700 border border-zinc-500'
                      : 'bg-amber-700 border border-amber-300'
                  } flex items-center justify-center`}
                >
                  <span className="text-[8px] font-black uppercase tracking-tight text-white">
                    {isOpened ? (box.isTreasure ? 'T' : 'X') : '?'}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <PathOverlay paths={state.explorationPaths} board={board} viewport={viewport} />
    </div>
  );
}

export function TreasureIslandMainScreen({
  state,
  isHost,
  onReturnToLobby,
}: {
  state: TreasureIslandPublicState;
  isHost: boolean;
  onReturnToLobby: () => void;
}) {
  const isAuction = state.phase === 'auction' || state.phase === 'auction-reveal';
  const sortedScores = [...state.players].sort((a, b) => b.vp - a.vp);

  return (
    <div className="min-h-screen bg-black text-white px-12 pt-12 pb-28 flex flex-col gap-8 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-2xl">
            <Compass size={32} className="text-black" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">
              Treasure Island
            </h1>
            <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-[0.4em] mt-2">
              Round {state.round} / {state.totalRounds}
              {isAuction ? ' · Auction' : state.phase !== 'finished' ? ' · Exploration' : ''}
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

      <div className="flex flex-1 gap-8 relative z-10">
        {/* board */}
        <div className="flex flex-col items-center gap-4">
          <Board state={state} />
          <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
            {state.openedBoxes.length} / {state.board.boxes.length} boxes opened
          </div>
        </div>

        {/* side rail */}
        <div className="flex-1 flex flex-col gap-6 max-w-md">
          {/* rule log */}
          <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-5 space-y-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
              Rules
            </div>
            <ul className="space-y-2 text-xs text-zinc-300">
              {state.ruleLog.map((r, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="leading-relaxed"
                >
                  {r}
                </motion.li>
              ))}
            </ul>
          </div>

          {/* auction reveal */}
          {state.phase === 'auction-reveal' && state.lastAuctionResults && (
            <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-5 space-y-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
                Auction results
              </div>
              <div className="space-y-1 text-xs">
                {state.lastAuctionResults.map((r) => {
                  const winner = state.players.find((p) => p.id === r.winnerId);
                  const offer = state.auctionOffers?.find((o) => o.id === r.arrowId);
                  return (
                    <div
                      key={r.arrowId}
                      className="flex items-center justify-between gap-2 text-zinc-300"
                    >
                      <span>arrow ·{offer?.length ?? '?'}</span>
                      <span className="font-mono text-zinc-500">
                        {winner ? `${winner.name} · ${r.winningBid} chip(s)` : 'no bid'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* treasure callout */}
          {state.treasureFinderId && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-5 space-y-2">
              <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-yellow-300">
                Treasure found!
              </div>
              <div className="text-sm text-yellow-100">
                {state.players.find((p) => p.id === state.treasureFinderId)?.name ?? 'Someone'}{' '}
                opened the chest.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* scoreboard */}
      <div className="relative z-10 border-t border-white/5 pt-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-500 mb-4">
          Leaderboard
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {sortedScores.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-white/5 bg-zinc-900/40 p-4 flex flex-col gap-1"
            >
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 truncate">
                {p.name}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tracking-tighter">{p.vp}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">
                  vp
                </span>
              </div>
              <div className="flex items-center gap-2 text-[8px] font-bold uppercase tracking-widest text-zinc-500">
                <span>{p.pieces} pcs</span>
                <span>·</span>
                <span>{p.chipCount} chips</span>
                <span>·</span>
                <span>{p.arrowCount} arr</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {state.phase === 'finished' && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-30">
          <div className="text-center space-y-6">
            <Trophy size={64} className="mx-auto text-white" />
            <h2 className="text-5xl font-black uppercase tracking-tighter">Game Over</h2>
            <p className="text-zinc-500 text-xs uppercase font-bold tracking-[0.4em]">
              Final scoreboard above
            </p>
          </div>
        </div>
      )}

      {isHost && (
        <>
          <div className="absolute bottom-6 left-6 flex gap-2 z-20">
            <button
              onClick={() => socket.emit('host-skip-phase')}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-white/10 hover:text-white transition-all"
            >
              Skip Phase
            </button>
          </div>
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
