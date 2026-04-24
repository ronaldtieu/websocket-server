import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export type CardState = 'available' | 'locked' | 'discarded' | 'selected';

export interface CardTile {
  value: number;
  state: CardState;
}

// hand display with optional tap-to-select. select up to `selectLimit` cards.
// calls onToggle when a card is tapped (only for 'available' cards).
export function CardHand({
  cards,
  selected,
  selectLimit,
  onToggle,
  disabled,
}: {
  cards: CardTile[];
  selected: number[];
  selectLimit: number;
  onToggle: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-4 gap-3 w-full">
      {cards.map((card) => {
        const isSelected = selected.includes(card.value);
        const tappable = !disabled && card.state === 'available';
        const locked = card.state === 'locked';
        const discarded = card.state === 'discarded';
        const atLimit = !isSelected && selected.length >= selectLimit;

        return (
          <motion.button
            key={card.value}
            type="button"
            whileHover={tappable && !atLimit ? { scale: 1.03, y: -2 } : {}}
            whileTap={tappable && !atLimit ? { scale: 0.97 } : {}}
            disabled={!tappable || (atLimit && !isSelected)}
            onClick={() => tappable && onToggle(card.value)}
            className={cn(
              'relative aspect-[3/4] rounded-xl border flex items-center justify-center font-black text-4xl transition-all',
              'border-white/10 bg-zinc-900',
              tappable && !atLimit && 'hover:border-white/30 cursor-pointer',
              isSelected && 'border-white bg-white text-black shadow-2xl shadow-white/20',
              locked && 'opacity-30 grayscale',
              discarded && 'opacity-10',
              atLimit && !isSelected && 'opacity-40 cursor-not-allowed',
            )}
          >
            <span className={cn('tracking-tighter', isSelected ? 'text-black' : 'text-white')}>
              {card.value}
            </span>
            {locked && (
              <span className="absolute bottom-1 left-0 right-0 text-center text-[7px] font-bold uppercase tracking-widest text-zinc-500">
                locked
              </span>
            )}
            {discarded && (
              <span className="absolute bottom-1 left-0 right-0 text-center text-[7px] font-bold uppercase tracking-widest text-zinc-700">
                used
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
