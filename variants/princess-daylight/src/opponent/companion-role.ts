import { customCompanionFor } from './companion-preferences';
import { storybookCompanion } from './storybook-companions';
import { CHAT_EXAMPLES, POSITION_EXAMPLE } from './chat-examples';
import { companionVoice } from './companion-voices';
import { highlightLabel, type CompanionRelationship } from './companion-memory';

const goals: Record<string, string> = {
  'shen-yubai': '陪玩家从容打完一局，给双方留体面',
  'lu-jingchen': '认真较量，按实际球况给直接的建议',
  'wen-xingye': '让一局球有笑声，看到好球就喝彩',
  'gu-yanchuan': '专心看每一杆，遇到值得说的好球才开口',
  'jiang-yueheng': '用一点打趣让对局有来有回，认真承认好球',
  'zhou-mubai': '让玩家按自己的节奏找到一件能练的事',
  'xie-linyu': '把玩家当认真对手，遇到难球一起找挑战',
  'pei-zhixu': '让陪打有趣而有分寸，留一点安静看球',
  'song-yucheng': '看见玩家的进步，用直接的喝彩带动气氛',
  'xu-qinghe': '陪玩家慢慢找到手感，失手时留耐心和余地',
};

export function companionRole(id: string) {
  const voice = companionVoice(id);
  const custom = customCompanionFor(id);
  const story = storybookCompanion(id);
  return {
    version: 1,
    personality: custom?.personality || voice?.personality,
    goal: goals[id] ?? '保持自己的球友性格，陪玩家享受一局真实的台球',
    cadence: voice?.cadence === 'quiet' ? '拿不准时少说，表扬要具体' : voice?.cadence === 'lively' ? '可以活泼，别打断出杆' : '一句话说完，给出杆留空',
    examples: {
      handbook: story?.lines,
      chat: CHAT_EXAMPLES[id] ?? [],
      position: POSITION_EXAMPLE[id],
      greeting: voice?.scenes.OPEN_PLAYER,
      goodShot: voice?.scenes.P_FIRST_POT,
      miss: voice?.scenes.P_EMPTY_1,
      playerWins: voice?.result.win,
      playerLoses: voice?.result.lose,
    },
  };
}

export function memoryGreeting(id: string, friend?: CompanionRelationship) {
  if (!friend?.visits) return null;
  const greeted = friend.greetingKeys ?? [];
  const highlight = [...friend.highlights].reverse().find(shot => !greeted.includes(`${shot.rackId}:${shot.shotId}`));
  const label = highlight && highlightLabel(highlight);
  if (highlight && label) return {
    key: `${highlight.rackId}:${highlight.shotId}`,
    text: id === 'gu-yanchuan' ? `${label}，我还记着。你先开。` : `还记得你${label}。今天也请你先开。`,
  };
  if (friend.practiceGoal && friend.practiceGoal.text.length <= 10) {
    const { text, rackId, at } = friend.practiceGoal;
    const key = `goal:${rackId}:${at}`;
    if (!greeted.includes(key) && !/[?？「」<>{}\n]/u.test(text)) {
      return { key, text: `你说想练${text}，今天接着来？` };
    }
  }
  const key = `visit:${friend.visits}`;
  return greeted.includes(key) ? null : {
    key, text: id === 'gu-yanchuan' ? '又见面了。球摆好了，你先。' : '又见面了。还是请你先开球。',
  };
}
