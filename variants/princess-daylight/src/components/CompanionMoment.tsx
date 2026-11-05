/*
[INPUT]: 本局陪练、真实进球奖励或对手思考阶段
[OUTPUT]: 非阻塞角色肖像与一句短台词；思考短句随真实快速出杆短暂保留，不延迟 AI
[POS]: 球桌 HUD 呈现，不捕获触摸、不触发 AI 或计分
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useEffect, useState } from 'react';
import { companionFor } from '../opponent/companions';
import { COMPANION_CARD_ART } from '../opponent/companion-card-art';
import { companionMomentLine } from '../opponent/companion-moments';
export function CompanionMoment({ companionId, moment, eventId, thinking = true }: { companionId?: string; moment: 'pot' | 'thinking'; eventId?: number; thinking?: boolean }) {
  const companion = companionFor(companionId);
  const [ready, setReady] = useState(moment === 'pot' || thinking);
  useEffect(() => {
    if (moment === 'pot' || thinking) { setReady(true); return; }
    // Keep the spoken line briefly after a quick decision; never prolong the AI turn.
    const timer = window.setTimeout(() => setReady(false), 1800);
    return () => window.clearTimeout(timer);
  }, [moment, eventId, companionId, thinking]);
  if (!ready) return null;
  return <aside className="companion-moment" data-moment={moment} role="status">
    <img src={moment === 'pot' ? COMPANION_CARD_ART[companion.id].src : companion.avatar} alt="" width="64" height="78"/>
    <div><small>{companion.name}{moment === 'thinking' && thinking ? ' · 思考中' : ''}</small><p>{companionMomentLine(companionId, moment)}</p></div>
  </aside>;
}
