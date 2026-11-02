import { useCallback, useState } from 'react';

const LIMIT = 200;

interface State<T> {
  past: T[];
  present: T;
  future: T[];
}

/**
 * Undo and redo for a value. `set` records a step. A drag calls `checkpoint` once when
 * it starts and then `set(…, { replace: true })` as it moves, so it undoes in one step.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState<State<T>>({ past: [], present: initial, future: [] });

  const set = useCallback((next: T | ((current: T) => T), options: { replace?: boolean } = {}) => {
    setState((s) => {
      const value = typeof next === 'function' ? (next as (current: T) => T)(s.present) : next;
      if (value === s.present) return s;
      if (options.replace) return { ...s, present: value };
      return { past: [...s.past, s.present].slice(-LIMIT), present: value, future: [] };
    });
  }, []);

  const checkpoint = useCallback(() => {
    setState((s) => ({ past: [...s.past, s.present].slice(-LIMIT), present: s.present, future: [] }));
  }, []);

  const undo = useCallback(() => {
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past.at(-1)!, future: [s.present, ...s.future] } : s));
  }, []);

  const redo = useCallback(() => {
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0]!, future: s.future.slice(1) } : s));
  }, []);

  const reset = useCallback((value: T) => setState({ past: [], present: value, future: [] }), []);

  return {
    value: state.present,
    set,
    checkpoint,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
