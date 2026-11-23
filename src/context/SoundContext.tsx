import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { soundEngine, type SoundEffect } from '@/src/lib/sound';

interface SoundContextValue {
  enabled: boolean;
  toggle: () => void;
  setEnabled: (val: boolean) => void;
  play: (effect: SoundEffect) => void;
}

const SoundContext = createContext<SoundContextValue | null>(null);

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(() => soundEngine.isEnabled());

  const setEnabled = useCallback((val: boolean) => {
    soundEngine.setEnabled(val);
    setEnabledState(soundEngine.isEnabled());
  }, []);

  const toggle = useCallback(() => {
    setEnabled(!enabled);
  }, [enabled, setEnabled]);

  const play = useCallback((effect: SoundEffect) => {
    soundEngine.play(effect);
  }, []);

  useEffect(() => {
    const unlock = () => soundEngine.unlock();
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const el = target.closest<HTMLElement>('[data-sound], button, a, [role="button"]');
      if (!el) return;

      const soundAttr = el.getAttribute('data-sound');
      if (soundAttr === 'none') return;
      if (soundAttr === 'toggle') {
        soundEngine.play('toggle');
        return;
      }
      if (soundAttr === 'click' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
        soundEngine.play('click');
      }
    };

    const handleGlobalPointerOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const el = target.closest<HTMLElement>('button, a, [data-sound="click"]');
      if (!el || el.getAttribute('data-sound') === 'none') return;
      soundEngine.play('hover');
    };

    document.addEventListener('click', handleGlobalClick, true);
    document.addEventListener('pointerover', handleGlobalPointerOver, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('click', handleGlobalClick, true);
      document.removeEventListener('pointerover', handleGlobalPointerOver);
    };
  }, []);

  return (
    <SoundContext.Provider value={{ enabled, toggle, setEnabled, play }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound(): SoundContextValue {
  const ctx = useContext(SoundContext);
  if (!ctx) {
    return {
      enabled: false,
      toggle: () => {},
      setEnabled: () => {},
      play: () => {},
    };
  }
  return ctx;
}
