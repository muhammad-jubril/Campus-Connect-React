import { useCallback, useEffect, useState } from "react";

function readEndTime(storageKey) {
  try {
    const stored = Number(localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > Date.now() ? stored : 0;
  } catch {
    return 0;
  }
}

function clearEndTime(storageKey) {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // localStorage can be unavailable or blocked; in-memory state still works.
  }
}

export function useCooldown(seconds, storageKey) {
  const [endTime, setEndTime] = useState(() => readEndTime(storageKey));
  const [remaining, setRemaining] = useState(() => {
    const end = readEndTime(storageKey);
    return end ? Math.ceil((end - Date.now()) / 1000) : 0;
  });

  useEffect(() => {
    if (!endTime) return undefined;

    function tick() {
      const next = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setRemaining(next);

      if (next === 0) {
        setEndTime(0);
        clearEndTime(storageKey);
      }
    }

    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [endTime, storageKey]);

  const start = useCallback((duration = seconds) => {
    const nextEnd = Date.now() + Math.max(0, duration) * 1000;
    setEndTime(nextEnd);
    setRemaining(Math.max(0, duration));

    try {
      localStorage.setItem(storageKey, String(nextEnd));
    } catch {
      // localStorage can be unavailable or blocked; in-memory state still works.
    }
  }, [seconds, storageKey]);

  return {
    remaining,
    isCoolingDown: remaining > 0,
    start,
  };
}
