import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

/** Fluent motion: 167 ms entrance, 83 ms exit, no scale. */
const ENTER = { duration: 0.167, ease: [0.1, 0.9, 0.2, 1] } as const;
const EXIT = { duration: 0.083, ease: [0.1, 0.9, 0.2, 1] } as const;

interface PageTransitionProps {
  routeKey: string;
  children: ReactNode;
  /** Fill the main area instead of the reading column (embedded browser). */
  fill?: boolean;
}

/**
 * Animates every route change, including History list → report. The key is the
 * pathname, so filter/search updates within one page do not replay the motion.
 */
export function PageTransition({ routeKey, children, fill = false }: PageTransitionProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={routeKey}
        className={`page-transition${fill ? ' page-transition-fill' : ''}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: EXIT }}
        transition={ENTER}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
