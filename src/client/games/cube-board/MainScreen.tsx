import { motion, AnimatePresence } from 'motion/react';
import { Box, Trophy, AlertTriangle } from 'lucide-react';
import { socket } from '../../lib/socket';
import { COLOR_HEX, colorOf } from './types';
import type { CubeBoardPublicState, RuleId } from './types';

const RULE_TITLES: Record<RuleId, string> = {
  'banishment-1': 'BANISHMENT',
  'banishment-2': 'BANISHMENT × 3',
  'push-out': 'PUSH-OUT',
  'color-match': 'COLOR MATCH',
  'move-another': 'MOVE ANOTHER',
  'bonus-turn': 'BONUS TURN',
};

const RULE_DESCRIPTIONS: Record<RuleId, string> = {
  'banishment-1':
    'White on top OR landing on a white square sends you back to a gray start (and adds a banishment marker).',
  'banishment-2':
    'The first two players to collect 3 banishment markers each lose 3 Pieces.',
  'push-out':
    'A pushed cube does not chain effects — except banishment still applies.',
  'color-match':
    'If no adjacent square matches your top color, you must re-orient before moving.',
  'move-another':
    'If 2+ adjacent squares match your top color, you may move someone else’s cube. Yellow is wild.',
  'bonus-turn':
    'If three adjacent squares (including diagonals) share your top color, you get an extra turn.',
};

