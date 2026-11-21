/** Tests displayed-word history across real persistence, reset, voice switch and mandatory facts. */
import { describe, expect, it } from 'vitest';
import { createDialogueMemory, DIALOGUE_MEMORY_KEY, type SpokenLine } from './dialogue-memory';
const line = (text: string, motif = 'praise', voice = 'gu'): SpokenLine => ({ voice, scene: 'P_ONE', text, motif });
function store() { const data = new Map<string, string>(); return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } }; }
describe('dialogue memory', () => {
  it('excludes exact and near-synonym praise but allows a different conversational action', () => {
    const d = createDialogueMemory(); d.shown(line('好球。'));
    expect(d.candidates([line('好球！'), line('漂亮。'), line('我等着。', 'give-space')]).map(l => l.text)).toEqual(['我等着。']);
  });
  it('keeps the previous three spoken racks and current rack, including refresh exits', () => {
    const s = store(); let d = createDialogueMemory(s);
    d.shown(line('第一颗。', 'first')); d = createDialogueMemory(s);
    expect(d.candidates([line('第一颗。', 'first')])).toEqual([]);
    for (let i = 0; i < 2; i++) { d.shown(line(`其他${i}`, `m${i}`)); d.reset(); }
    expect(d.candidates([line('第一颗。', 'first')])).toEqual([]);
    d.shown(line('第三局其他句', 'third')); d.reset();
    expect(d.candidates([line('第一颗。', 'first')])).toHaveLength(1);
  });
  it('changing roles preserves their separate history; an empty reset does not erase it', () => {
    const d = createDialogueMemory(); d.shown(line('好球。')); d.reset(); d.reset();
    expect(d.candidates([line('好球。')])).toEqual([]);
    expect(d.candidates([line('好球。', 'praise', 'wen')])).toHaveLength(1);
  });
  it('advances the three-rack window through genuine silent racks instead of silencing forever', () => {
    const d = createDialogueMemory(); d.shown(line('好球。')); d.reset();
    for (let i = 0; i < 3; i++) { d.start(); d.reset(); }
    expect(d.candidates([line('好球。')])).toHaveLength(1);
  });
  it('always permits necessary facts, preferring fresh then alternating existing wording', () => {
    const d = createDialogueMemory(); const a = line('白球进袋，这杆我来。', 'rule'); const b = line('白球进袋，换我。', 'rule');
    d.shown(a); expect(d.candidates([a, b], true)).toEqual([b]);
    d.shown(b); expect(d.candidates([a, b], true)).toEqual([a]);
    expect(d.candidates([b], true)).toEqual([b]);
  });
  it('bounds stored text and tolerates corrupt or denied storage without clearing other keys', () => {
    const s = store(); s.setItem('other', 'keep'); s.setItem(DIALOGUE_MEMORY_KEY, '{bad');
    const d = createDialogueMemory(s); for (let i = 0; i < 80; i++) d.shown(line(`${i}`));
    expect(d.snapshot().current).toHaveLength(32); expect(s.getItem('other')).toBe('keep');
    const unavailable = createDialogueMemory({ getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('quota'); } });
    expect(() => unavailable.shown(line('一颗。'))).not.toThrow();
    expect(unavailable.candidates([line('一颗。')])).toEqual([]);
  });
});
