/*
[INPUT]: 按真实场景选定的一句台词、本局陪练及实际展示回执
[OUTPUT]: 28px小头像与无框短句；事实教学不消耗随机鼓励预算，不延迟AI、不捕获手势
[POS]: 球桌 HUD 呈现，不捕获触摸、不触发 AI 或计分
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useEffect } from 'react';
import { companionFor } from '../opponent/companions';
import type { CompanionDialogue } from '../opponent/companion-dialogue';
export function CompanionMoment({ dialogue, onShown, afterFoul = false }: { dialogue: CompanionDialogue; onShown?: (id: number) => void; afterFoul?: boolean }) {
  const companion = companionFor(dialogue.companionId);
  useEffect(() => { onShown?.(dialogue.id); }, [dialogue.id, onShown]);
  return <aside className="companion-moment" data-scene={dialogue.sceneId} data-after-foul={afterFoul || undefined} role="status" aria-label={`${companion.name}说`}>
    <img src={companion.avatar} alt="" width="28" height="28"/>
    <p>{dialogue.text}</p>
  </aside>;
}