export function CubeBoardMainScreen({
  state,
  isHost,
  onReturnToLobby,
}: {
  state: CubeBoardPublicState;
  isHost: boolean;
  onReturnToLobby: () => void;
}) {
  const { board, players, turnOrder, turnIndex, phase } = state;
  const currentActorId = turnOrder[turnIndex] ?? null;
  const cubesByIdx = new Map<number, typeof players>();
  for (const p of players) {
    if (!p.isFinished) {
      const arr = cubesByIdx.get(p.squareIndex) ?? [];
      arr.push(p);
      cubesByIdx.set(p.squareIndex, arr);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white px-10 pt-10 pb-24 flex flex-col gap-6 relative overflow-hidden selection:bg-white selection:text-black">
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* header */}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-2xl">
            <Box size={32} className="text-black" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">
              UNKNOWN
            </h1>
            <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-[0.4em] mt-2">
              Round {state.round}
              {phase === 'practice' && ` · Practice (${state.practiceRoundsRemaining} left)`}
              {phase === 'real' && ' · Live'}
              {phase === 'finished' && ' · Finished'}
            </p>
          </div>
        </div>

        {/* turn lineup */}
        <div className="flex items-center gap-2 max-w-[60%] overflow-x-auto">
          {turnOrder.map((id, i) => {
            const p = players.find((q) => q.id === id);
            if (!p) return null;
            const isCurrent = id === currentActorId;
            return (
              <div
                key={id}
                className={`flex flex-col items-center gap-1 px-2 py-1 rounded-lg border ${
                  isCurrent
                    ? 'border-white bg-white/10 shadow-lg'
                    : 'border-white/10 bg-zinc-900/40'
                } ${p.isFinished ? 'opacity-50' : ''}`}
                style={{ minWidth: 60 }}
              >
                <div
                  className="w-6 h-6 rounded"
                  style={{ background: colorOf(p.topColor), opacity: p.topColor === 'face' ? 1 : 0.85 }}
                />
                <div className="text-[8px] font-bold uppercase tracking-widest text-zinc-300 truncate w-full text-center">
                  {p.name}
                </div>
                <div className="text-[7px] text-zinc-500 font-bold uppercase tracking-widest">
                  #{i + 1}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* main grid + sidebar */}
      <div className="flex-1 flex gap-8 relative z-10 overflow-hidden">
        {/* board */}
        <div className="flex-1 flex items-center justify-center">
          <div
            className="grid gap-1 p-4 rounded-2xl bg-zinc-900/30 border border-white/5"
            style={{
              gridTemplateColumns: `repeat(${board.width}, minmax(0, 1fr))`,
              width: 'min(70vh, 100%)',
              aspectRatio: '1 / 1',
            }}
          >
            {/* render grid bottom-up so y=0 is at the bottom visually */}
            {Array.from({ length: board.height })
              .map((_, row) => board.height - 1 - row)
              .map((y) =>
                Array.from({ length: board.width }).map((_, x) => {
                  const sq = board.squares[y * board.width + x];
                  const idx = board.squares.indexOf(sq);
                  const cubesHere = cubesByIdx.get(idx) ?? [];
                  let bg = '#27272a';
                  if (sq.kind === 'gray') bg = '#52525b';
                  else if (sq.kind === 'goal') bg = '#000';
                  else if (sq.color) bg = COLOR_HEX[sq.color];
                  return (
                    <div
                      key={`${x}-${y}`}
                      className="relative rounded-md flex items-center justify-center"
                      style={{
                        background: bg,
                        boxShadow:
                          sq.kind === 'goal' ? 'inset 0 0 0 2px white' : 'inset 0 0 0 1px rgba(0,0,0,0.2)',
                      }}
                    >
                      <span
                        className="absolute top-0.5 left-1 text-[8px] font-bold opacity-50"
                        style={{ color: sq.kind === 'goal' ? 'white' : 'black' }}
                      >
                        {sq.index}
                      </span>
                      {cubesHere.map((p, i) => (
                        <div
                          key={p.id}
                          className="absolute w-6 h-6 rounded border-2 border-black flex items-center justify-center text-[7px] font-black text-black uppercase shadow-lg"
                          style={{
                            background: colorOf(p.topColor),
                            transform: `translate(${i * 4 - cubesHere.length * 2}px, ${i * 4 - cubesHere.length * 2}px)`,
                          }}
                          title={p.name}
                        >
                          {p.name.slice(0, 2)}
                        </div>
                      ))}
                    </div>
                  );
                }),
              )}
          </div>
        </div>

        {/* sidebar */}
        <div className="w-72 flex flex-col gap-5 overflow-y-auto">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500 mb-2">
              Banishments
            </div>
            <div className="space-y-1">
              {players.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-lg ${
                    p.id === currentActorId ? 'bg-white/10 border border-white/30' : 'bg-zinc-900/40'
                  }`}
                >
                  <span className="text-zinc-300 truncate flex-1">{p.name}</span>
                  <span className="flex items-center gap-1 ml-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <span
                        key={i}
                        className={`w-2 h-2 rounded-full ${
                          i < p.banishments ? 'bg-red-400' : 'bg-zinc-700'
                        }`}
                      />
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.4em] text-zinc-500 mb-2">
              Discovered rules
            </div>
            {state.revealedRules.length === 0 ? (
              <div className="text-[10px] text-zinc-600 italic px-3 py-2">
                None yet — trigger something to find out.
              </div>
            ) : (
              <div className="space-y-2">
                {state.revealedRules.map((r) => (
                  <motion.div
                    key={r.ruleId}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-zinc-900/40 border border-white/10 rounded-lg p-3 space-y-1"
                  >
                    <div className="text-[9px] font-bold uppercase tracking-widest text-white">
                      {RULE_TITLES[r.ruleId]}
                    </div>
                    <div className="text-[10px] text-zinc-400 leading-relaxed">
                      {RULE_DESCRIPTIONS[r.ruleId]}
                    </div>
                    <div className="text-[8px] text-zinc-600 uppercase tracking-widest">
                      Discovered round {r.revealedAtRound}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* rule reveal banner */}
      <AnimatePresence>
        {state.pendingReveal && (
          <motion.div
            key={state.pendingReveal.ruleId + state.pendingReveal.revealedAtRound}
            initial={{ opacity: 0, y: -40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40 }}
            className="absolute top-32 left-1/2 -translate-x-1/2 z-30 bg-white text-black px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border-4 border-black"
          >
            <AlertTriangle size={20} />
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500">
                Rule revealed
              </div>
              <div className="text-xl font-black tracking-tighter uppercase">
                {RULE_TITLES[state.pendingReveal.ruleId]}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* finished overlay */}
      {phase === 'finished' && state.finalRanking && (
        <div className="absolute inset-0 bg-black/95 z-40 flex items-center justify-center">
          <div className="max-w-xl w-full space-y-6">
            <div className="text-center">
              <Trophy size={48} className="mx-auto text-white" />
              <h2 className="text-4xl font-black uppercase tracking-tighter mt-4">Final Standings</h2>
            </div>
            <div className="space-y-2">
              {state.finalRanking.map((r) => {
                const p = players.find((pp) => pp.id === r.playerId);
                if (!p) return null;
                return (
                  <div
                    key={r.playerId}
                    className="flex items-center justify-between px-4 py-3 bg-zinc-900/60 border border-white/10 rounded-xl"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-black tracking-tighter w-8">{r.rank}</span>
                      <span className="text-sm font-bold uppercase tracking-widest">{p.name}</span>
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      {p.isFinished ? 'GOAL' : `Square ${board.squares[r.squareIndex].index}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* host controls */}
      {isHost && (
        <>
          <div className="absolute bottom-6 left-6 flex gap-2 z-20">
            <button
              onClick={() => socket.emit('host-skip-phase')}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-white/10 hover:text-white transition-all"
            >
              Skip Turn
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
