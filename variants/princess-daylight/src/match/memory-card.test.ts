import { describe, expect, it } from 'vitest';
import { layoutMemoryPages, MEMORY_CARD_SIZE, MEMORY_CHAT, MEMORY_FRAMES, pickMemoryFrame, type MemoryLine } from './memory-card';
import { memoryFrameAsset } from '../minitool/render-memory-card';

describe('memory card page layout', () => {
  it('keeps the ten unique local frames and the 1080 × 1440 export contract', () => {
    expect(MEMORY_CARD_SIZE.width * MEMORY_CARD_SIZE.exportScale).toBe(1080);
    expect(MEMORY_CARD_SIZE.height * MEMORY_CARD_SIZE.exportScale).toBe(1440);
    expect(MEMORY_FRAMES).toHaveLength(10);
    expect(new Set(MEMORY_FRAMES.map(frame => memoryFrameAsset(frame))).size).toBe(10);
    for (const [index, frame] of MEMORY_FRAMES.entries()) {
      expect(memoryFrameAsset(frame)).toBeTruthy();
      expect(pickMemoryFrame(() => (index + .5) / MEMORY_FRAMES.length)).toBe(frame);
    }
  });

  it('moves the next bubble up, preserves all selected text, and fits each frame', () => {
    const lines: MemoryLine[] = Array.from({ length: 17 }, (_, index) => ({
      id: index + 1, side: index % 2 ? 'player' : 'opponent', text: `第${index + 1}条对话`,
    }));
    lines[7].text = '这是一段比较长的桌边对话。'.repeat(13);
    const layout = (input: MemoryLine[]) => layoutMemoryPages(input, text => Array.from(text).length * MEMORY_CHAT.font);
    const pages = layout(lines);
    expect(pages.length).toBeGreaterThan(2);
    const edited = layout(lines.filter(line => line.id !== 2));
    expect(edited[0][1]).toMatchObject({ id: 3, y: pages[0][1].y });
    for (const page of edited) {
      expect(page[0].y).toBe(MEMORY_CHAT.pageInset);
      for (const bubble of page) {
        expect(bubble.y + bubble.height).toBeLessThanOrEqual(MEMORY_CHAT.height);
        expect(bubble.x).toBe(bubble.side === 'player' ? MEMORY_CHAT.width - bubble.width : 0);
        expect(bubble.width).toBeLessThan(MEMORY_CHAT.width);
      }
    }
    expect(edited.flat().filter(bubble => bubble.id === 8).flatMap(bubble => bubble.rows).join('')).toBe(lines[7].text);
    expect(edited.flat().some(bubble => bubble.id === 2)).toBe(false);
    expect(layout([])).toEqual([[]]);
  });

  it('keeps the ending punctuation with its character and adds the same padding on both sides', () => {
    const prefix = '一'.repeat(Math.floor(MEMORY_CHAT.maxText / MEMORY_CHAT.font) - 1);
    const text = prefix + '方。然后再看下一颗！';
    const measure = (value: string) => Array.from(value).length * MEMORY_CHAT.font;
    const [bubble] = layoutMemoryPages([{ id: 1, side: 'player', text }], measure).flat();
    expect(bubble.rows).toEqual([prefix, '方。然后再看下一颗！']);
    expect(bubble.rows.join('')).toBe(text);
    expect(bubble.width - Math.max(...bubble.rows.map(measure))).toBe(MEMORY_CHAT.paddingX * 2);
  });
});
