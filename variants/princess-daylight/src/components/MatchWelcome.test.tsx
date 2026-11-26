import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COMPANIONS, CORE_ROSTER } from '../opponent/companions';
import { createCompanionDialogue } from '../opponent/companion-dialogue';
import { COMPANION_CARD_ART, CORE_WELCOME_ART } from '../opponent/companion-card-art';
import { MatchWelcome } from './MatchWelcome';

describe('rack welcome', () => {
  it('uses distinct opening illustrations for all six featured companions', () => {
    const illustrations = CORE_ROSTER.map(companion => {
      const art = CORE_WELCOME_ART[companion.id];
      expect(art).toMatch(/-hd\.webp$/);
      expect(art).not.toBe(COMPANION_CARD_ART[companion.id].src);
      return art;
    });
    expect(new Set(illustrations).size).toBe(CORE_ROSTER.length);
  });

  it.each(COMPANIONS)('shows the name, art and one short voiced welcome for $name', companion => {
    const director = createCompanionDialogue(() => 0);
    for (let rack = 0; rack < 6; rack++) {
      director.reset(rack > 0);
      const greeting = director.ready(companion.id, rack)!;
      expect(greeting.sceneId).toBe(rack ? 'REMATCH' : 'OPEN_PLAYER');
      expect(Array.from(greeting.text).length).toBeLessThanOrEqual(30);
      const html = renderToStaticMarkup(<MatchWelcome greeting={greeting} onEnter={() => {}} onChoose={() => {}}/>);
      expect(html).toContain(CORE_WELCOME_ART[companion.id] ?? COMPANION_CARD_ART[companion.id].src);
      expect(html).toContain(companion.name);
      expect(html).toContain(greeting.text);
      expect(html).toContain('换一位球友');
      expect(director.shown(greeting.id, rack)).toBe(true);
      expect(director.ready(companion.id, rack)).toBeNull();
    }
  });
});
