import { useEffect, useMemo, useState } from 'react';
import { Check, Coins, Eye, Sparkles, Trophy } from 'lucide-react';
import { PhaseTimer } from '../../primitives/PhaseTimer';
import { socket } from '../../lib/socket';
import type {
  ArrowOffer,
  BoardLayout,
  TreasureIslandStateForPlayer,
} from './types';

// helper: derive arrow length from id encoded in `arr-r{round}-{n}` … but the
// server doesn't encode length in id. Instead we look up arrows in the
// auctionOffers (visible during the round won) OR fall back to length 2.
// We carry length via lastAuctionResults wrappers… simplest: phone keeps a
// local cache of {id: length} populated from auction offers as they appear.

export function TreasureIslandPhone({ state }: { state: TreasureIslandStateForPlayer }) {
  const me = state.me;
  // local arrow length cache, keyed by arrow id. populated from auction
  // offers each time we see them.
  const [arrowLengths, setArrowLengths] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!state.auctionOffers) return;
    setArrowLengths((prev) => {
      let next = prev;
      let changed = false;
      for (const o of state.auctionOffers ?? []) {
        if (next[o.id] === undefined) {
          if (!changed) {
            next = { ...prev };
            changed = true;
          }
          next[o.id] = o.length;
        }
      }
      return changed ? next : prev;
    });
  }, [state.auctionOffers]);

  if (!me) {
    return (
      <div className="min-h-screen bg-black p-6 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-zinc-500 text-xs uppercase font-bold tracking-widest">Spectating</div>
        </div>
      </div>
    );
  }

  const myPub = state.players.find((p) => p.id === me.playerId);

  return (
    <div className="min-h-screen bg-black text-white p-5 flex flex-col gap-5 selection:bg-white selection:text-black">
      {/* chrome */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">You</div>
          <div className="text-lg font-black uppercase tracking-tight">{myPub?.name ?? 'Player'}</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">VP</div>
          <div className="text-lg font-black tracking-tighter">
            {myPub?.vp ?? 0}{' '}
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
              · {myPub?.pieces ?? 0} pcs
            </span>
          </div>
        </div>
      </div>

      <PhaseTimer
        deadline={state.phaseDeadline}
        label={`Round ${state.round} / ${state.totalRounds}`}
      />

      <div className="flex items-center justify-between bg-zinc-900/40 border border-white/5 rounded-xl p-3 text-[10px] uppercase tracking-widest text-zinc-400">
        <span className="flex items-center gap-2">
          <Coins size={12} /> {myPub?.chipCount ?? 0} chips
        </span>
        <span>{me.private.arrowIds.length} arrows</span>
        <span>{myPub?.pieces ?? 0} pieces</span>
      </div>

      <div className="flex-1 flex flex-col gap-5">
        {state.phase === 'auction' && state.auctionOffers && (
          <AuctionPanel
            offers={state.auctionOffers}
            myChips={myPub?.chipCount ?? 0}
            alreadySubmitted={!!me.private.currentBid}
          />
        )}

        {state.phase === 'exploration' && (
          <ExplorationPanel
            state={state}
            arrowLengths={arrowLengths}
            myArrowIds={me.private.arrowIds}
          />
        )}

        {(state.phase === 'auction-reveal' || state.phase === 'exploration-reveal') && (
          <div className="text-center space-y-3 mt-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
              Reveal
            </div>
            <div className="text-sm text-zinc-300">Check the main screen.</div>
          </div>
        )}

        {state.phase === 'finished' && (
          <div className="text-center space-y-4 mt-8">
            <Trophy size={48} className="mx-auto text-white" />
            <div className="text-2xl font-black uppercase tracking-tighter">Game Over</div>
            <div className="text-zinc-400 text-xs uppercase tracking-widest">
              Final pieces: {myPub?.pieces ?? 0}
            </div>
          </div>
        )}

        {state.treasureFinderId === me.playerId && state.treasureSteals === null && (
          <StealPanel state={state} />
        )}

        {/* hints */}
        {me.private.hints.length > 0 && (
          <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-3 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500 flex items-center gap-2">
              <Sparkles size={12} /> Hints
            </div>
            <ul className="text-xs text-zinc-300 space-y-1 leading-relaxed">
              {me.private.hints.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>
        )}

        {/* peek affordance during exploration / auction */}
        {(state.phase === 'exploration' || state.phase === 'auction') && (
          <PeekPanel state={state} myPieces={myPub?.pieces ?? 0} />
        )}
      </div>
    </div>
  );
}

// --- subcomponents -----------------------------------------------------

function AuctionPanel({
  offers,
  myChips,
  alreadySubmitted,
}: {
  offers: ArrowOffer[];
  myChips: number;
  alreadySubmitted: boolean;
}) {
  const [allocs, setAllocs] = useState<Record<string, number>>({});

  const total = useMemo(
    () => Object.values(allocs).reduce((s, v) => s + v, 0),
    [allocs],
  );
  const remaining = myChips - total;

  const set = (id: string, val: number) => {
    setAllocs((prev) => {
      const next = { ...prev };
      const v = Math.max(0, Math.floor(val));
      if (v <= 0) delete next[id];
      else next[id] = v;
      return next;
    });
  };

  const submit = () => {
    const allocations = Object.entries(allocs)
      .filter(([, v]) => v >= 1)
      .map(([arrowId, chips]) => ({ arrowId, chips }));
    socket.emit('game-action', {
      type: 'treasure/bid',
      payload: { allocations },
    });
  };

  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">Auction</div>
        <div className="text-sm text-zinc-300">
          Allocate chips. Min 1 chip per arrow. {remaining} chips left.
        </div>
      </div>
      <div className="space-y-2">
        {offers.map((o) => (
          <div
            key={o.id}
            className="flex items-center justify-between bg-zinc-900/50 border border-white/5 rounded-lg p-3"
          >
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-widest text-white">
                Arrow · length {o.length}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-zinc-500">{o.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={alreadySubmitted}
                onClick={() => set(o.id, (allocs[o.id] ?? 0) - 1)}
                className="w-8 h-8 rounded-lg bg-zinc-800 text-white disabled:opacity-30"
              >
                −
              </button>
              <span className="w-8 text-center font-mono text-sm">{allocs[o.id] ?? 0}</span>
              <button
                disabled={alreadySubmitted || remaining <= 0}
                onClick={() => set(o.id, (allocs[o.id] ?? 0) + 1)}
                className="w-8 h-8 rounded-lg bg-zinc-800 text-white disabled:opacity-30"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        disabled={alreadySubmitted || total > myChips}
        onClick={submit}
        className={`mt-3 w-full py-4 rounded-xl font-bold uppercase tracking-widest text-xs ${
          alreadySubmitted || total > myChips
            ? 'bg-zinc-900 text-zinc-600 border border-white/5'
            : 'bg-white text-black hover:bg-zinc-200'
        }`}
      >
        {alreadySubmitted ? (
          <span className="flex items-center justify-center gap-2">
            <Check size={14} /> Bid locked
          </span>
        ) : (
          'Submit bid'
        )}
      </button>
    </div>
  );
}

function ExplorationPanel({
  state,
  arrowLengths,
  myArrowIds,
}: {
  state: TreasureIslandStateForPlayer;
  arrowLengths: Record<string, number>;
  myArrowIds: string[];
}) {
  const board = state.board;
  const [selectedArrow, setSelectedArrow] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState<Record<string, { from: number; to: number }>>({});
  const [pickFrom, setPickFrom] = useState<number | null>(null);
  const [diagonalUnlockHinted] = useState(state.hiddenRuleDiscovered);

  const usedArrows = new Set(Object.keys(endpoints));

  const onClickDot = (idxIn: number) => {
    if (!selectedArrow) return;
    if (pickFrom === null) {
      setPickFrom(idxIn);
      return;
    }
    if (pickFrom === idxIn) {
      setPickFrom(null);
      return;
    }
    setEndpoints((prev) => ({
      ...prev,
      [selectedArrow]: { from: pickFrom, to: idxIn },
    }));
    setPickFrom(null);
    setSelectedArrow(null);
  };

  const submit = () => {
    const arrows = Object.entries(endpoints).map(([arrowId, ep]) => ({
      arrowId,
      fromIdx: ep.from,
      toIdx: ep.to,
    }));
    socket.emit('game-action', {
      type: 'treasure/place-path',
      payload: { arrows },
    });
  };

  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Exploration
        </div>
        <div className="text-sm text-zinc-300">
          Pick an arrow, then tap two red dots (start, then end).
        </div>
        {state.hiddenRuleDiscovered && (
          <div className="text-[10px] uppercase tracking-widest text-amber-400 mt-1">
            Diagonal & 3D placements unlocked
          </div>
        )}
        {!diagonalUnlockHinted && !state.hiddenRuleDiscovered && (
          <div className="text-[10px] uppercase tracking-widest text-zinc-600 mt-1">
            Try unusual paths — some boxes might be reachable in surprising ways.
          </div>
        )}
      </div>

      {/* arrow inventory */}
      <div className="flex flex-wrap gap-2">
        {myArrowIds.map((id) => {
          const len = arrowLengths[id];
          const isPlaced = usedArrows.has(id);
          const isSel = selectedArrow === id;
          return (
            <button
              key={id}
              onClick={() => {
                if (isPlaced) {
                  // un-place if tapped again
                  setEndpoints((prev) => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                  });
                  return;
                }
                setSelectedArrow(isSel ? null : id);
                setPickFrom(null);
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border ${
                isPlaced
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-200'
                  : isSel
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-900 text-white border-white/10'
              }`}
            >
              ·{len ?? '?'}
            </button>
          );
        })}
        {myArrowIds.length === 0 && (
          <div className="text-[10px] uppercase tracking-widest text-zinc-600">
            No arrows owned. Bid harder next auction.
          </div>
        )}
      </div>

      {/* mini board */}
      <MiniBoard
        board={board}
        endpoints={endpoints}
        pickFrom={pickFrom}
        selectedArrow={selectedArrow}
        onClickDot={onClickDot}
      />

      <button
        onClick={submit}
        className="mt-2 w-full py-4 rounded-xl bg-white text-black font-bold uppercase tracking-widest text-xs hover:bg-zinc-200"
      >
        Submit path
      </button>
    </div>
  );
}

function MiniBoard({
  board,
  endpoints,
  pickFrom,
  selectedArrow,
  onClickDot,
}: {
  board: BoardLayout;
  endpoints: Record<string, { from: number; to: number }>;
  pickFrom: number | null;
  selectedArrow: string | null;
  onClickDot: (idx: number) => void;
}) {
  const cs = 30;
  return (
    <div
      className="relative bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden mx-auto"
      style={{ width: cs * board.size, height: cs * board.size }}
    >
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
          const isFromActive = pickFrom === i;
          return (
            <div
              key={i}
              className={`relative flex items-center justify-center ${
                isLand ? 'bg-emerald-900/30' : 'bg-sky-900/40'
              }`}
              style={{ borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
              {dot && (
                <button
                  disabled={!selectedArrow}
                  onClick={() => onClickDot(i)}
                  className={`w-3 h-3 rounded-full ${
                    isFromActive ? 'bg-yellow-400 scale-150' : 'bg-red-500'
                  } shadow-[0_0_6px_2px_rgba(239,68,68,0.6)]`}
                />
              )}
              {box && (
                <div className="absolute inset-1 rounded bg-amber-700/70 border border-amber-300 flex items-center justify-center">
                  <span className="text-[8px] font-black text-white">?</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <svg
        className="absolute inset-0 pointer-events-none"
        width={cs * board.size}
        height={cs * board.size}
      >
        {Object.entries(endpoints).map(([id, ep]) => {
          const a = { x: ep.from % board.size, y: Math.floor(ep.from / board.size) };
          const b = { x: ep.to % board.size, y: Math.floor(ep.to / board.size) };
          return (
            <line
              key={id}
              x1={a.x * cs + cs / 2}
              y1={a.y * cs + cs / 2}
              x2={b.x * cs + cs / 2}
              y2={b.y * cs + cs / 2}
              stroke="#f87171"
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </div>
  );
}

function PeekPanel({
  state,
  myPieces,
}: {
  state: TreasureIslandStateForPlayer;
  myPieces: number;
}) {
  const openedSet = new Set(state.openedBoxes.map((o) => o.boxId));
  const unopened = state.board.boxes.filter((b) => !openedSet.has(b.id));
  if (unopened.length === 0) return null;
  return (
    <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-3 space-y-2">
      <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500 flex items-center gap-2">
        <Eye size={12} /> Peek (1 piece)
      </div>
      <div className="grid grid-cols-3 gap-2">
        {unopened.map((b) => (
          <button
            key={b.id}
            disabled={myPieces < 1}
            onClick={() =>
              socket.emit('game-action', {
                type: 'treasure/peek',
                payload: { boxId: b.id },
              })
            }
            className="px-2 py-2 rounded-lg bg-zinc-800 text-[10px] uppercase tracking-widest text-white disabled:opacity-30"
          >
            {b.id}
          </button>
        ))}
      </div>
    </div>
  );
}

function StealPanel({ state }: { state: TreasureIslandStateForPlayer }) {
  const me = state.me!;
  const others = state.players.filter((p) => p.id !== me.playerId);
  const [allocs, setAllocs] = useState<Record<string, number>>({});
  const total = useMemo(
    () => Object.values(allocs).reduce((s, v) => s + v, 0),
    [allocs],
  );

  const set = (id: string, v: number) => {
    setAllocs((prev) => {
      const next = { ...prev };
      const x = Math.max(0, Math.floor(v));
      if (x <= 0) delete next[id];
      else next[id] = x;
      return next;
    });
  };

  const submit = () => {
    const allocations = Object.entries(allocs).map(([fromPlayerId, amount]) => ({
      fromPlayerId,
      amount,
    }));
    socket.emit('game-action', {
      type: 'treasure/steal',
      payload: { allocations },
    });
  };

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-yellow-300">
        Treasure! Steal 4 pieces total.
      </div>
      <div className="space-y-2">
        {others.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between bg-zinc-900/50 border border-white/5 rounded-lg p-2"
          >
            <span className="text-xs text-white">{p.name}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => set(p.id, (allocs[p.id] ?? 0) - 1)}
                className="w-7 h-7 rounded bg-zinc-800 text-white"
              >
                −
              </button>
              <span className="w-6 text-center font-mono text-sm">{allocs[p.id] ?? 0}</span>
              <button
                onClick={() => set(p.id, (allocs[p.id] ?? 0) + 1)}
                className="w-7 h-7 rounded bg-zinc-800 text-white"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        disabled={total !== 4}
        onClick={submit}
        className={`w-full py-3 rounded-xl font-bold uppercase tracking-widest text-xs ${
          total === 4 ? 'bg-yellow-400 text-black' : 'bg-zinc-900 text-zinc-600 border border-white/5'
        }`}
      >
        {total === 4 ? 'Confirm steal' : `${total}/4 allocated`}
      </button>
    </div>
  );
}
