/** [INPUT]: 实际显示的台词；[OUTPUT]: 本局及最近三局有界记忆；[POS]: 仅本机表现层。 */
import type { SaveStore } from '../minitool/persistent-storage';

export const DIALOGUE_MEMORY_KEY = 'princess-billiards:dialogue-memory:v1';
export type SpokenLine = { voice: string; scene: string; text: string; motif: string };
type Memory = { version: 1; racks: SpokenLine[][]; current: SpokenLine[]; active: boolean };
const normalized = (text: string) => text.replace(/[\s，。！？、；：,.!?…“”「」]/g, '');
function valid(line: unknown): line is SpokenLine {
  if (!line || typeof line !== 'object') return false;
  const l = line as SpokenLine;
  return [l.voice, l.scene, l.text, l.motif].every(v => typeof v === 'string' && v.length <= 180);
}
export function createDialogueMemory(store: SaveStore | null = null) {
  let memory: Memory = { version: 1, racks: [], current: [], active: false };
  try {
    const raw = JSON.parse(store?.getItem(DIALOGUE_MEMORY_KEY) ?? 'null');
    if (raw?.version === 1 && Array.isArray(raw.racks) && Array.isArray(raw.current)) {
      memory.racks = raw.racks.slice(-3).filter(Array.isArray).map((r: unknown[]) => r.filter(valid).slice(-32));
      const last = raw.current.filter(valid).slice(-32);
      // Refresh starts a new rack; the previous rack remains recent, including mid-game exits.
      if (raw.active === true || last.length) memory.racks = [...memory.racks, last].slice(-3);
    }
  } catch { /* Invalid/unavailable storage never blocks gameplay or clears an old key. */ }
  const persist = () => { try { store?.setItem(DIALOGUE_MEMORY_KEY, JSON.stringify(memory)); } catch { /* Page memory still works. */ } };
  const history = () => memory.racks.reduce<SpokenLine[]>((all, r) => all.concat(r), []).concat(memory.current);
  return {
    start() { memory.active = true; persist(); },
    candidates(lines: readonly SpokenLine[], required = false) {
      const all = history();
      const exact = (a: SpokenLine, b: SpokenLine) => a.voice === b.voice && normalized(a.text) === normalized(b.text);
      const fresh = lines.filter(line => !all.some(old => exact(old, line)));
      if (required) {
        // Facts must always be spoken. Prefer unseen phrasing, then avoid the last same-scene wording.
        const last = [...all].reverse().find(l => l.voice === lines[0]?.voice && l.scene === lines[0]?.scene);
        return fresh.length ? fresh : lines.filter(l => !last || !exact(last, l)).length
          ? lines.filter(l => !last || !exact(last, l)) : [...lines];
      }
      return fresh.filter(line => !all.filter(old => old.voice === line.voice).slice(-2).some(old => old.motif === line.motif));
    },
    shown(line: SpokenLine) { memory.active = true; memory.current = [...memory.current, line].slice(-32); persist(); },
    reset() {
      if (memory.active || memory.current.length) memory.racks = [...memory.racks, memory.current].slice(-3);
      memory.current = []; memory.active = false; persist();
    },
    snapshot: () => JSON.parse(JSON.stringify(memory)) as Memory,
  };
}
