import { describe, expect, it } from 'vitest';
import { nextOpeningReminder } from './opening-reminder';

describe('opening reminders', () => {
  it('alternates the two reminders while both settings are untouched', () => {
    expect(nextOpeningReminder(false, false)).toBe('profile');
    expect(nextOpeningReminder(false, false, 'profile')).toBe('companion');
    expect(nextOpeningReminder(false, false, 'companion')).toBe('profile');
  });

  it('only offers a reminder for a missing setting', () => {
    expect(nextOpeningReminder(false, true, 'profile')).toBe('profile');
    expect(nextOpeningReminder(true, false, 'companion')).toBe('companion');
    expect(nextOpeningReminder(true, true)).toBeUndefined();
  });
});
