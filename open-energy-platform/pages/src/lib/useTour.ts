import { useState, useCallback } from 'react';

export function useTour(tourId: string) {
  const key = `oe-tour-done-${tourId}`;
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const start = useCallback(() => {
    if (!tourId || localStorage.getItem(key)) return;
    setStepIndex(0);
    setActive(true);
  }, [key, tourId]);

  const startForced = useCallback(() => {
    if (!tourId) return;
    setStepIndex(0);
    setActive(true);
  }, [tourId]);

  const finish = useCallback(() => {
    if (tourId) localStorage.setItem(key, '1');
    setActive(false);
  }, [key, tourId]);

  const isDone = tourId ? !!localStorage.getItem(key) : true;

  return { active, stepIndex, setStepIndex, start, startForced, finish, isDone };
}
