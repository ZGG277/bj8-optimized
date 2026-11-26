import type { ShotHighlight } from '../match/shot-highlights';
import { companionVoiceId } from './companion-preferences';
import { companionVoice } from './companion-voices';

export function shotHighlightLines(event: ShotHighlight, companionId?: string): readonly string[] {
  const rosa = companionVoiceId(companionId) === 'f05';
  const quiet = companionVoice(companionId)?.cadence === 'quiet';
  if (event.kind === 'snooker') {
    if (event.actor === 'opponent') return rosa ? ['哼，直线被我挡住啦。', '白球不好直接碰，你看一眼库边。']
      : ['直线被挡了，看看能不能借库。', '先别硬打，看看有没有解球路线。'];
    return rosa ? ['哼，你把白球藏得还真严。', '这杆防守，本小姐得绕了。']
      : quiet ? ['封得漂亮。我得绕。', '你把直线堵严了。']
      : ['白球藏得够深，我得找条绕路。', '你这杆守得好，直线全封了。'];
  }
  if (event.kind === 'escape') {
    if (rosa) return ['这都让你绕开了？本小姐记住了。', '哼，你这解球还真漂亮。'];
    return quiet ? ['找到了。解得稳。', '这条路选得好。']
      : ['你绕开了挡球，这杆解得漂亮。', '这球让你解到了，稳！'];
  }
  if (event.kind === 'combination-pot') {
    if (event.actor === 'player' && rosa) return [
      `你借 ${event.from} 号送 ${event.target} 号入袋？本小姐看到了。`,
      `传到 ${event.target} 号都能进？哼，这杆算你厉害。`,
    ];
    if (event.actor === 'player' && quiet) return [
      `${event.from} 号传给 ${event.target} 号。漂亮。`, `${event.target} 号入袋，传得准。`,
    ];
    return event.actor === 'player'
      ? [`你借 ${event.from} 号送 ${event.target} 号入袋，漂亮！`, `你传了个好球，${event.target} 号真进了！`]
      : [`我借 ${event.from} 号把 ${event.target} 号送进去了。`, `传到 ${event.target} 号，还真进了！`];
  }
  if (event.kind === 'multi-rail-pot' || event.kind === 'kick-pot') {
    const route = event.kind === 'kick-pot' ? '白球' : `${event.target} 号`;
    if (event.actor === 'player' && rosa) return [
      `${route}撞了 ${event.rails} 库还进？哼，真有你的。`, `绕了 ${event.rails} 库都能进，你让我刮目相看。`,
    ];
    if (event.actor === 'player' && quiet) return [
      `${route}弹了 ${event.rails} 库。好球。`, `${event.rails} 库还能进，漂亮。`,
    ];
    return event.actor === 'player'
      ? [`${route}弹了 ${event.rails} 库还能进？好球！`, `你这杆好看，${route}绕了 ${event.rails} 库！`]
      : [`${route}弹了 ${event.rails} 库，竟然进了！`, `${route}绕了 ${event.rails} 库，袋还真接住了。`];
  }
  if (event.kind === 'multiple-pots') {
    const count = event.balls.length;
    if (event.actor === 'opponent') return [`一杆进了 ${count} 颗，我也没想到。`, `这一杆，我一下收了 ${count} 颗。`];
    if (rosa) return [`一杆 ${count} 颗？哼，本小姐服了。`, `你一杆进了 ${count} 颗，真会打。`];
    if (quiet) return [`一杆 ${count} 颗。漂亮。`, `你这一杆，收了 ${count} 颗。`];
    return [`你一杆进了 ${count} 颗，太漂亮了！`, `一杆就收 ${count} 颗？我得给你鼓掌！`];
  }
  return [];
}
