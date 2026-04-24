import { motion, AnimatePresence } from 'motion/react';

// simultaneous flip reveal for public cards. Server sends `playedCard` values;
// clients render them with a staggered flip. used for both peek and play phases.
export interface RevealPlayer {
  id: string;
  name: string;
  card: number | null;
  clashed?: boolean;
  winner?: boolean;
}

export function RevealOverlay({
  players,
  title,
  subtitle,
}: {
  players: RevealPlayer[];
  title: string;
  subtitle?: string;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="w-full"
      >
        <div className="space-y-2 mb-6 text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-500">{title}</div>
          {subtitle && <div className="text-xs text-zinc-400">{subtitle}</div>}
        </div>
        <div className="flex flex-wrap items-start justify-center gap-4">
          {players.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ rotateY: 180, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              transition={{ delay: i * 0.06, duration: 0.4, type: 'spring', stiffness: 200 }}
              className="flex flex-col items-center gap-2"
            >
              <div
                className={
                  'relative w-20 h-28 rounded-xl border flex items-center justify-center font-black text-5xl ' +
                  (p.winner
                    ? 'bg-white text-black border-white shadow-2xl shadow-white/30'
                    : p.clashed
                      ? 'bg-zinc-900 text-zinc-600 border-red-500/40 line-through'
                      : 'bg-zinc-900 text-white border-white/10')
                }
              >
                {p.card ?? '—'}
                {p.winner && (
                  <span className="absolute -top-2 -right-2 bg-white text-black px-2 py-0.5 rounded-full text-[8px] font-black tracking-widest">
                    WIN
                  </span>
                )}
              </div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 max-w-20 truncate">
                {p.name}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
