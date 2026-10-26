import { describe, expect, it, vi } from 'vitest';
import { createShotLease } from './shot-lifecycle';
import { createInitialWorld, strikeCueBall } from './physics';
import { beginMatch, createInitialMatchState } from './match/match-machine';
function fixture() {
  return { world: { current: createInitialWorld() }, match: { current: beginMatch(createInitialMatchState()) } };
}
describe('delayed contact belongs to one exact turn', () => {
  it('cannot strike a new rack after restart, even when its shot number is also zero', () => {
    const { world, match } = fixture(), contact = vi.fn();
    const lease = createShotLease(world, match, 'player');
    world.current = createInitialWorld();
    expect(lease.commit(contact)).toBe(false); expect(contact).not.toHaveBeenCalled();
  });
  it('commits at most once when animation and fallback timer race', () => {
    const { world, match } = fixture();
    const lease = createShotLease(world, match, 'player');
    const contact = vi.fn(() => strikeCueBall(world.current, 0, 50));
    expect(lease.commit(contact)).toBe(true); expect(lease.commit(contact)).toBe(false);
    expect(world.current.shot).toBe(1); expect(contact).toHaveBeenCalledOnce();
  });
  it('rejects cancelled work and work after a change of actor', () => {
    const { world, match } = fixture(), contact = vi.fn();
    const lease = createShotLease(world, match, 'player'); lease.cancel();
    expect(lease.commit(contact)).toBe(false);
    const other = createShotLease(world, match, 'player');
    match.current = { ...match.current, actor: 'opponent', phase: 'opponent' };
    expect(other.commit(contact)).toBe(false); expect(contact).not.toHaveBeenCalled();
  });
  it('allows harmless message changes while the same actor is thinking', () => {
    const { world, match } = fixture(); match.current = { ...match.current, actor:'opponent', phase:'opponent' };
    const lease = createShotLease(world, match, 'opponent');
    match.current = { ...match.current, messageKey:'ai-choice' };
    expect(lease.commit(() => {})).toBe(true);
  });
});
