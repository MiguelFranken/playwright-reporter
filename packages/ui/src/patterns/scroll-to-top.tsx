'use client';

import { ArrowUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../components/button';
import { cn } from '../lib/cn';

/**
 * Back to the top of a long page, fixed at the bottom right. It appears once
 * the window has scrolled past `threshold` pixels, so a short page never
 * shows it, and glides up unless the person asked for reduced motion.
 */
export function ScrollToTop({ threshold = 800, className }: { threshold?: number; className?: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const update = () => setShown(window.scrollY > threshold);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [threshold]);

  const toTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  if (!shown) return null;
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Scroll to top"
      title="Scroll to top"
      onClick={toTop}
      className={cn('fixed right-4 bottom-4 z-30 rounded-full bg-surface shadow-md animate-in fade-in slide-in-from-bottom-2 duration-200 md:right-6 md:bottom-6', className)}
    >
      <ArrowUp />
    </Button>
  );
}
