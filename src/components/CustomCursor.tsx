import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';

type CursorMode = 'default' | 'interactive' | 'press' | 'drag' | 'view' | 'native';

export function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<CursorMode>('default');

  const rawX = useMotionValue(-100);
  const rawY = useMotionValue(-100);

  const ringX = useSpring(rawX, { stiffness: 420, damping: 32, mass: 0.45 });
  const ringY = useSpring(rawY, { stiffness: 420, damping: 32, mass: 0.45 });

  useEffect(() => {
    const pointerQuery = window.matchMedia('(pointer: fine)');
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const syncCapability = () => {
      const active = pointerQuery.matches && !motionQuery.matches;
      setEnabled(active);
      document.body.classList.toggle('custom-cursor-active', active);
    };

    syncCapability();
    pointerQuery.addEventListener('change', syncCapability);
    motionQuery.addEventListener('change', syncCapability);

    return () => {
      document.body.classList.remove('custom-cursor-active');
      pointerQuery.removeEventListener('change', syncCapability);
      motionQuery.removeEventListener('change', syncCapability);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let rafId = 0;
    let pendingX = -100;
    let pendingY = -100;

    const flush = () => {
      rafId = 0;
      rawX.set(pendingX);
      rawY.set(pendingY);
    };

    const resolveMode = (target: EventTarget | null): CursorMode => {
      if (!(target instanceof HTMLElement)) return 'default';
      if (target.closest('input, textarea, select, table, [data-cursor="native"]')) {
        return 'native';
      }
      const explicit = target.closest<HTMLElement>('[data-cursor]');
      if (explicit) {
        const val = explicit.getAttribute('data-cursor');
        if (val === 'drag') return 'drag';
        if (val === 'view') return 'view';
        if (val === 'none') return 'native';
      }
      if (target.closest('button, a, [role="button"], .glass-card-hover')) {
        return 'interactive';
      }
      return 'default';
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pendingX = e.clientX;
      pendingY = e.clientY;
      setVisible(true);
      if (!rafId) {
        rafId = requestAnimationFrame(flush);
      }
      setMode((prev) => (prev === 'press' ? 'press' : resolveMode(e.target)));
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (resolveMode(e.target) !== 'native') {
        setMode('press');
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      setMode(resolveMode(e.target));
    };

    const onMouseLeave = () => setVisible(false);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    document.addEventListener('mouseleave', onMouseLeave);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [enabled, rawX, rawY]);

  if (!enabled || !visible || mode === 'native') {
    return null;
  }

  const isExpanded = mode === 'interactive' || mode === 'drag' || mode === 'view';
  const ringScale = mode === 'press' ? 0.72 : isExpanded ? 1.55 : 1;
  const label = mode === 'drag' ? 'Drag' : mode === 'view' ? 'View' : null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden"
    >
      {/* Spring-lagged gradient ring */}
      <motion.div
        style={{
          x: ringX,
          y: ringY,
          translateX: '-50%',
          translateY: '-50%',
        }}
        animate={{
          scale: ringScale,
          opacity: visible ? 1 : 0,
        }}
        transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-0 left-0 w-9 h-9 rounded-full flex items-center justify-center"
      >
        <div
          className={`w-full h-full rounded-full border transition-colors duration-150 ${
            isExpanded
              ? 'border-cyan-400/80 bg-cyan-500/12 shadow-[0_0_24px_rgba(6,182,212,0.35)]'
              : 'border-violet-400/55 bg-transparent'
          }`}
        />
        {label && (
          <span className="absolute text-[9px] font-semibold tracking-wide text-cyan-200 select-none">
            {label}
          </span>
        )}
      </motion.div>

      {/* Instant tracking dot */}
      <motion.div
        style={{
          x: rawX,
          y: rawY,
          translateX: '-50%',
          translateY: '-50%',
        }}
        animate={{
          scale: mode === 'press' ? 1.35 : label ? 0 : 1,
          opacity: visible ? 1 : 0,
        }}
        transition={{ duration: 0.08 }}
        className="fixed top-0 left-0 w-2 h-2 rounded-full bg-gradient-to-tr from-cyan-400 to-violet-400 shadow-[0_0_10px_rgba(6,182,212,0.85)]"
      />
    </div>
  );
}
