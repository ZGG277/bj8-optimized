import { companionVoiceId } from './companion-preferences';
import { SPEECH_LIMIT, shortSpeech } from './short-speech';

type PetName = '宝宝' | '亲爱的';
const babyVoices = new Set(['wen-xingye', 'song-yucheng', 'f02', 'f09', 'm06']);
const dearVoices = new Set(['m10']);
const titles = ['小公主殿下', '小公主宝宝', '公主殿下', '公主宝宝', '小公主', '王子殿下', '公主',
  '殿下', '陛下', '小姐姐', '小妹妹', '小哥哥', '小弟弟', '美女', '帅哥', '姑娘'];
const gameTitle = '《公主请开球》';

export function companionPetName(id?: string): PetName | undefined {
  const voice = companionVoiceId(id) ?? '';
  if (babyVoices.has(voice)) return '宝宝';
  return dearVoices.has(voice) ? '亲爱的' : undefined;
}

/** Applies to authored or model-written companion speech, never to what the player typed. */
export function addressPlayer(text: string, id?: string, nickname?: string): string {
  if (nickname) {
    // Match longest first so a nickname like “帅” cannot protect the whole title “帅哥”.
    const terms = [...new Set([gameTitle, nickname, ...titles, '宝宝', '亲爱的'])]
      .sort((a, b) => b.length - a.length)
      .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return text.replace(new RegExp(terms.join('|'), 'gu'), term => term === gameTitle ? term : nickname).trim();
  }
  const allowed = companionPetName(id);
  const aliases = [...titles, allowed !== '宝宝' ? '宝宝' : '', allowed !== '亲爱的' ? '亲爱的' : ''].filter(Boolean).join('|');
  const vocative = new RegExp(`(^|[，,。！？!?：:\\s])(?:${aliases})[，,：:\\s]+`, 'gu');
  const beforeRequest = new RegExp(`^(?:${aliases})(?=请(?:你|开球|出杆|继续))`, 'u');
  const duplicate = new RegExp(`(?:${aliases})(?=你)`, 'gu');
  const address = new RegExp(`(?:${aliases})`, 'gu');
  return text.split(/(《公主请开球》)/u).map(piece => piece === gameTitle ? piece : piece
    .replace(vocative, '$1')
    .replace(beforeRequest, '')
    .replace(duplicate, '')
    .replace(address, '你')).join('').trim();
}

export function callPlayerByName(text: string, nickname?: string, direct = false) {
  if (!nickname || nickname === '你' || !text || (!direct && !text.includes('你')) ||
      text.split(gameTitle).join('').includes(nickname)) return text;
  // Keep necessary pronouns inside the sentence, but drop a redundant subject after the vocative.
  const body = text.replace(/^你(?=这[杆球]|刚才|先|可以|要不要|试试|帮我|替我|替本小姐)/u, '');
  return `${nickname}，${body}`;
}

export function greetPlayer(text: string, id?: string, nickname?: string) {
  const addressed = addressPlayer(text, id, nickname);
  const fallback = '请开球。';
  if (!nickname || nickname === '你' || addressed.startsWith(nickname + '，') || addressed.startsWith(nickname + ',')) {
    return shortSpeech(addressed, fallback);
  }
  const prefix = `${nickname}，`;
  return prefix + shortSpeech(addressed, fallback, SPEECH_LIMIT - Array.from(prefix).length);
}
