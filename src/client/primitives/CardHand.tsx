import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { PixelPlayingCard, type PixelCardTone } from './PixelPlayingCard';

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
        const tone: PixelCardTone = isSelected
          ? 'selected'
          : locked
            ? 'locked'
            : discarded
              ? 'discarded'
              : 'default';

        return (
          <motion.button
            key={card.value}
            type="button"
            whileHover={tappable && !atLimit ? { scale: 1.03, y: -2 } : {}}
            whileTap={tappable && !atLimit ? { scale: 0.97 } : {}}
            disabled={!tappable || (atLimit && !isSelected)}
            onClick={() => tappable && onToggle(card.value)}
            className={cn(
              'relative aspect-[3/4] transition-all',
              tappable && !atLimit ? 'cursor-pointer' : 'cursor-not-allowed',
              atLimit && !isSelected && 'opacity-40',
            )}
          >
            <PixelPlayingCard
              value={card.value}
              tone={tone}
              size="md"
              footerLabel={locked ? 'locked' : discarded ? 'used' : undefined}
              className="h-full w-full"
            />
          </motion.button>
        );
      })}
    </div>
  );
}
