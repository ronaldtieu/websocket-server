import { motion, AnimatePresence } from 'motion/react';
import { PixelPlayingCard } from './PixelPlayingCard';

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
              {p.card != null ? (
                <div className="w-20 md:w-24 aspect-[3/4]">
                  <PixelPlayingCard
                    value={p.card}
                    tone={p.winner ? 'winner' : p.clashed ? 'clashed' : 'default'}
                    size="md"
                    badge={p.winner ? 'WIN' : p.clashed ? 'CLASH' : undefined}
                    className="h-full w-full"
                  />
                </div>
              ) : (
                <div className="w-20 md:w-24 aspect-[3/4] rounded-[4px] border-[3px] border-white/10 bg-zinc-950 flex items-center justify-center text-5xl text-zinc-700 shadow-[4px_4px_0_rgba(0,0,0,0.32)]">
                  —
                </div>
              )}
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
