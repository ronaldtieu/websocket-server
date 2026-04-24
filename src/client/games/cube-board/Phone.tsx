import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, RotateCcw, Send } from 'lucide-react';
import { socket } from '../../lib/socket';
import { COLOR_HEX, colorOf } from './types';
import type {
  CubeBoardStateForPlayer,
  CubeColor,
  CubeFace,
  CubeOrientation,
  Direction,
} from './types';

const DIR_LABEL: Record<Direction, string> = {
  N: 'North',
  E: 'East',
  S: 'South',
  W: 'West',
};

// Mirror of server-side tumble math so the phone can show a live preview of
// the top face after each candidate move. Must stay in sync with cube.ts.
function tumble(o: CubeOrientation, dir: Direction): CubeOrientation {
  switch (dir) {
    case 'N':
      return { top: o.north, north: o.bottom, bottom: o.south, south: o.top, east: o.east, west: o.west };
    case 'S':
      return { top: o.south, south: o.bottom, bottom: o.north, north: o.top, east: o.east, west: o.west };
    case 'E':
      return { top: o.west, west: o.bottom, bottom: o.east, east: o.top, north: o.north, south: o.south };
    case 'W':
      return { top: o.east, east: o.bottom, bottom: o.west, west: o.top, north: o.north, south: o.south };
  }
}

