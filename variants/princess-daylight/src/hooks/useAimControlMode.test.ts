import { describe, expect, it } from 'vitest';
import { loadToyDesktopDial, saveToyDesktopDial, TOY_DESKTOP_AIM_KEY } from './useAimControlMode';

describe('Toy PC aim control preference', () => {
  it('uses arrows until the player chooses a dial, and restores either choice', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(loadToyDesktopDial(storage)).toBe(false);
    saveToyDesktopDial(true, storage);
    expect(values.get(TOY_DESKTOP_AIM_KEY)).toBe('dial');
    expect(loadToyDesktopDial(storage)).toBe(true);
    saveToyDesktopDial(false, storage);
    expect(loadToyDesktopDial(storage)).toBe(false);
  });

  it('keeps the arrow default for invalid or blocked storage', () => {
    expect(loadToyDesktopDial(null)).toBe(false);
    expect(loadToyDesktopDial({ getItem: () => 'invalid' })).toBe(false);
    expect(loadToyDesktopDial({ getItem: () => { throw Error('blocked'); } })).toBe(false);
    expect(() => saveToyDesktopDial(true, { setItem: () => { throw Error('blocked'); } })).not.toThrow();
  });
});
