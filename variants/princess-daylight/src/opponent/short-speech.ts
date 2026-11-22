// Keep a whole sentence or clause when the speaker runs past two lines.
export const SPEECH_LIMIT = 30;

export function shortSpeech(raw: string, fallback = '你指的是哪颗？咱们一起看看。') {
  const text = raw.replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  if (chars.length <= SPEECH_LIMIT) return text || fallback;
  const head = chars.slice(0, SPEECH_LIMIT).join('');
  const sentence = head.match(/^.*[。！？!?]/u)?.[0];
  if (sentence) return sentence;
  const clause = head.match(/^.*(?=[，、；：,;])/u)?.[0];
  return clause ? clause + '。' : fallback;
}