export function CubeBoardPhone({ state }: { state: CubeBoardStateForPlayer }) {
  const me = state.me;
  const [notes, setNotes] = useState('');
  const [hoveredDir, setHoveredDir] = useState<Direction | null>(null);

  useEffect(() => {
    if (me?.private.notes !== undefined && notes === '') setNotes(me.private.notes);
    // intentionally only seed on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.playerId]);

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
  const isMyTurn = state.turnOrder[state.turnIndex] === me.playerId;
  const orientation = me.private.orientation;
  const top = orientation.top;

  const submitMove = (dir: Direction) => {
    socket.emit('game-action', { type: 'unknown/move', payload: { direction: dir } });
  };
  const submitReorient = (color: CubeColor) => {
    socket.emit('game-action', { type: 'unknown/reorient', payload: { topColor: color } });
  };
  const submitNotes = () => {
    socket.emit('game-action', { type: 'unknown/notes', payload: { text: notes } });
  };
  const submitMoveOther = (targetPlayerId: string, direction: Direction) => {
    socket.emit('game-action', {
      type: 'unknown/move-other',
      payload: { targetPlayerId, direction },
    });
  };

  const previewTop = (d: Direction): CubeFace => tumble(orientation, d).top;

  return (
    <div className="min-h-screen bg-black text-white p-5 flex flex-col gap-5 selection:bg-white selection:text-black">
      {/* chrome */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">You</div>
          <div className="text-lg font-black uppercase tracking-tight">
            {myPub?.name ?? 'Player'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">
            Banishments
          </div>
          <div className="flex items-center gap-1 mt-1 justify-end">
            {Array.from({ length: 3 }).map((_, i) => (
              <span
                key={i}
                className={`w-3 h-3 rounded-full ${
                  i < (myPub?.banishments ?? 0) ? 'bg-red-400' : 'bg-zinc-800'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* turn status */}
      <div className="text-center py-2 rounded-xl bg-zinc-900/40 border border-white/5">
        <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500">
          {state.phase === 'practice' ? `Practice · Round ${state.round}` : `Round ${state.round}`}
        </div>
        <div className="text-sm font-bold uppercase tracking-widest mt-1">
          {isMyTurn ? (myPub?.isFinished ? 'You reached the goal' : 'YOUR TURN') : 'Waiting…'}
        </div>
      </div>

      {/* current cube face */}
      <div className="flex items-center justify-center gap-6">
        <div className="text-center">
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500 mb-2">
            Top
          </div>
          <div
            className="w-24 h-24 rounded-2xl border-4 border-white/20 shadow-2xl flex items-center justify-center text-[9px] font-bold uppercase tracking-widest"
            style={{
              background: colorOf(top),
              color: top === 'white' || top === 'yellow' ? '#000' : '#fff',
            }}
          >
            {top}
          </div>
        </div>
        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-relaxed max-w-[120px]">
          The colors on the other 5 sides are private to you.
        </div>
      </div>

      {/* must-reorient or move picker */}
      {isMyTurn && me.private.mustReorient && state.hiddenRulesActive ? (
        <ReorientPicker orientation={orientation} onPick={submitReorient} />
      ) : isMyTurn && !myPub?.isFinished ? (
        <>
          <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500 text-center">
            Tip the cube
          </div>
          <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
            <div />
            <DirectionButton
              dir="N"
              icon={<ArrowUp size={28} />}
              previewTop={previewTop('N')}
              onClick={() => submitMove('N')}
              onHover={setHoveredDir}
            />
            <div />
            <DirectionButton
              dir="W"
              icon={<ArrowLeft size={28} />}
              previewTop={previewTop('W')}
              onClick={() => submitMove('W')}
              onHover={setHoveredDir}
            />
            <div className="aspect-square rounded-xl bg-zinc-900/40 border border-white/5 flex items-center justify-center text-[8px] text-zinc-500 font-bold uppercase tracking-widest">
              tap
            </div>
            <DirectionButton
              dir="E"
              icon={<ArrowRight size={28} />}
              previewTop={previewTop('E')}
              onClick={() => submitMove('E')}
              onHover={setHoveredDir}
            />
            <div />
            <DirectionButton
              dir="S"
              icon={<ArrowDown size={28} />}
              previewTop={previewTop('S')}
              onClick={() => submitMove('S')}
              onHover={setHoveredDir}
            />
            <div />
          </div>
          {hoveredDir && (
            <div className="text-center text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
              Tip {DIR_LABEL[hoveredDir]} → top becomes{' '}
              <span style={{ color: COLOR_HEX[previewTop(hoveredDir) as CubeColor] ?? '#fff' }}>
                {previewTop(hoveredDir)}
              </span>
            </div>
          )}
        </>
      ) : null}

      {/* move-another option */}
      {isMyTurn && me.private.moveAnotherTargets.length > 0 && state.hiddenRulesActive && (
        <div className="space-y-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
            Move-another available
          </div>
          <div className="space-y-2">
            {me.private.moveAnotherTargets.map((tid) => {
              const target = state.players.find((p) => p.id === tid);
              if (!target) return null;
              return (
                <div
                  key={tid}
                  className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/40 border border-white/10"
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest truncate">
                    {target.name}
                  </span>
                  <div className="flex gap-1">
                    {(['N', 'E', 'S', 'W'] as Direction[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => submitMoveOther(tid, d)}
                        className="w-7 h-7 rounded bg-white/5 border border-white/10 text-[9px] font-bold uppercase hover:bg-white/15"
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* notes */}
      <div className="mt-auto space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500">
          Private notes
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
          onBlur={submitNotes}
          placeholder="Hypothesize the rules…"
          className="w-full h-24 bg-zinc-900 border border-white/10 rounded-xl p-3 text-[11px] text-zinc-200 focus:border-white outline-none resize-none"
        />
        <button
          onClick={submitNotes}
          className="w-full py-2 rounded-lg bg-white/5 border border-white/10 text-[9px] font-bold uppercase tracking-widest text-zinc-300 hover:bg-white/10 hover:text-white flex items-center justify-center gap-2"
        >
          <Send size={12} /> Save notes
        </button>
      </div>
    </div>
  );
}

function DirectionButton({
  dir,
  icon,
  previewTop,
  onClick,
  onHover,
}: {
  dir: Direction;
  icon: React.ReactNode;
  previewTop: CubeFace;
  onClick: () => void;
  onHover: (d: Direction | null) => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onMouseEnter={() => onHover(dir)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
      className="aspect-square rounded-xl border-2 border-white/10 bg-zinc-900 flex flex-col items-center justify-center gap-1 hover:border-white transition-all"
    >
      {icon}
      <div
        className="w-4 h-4 rounded-sm border border-white/20"
        style={{ background: colorOf(previewTop) }}
      />
    </motion.button>
  );
}

function ReorientPicker({
  orientation,
  onPick,
}: {
  orientation: CubeOrientation;
  onPick: (c: CubeColor) => void;
}) {
  const slots: CubeFace[] = [
    orientation.top,
    orientation.bottom,
    orientation.north,
    orientation.south,
    orientation.east,
    orientation.west,
  ];
  const colors = Array.from(new Set(slots.filter((s): s is CubeColor => s !== 'face')));
  return (
    <div className="space-y-3">
      <div className="text-center text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-400">
        <RotateCcw size={14} className="inline mr-2" />
        Re-orient — pick a new top color
      </div>
      <div className="grid grid-cols-3 gap-2">
        {colors.map((c) => (
          <button
            key={c}
            onClick={() => onPick(c)}
            className="aspect-square rounded-xl border-2 border-white/10 flex items-center justify-center text-[9px] font-bold uppercase tracking-widest"
            style={{
              background: COLOR_HEX[c],
              color: c === 'white' || c === 'yellow' ? '#000' : '#fff',
            }}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
