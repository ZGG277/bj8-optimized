import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IntroScreen } from './IntroScreen';
import { createFriendlyOpponentProfile } from '../opponent/friendly-style';
import { createPlayerSkillProfile, levelLabel } from '../opponent/model';

describe('retained intro matches actual friendly opponent', () => {
  it('shows the same capped 48/62 profiles that a high-level player starts against', () => {
    const player = { ...createPlayerSkillProfile(), level: 100, confidence: 1, totalPlayerShots: 50 };
    const html = renderToStaticMarkup(<IntroScreen playerSkill={player} onStart={() => {}} />);
    const practice = createFriendlyOpponentProfile(player, 'practice');
    const challenge = createFriendlyOpponentProfile(player, 'challenge');
    expect(practice.effectiveLevel).toBe(48);
    expect(challenge.effectiveLevel).toBe(62);
    for (const profile of [practice, challenge]) {
      expect(html).toContain(`对手 · ${levelLabel(profile.effectiveLevel)} ${profile.tierLevel}`);
    }
    expect(html).not.toContain('谢不赢 · 高手 100');
  });
});
