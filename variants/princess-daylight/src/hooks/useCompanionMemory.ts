import { useCallback, useRef, useState } from 'react';
import { gameCompanionMemory } from '../minitool/persistent-storage';
import { emptyCompanionMemory, readCompanionMemory, type CompanionMemory } from '../opponent/companion-memory';

type SaveStatus = 'ready' | 'saving' | 'unsaved' | 'unavailable' | 'unreadable';

export function useCompanionMemory() {
  const [storage] = useState(gameCompanionMemory);
  const [state, setState] = useState<{ memory: CompanionMemory; status: SaveStatus }>(() => {
    try {
      return { memory: readCompanionMemory(storage?.read() ?? null), status: storage ? 'ready' : 'unavailable' };
    } catch {
      return { memory: emptyCompanionMemory(), status: 'unreadable' };
    }
  });
  const current = useRef(state.memory);
  const attempt = useRef(0);
  const canSave = state.status !== 'unreadable' && state.status !== 'unavailable';
  const save = useCallback((memory: CompanionMemory) => {
    if (!storage || !canSave) return;
    const write = ++attempt.current;
    setState({ memory, status: 'saving' });
    const finish = (saved: boolean) => {
      if (write === attempt.current) setState({ memory: current.current, status: saved ? 'ready' : 'unsaved' });
    };
    void storage.write(JSON.stringify(memory)).then(finish, () => finish(false));
  }, [canSave, storage]);
  const update = useCallback((change: (previous: CompanionMemory) => CompanionMemory) => {
    const next = change(current.current);
    if (next === current.current) return;
    current.current = next;
    if (canSave) save(next);
    else setState(previous => ({ ...previous, memory: next }));
  }, [canSave, save]);
  const retry = useCallback(() => save(current.current), [save]);
  return { ...state, current, update, retry };
}
