import { TABLE, type PhysicsEvent } from '../physics';
import type { Actor } from './types';
import type { SettledShot } from './shot-log';

type HighlightBase = { shotId: number; actor: Actor };
export type ShotHighlight = HighlightBase & (
  | { kind: 'multiple-pots'; balls: readonly number[] }
  | { kind: 'combination-pot'; from: number; target: number }
  | { kind: 'multi-rail-pot' | 'kick-pot'; target: number; rails: number }
  | { kind: 'snooker' | 'escape'; target?: number }
);

type BallContact = Extract<PhysicsEvent, { type: 'ball-collision' }>;
type CushionContact = Extract<PhysicsEvent, { type: 'cushion' }>;
const sameContactTime = 1e-6;
const involves = (event: BallContact, ball: number) => event.first === ball || event.second === ball;

function combinationSource(contacts: BallContact[], firstBall: number, firstTime: number, target: number, pocketTime: number) {
  if (target === firstBall) return null;
  const pathsIntoTarget = contacts.filter(event => involves(event, target) && event.time <= pocketTime);
  const transfer = pathsIntoTarget[0];
  if (pathsIntoTarget.length !== 1 || !involves(transfer, firstBall) || transfer.time <= firstTime + sameContactTime) return null;
  const sourcePath = contacts.filter(event => involves(event, firstBall) && event.time <= transfer.time + sameContactTime);
  const cueContact = sourcePath[0];
  return sourcePath.length === 2 && involves(cueContact, 0) && Math.abs(cueContact.time - firstTime) <= sameContactTime
    ? firstBall : null;
}

export function meaningfulRailContacts(events: readonly PhysicsEvent[], ball: number, start: number, end: number) {
  const rails: (CushionContact & { rail: NonNullable<CushionContact['rail']> })[] = [];
  for (const event of events) {
    if (event.type !== 'cushion' || event.ball !== ball || !event.rail || event.speed < .10 ||
        event.time <= start + sameContactTime || event.time >= end - sameContactTime) continue;
    const previous = rails[rails.length - 1];
    if (previous && (event.time - previous.time < .055 ||
        Math.hypot(event.rail.x - previous.rail.x, event.rail.z - previous.rail.z) < 2 * TABLE.ballRadius)) continue;
    rails.push({ ...event, rail: event.rail });
  }
  return rails;
}

export function potHighlight(shot: SettledShot, events: readonly PhysicsEvent[]): ShotHighlight | null {
  if (shot.breaking || shot.foul || !shot.legalPots.length) return null;
  const base = { shotId: shot.shotId, actor: shot.actor };
  const contact = events.find(event => event.type === 'first-contact');
  const first = contact?.ball === shot.firstContact ? contact : undefined;
  const contacts = events.filter(event => event.type === 'ball-collision');
  const latestContacts = [...contacts].reverse();
  let bank: ShotHighlight | null = null;
  let combination: ShotHighlight | null = null;
  for (const event of events) {
    if (event.type !== 'pocket' || !shot.legalPots.includes(event.ball)) continue;
    const target = event.ball;
    // Count the object's actual travel to the pocket after its last ball contact.
    const lastContact = latestContacts.find(contact => involves(contact, target) && contact.time <= event.time);
    const rails = lastContact ? meaningfulRailContacts(events, target, lastContact.time, event.time).length : 0;
    if (rails >= 2 && (!bank || (bank.kind === 'multi-rail-pot' && bank.rails < rails))) {
      bank = { ...base, kind: 'multi-rail-pot', target, rails };
    }
    const from = first && combinationSource(contacts, first.ball, first.time, target, event.time);
    if (from && !combination) combination = { ...base, kind: 'combination-pot', from, target };
  }
  if (bank) return bank;
  const kick = first ? meaningfulRailContacts(events, 0, -Infinity, first.time).length : 0;
  if (kick >= 2) return { ...base, kind: 'kick-pot', target: shot.legalPots[0], rails: kick };
  if (combination) return combination;
  return shot.legalPots.length >= 2 ? { ...base, kind: 'multiple-pots', balls: shot.legalPots } : null;
}

export function highlightText(highlight: ShotHighlight): string {
  switch (highlight.kind) {
    case 'multiple-pots': return highlight.balls.length === 2 ? '一杆双球' : `一杆 ${highlight.balls.length} 球`;
    case 'combination-pot': return `传球入袋 · ${highlight.from} → ${highlight.target} 号`;
    case 'multi-rail-pot': return `${highlight.rails} 库入袋`;
    case 'kick-pot': return `借 ${highlight.rails} 库进球`;
    case 'snooker': return highlight.actor === 'player' ? '防守封球' : '直线被挡';
    case 'escape': return '解球成功';
  }
}
