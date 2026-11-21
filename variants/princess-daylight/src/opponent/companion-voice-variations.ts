/** [INPUT]: 角色与已判定场景；[OUTPUT]: 原创可迭代短句与表达意图；[POS]: 台词数据，不推断球路。 */
// Each alternative changes the conversational action, not just a praise adjective.
// Edit here alongside companion-voices.ts. Unlisted scenes retain their existing authored lines.
export const VOICE_VARIATIONS: Record<string, Record<string, readonly string[]>> = {
  'shen-yubai': { P_FIRST_POT: ['这一分收下了，公主。', '第一颗落袋，我也该认真了。', '开张了。下一杆仍由公主。'], P_ONE: ['这颗收得从容。', '我先在一旁候着。', '这一分，我记下了。'] },
  'lu-jingchen': { P_FIRST_POT: ['第一颗，打实了。', '球进了。照你的判断继续。', '开张了。我准备接招。'], P_ONE: ['这一杆打得干脆。', '继续，我还追得上。', '这一分算你的。'] },
  'wen-xingye': { P_FIRST_POT: ['袋口刚开门，公主第一个到！', '进啦！这回掌声没迟到。', '先记公主一分，我的斗志醒了！'], P_ONE: ['这颗到站啦，下一颗请上车。', '我都准备起身了，又得坐回去！', '这一分我记着，待会儿追！', '球都进了，我的掌声慢了一拍！'] },
  'gu-yanchuan': { P_FIRST_POT: ['好球。', '第一颗。', '到你继续。'], P_ONE: ['准。', '这分，你的。', '我等着。'] },
  'jiang-yueheng': { P_FIRST_POT: ['还挺漂亮。也就多看了一眼。', '第一颗而已，我可没认输。', '进了。刚才那杆，我看清了。'], P_ONE: ['这杆确实可以。', '我还没上手，别急着得意。', '这一分先记你账上。'] },
  'zhou-mubai': { P_FIRST_POT: ['第一颗进了，先记住这次出手。', '开张了。按自己的节奏继续。', '进球了，先不用急着抬杆。'], P_ONE: ['这一杆处理得清楚。', '给自己一点看下一杆的时间。', '这分收好，我们接着打。'] },
  'xie-linyu': { P_FIRST_POT: ['这一分你拿得漂亮。我追。', '开张了？好，我认真了。', '先让你记一分，后面可长着。'], P_ONE: ['这杆值得我认真接招。', '先别看我，看你的下一颗。', '这一分归你，我记着。'] },
  'pei-zhixu': { P_FIRST_POT: ['好球。袋口终于干了件正事。', '第一分到手，我的计划得改了。', '开张了。看来我没法偷懒。'], P_ONE: ['我刚想预测，球已经进了。', '我先不发表意见，免得说早了。', '这一分记得比我的借口快。'] },
  'song-yucheng': { P_FIRST_POT: ['呀，进啦！给公主拍拍手。', '第一颗！我也跟着有精神啦。', '开张啦，我把这一分记好！'], P_ONE: ['这颗我看见啦！', '我先把欢呼收一收，你继续。', '这一分给公主画颗小星星。'] },
  'xu-qinghe': { P_FIRST_POT: ['进了呀。刚才那一下，真舒服。', '第一颗收好了。慢慢来。', '开张了，我在旁边看着。'], P_ONE: ['清清爽爽的一杆。', '这一分先收好。', '我不催，等你的下一杆。'] },
};

// Alternative rule endings keep the precise foul/group fact outside the authored voice.
export const VOICE_RULE_TURNS: Record<string, readonly [string, string]> = {
  'shen-yubai': ['这杆我接，公主稍候。', '接下来，请公主出杆。'],
  'lu-jingchen': ['换我。我会按规则打。', '轮到你，按规则继续。'],
  'wen-xingye': ['这回轮到我上场啦！', '公主接棒，我退到台边！'],
  'gu-yanchuan': ['换我。', '到你。'],
  'jiang-yueheng': ['这杆归我，可没占你便宜。', '到你了，我可没放水。'],
  'zhou-mubai': ['换我来，你先看一杆。', '现在轮到你，先看清再打。'],
  'xie-linyu': ['我的机会来了。', '你的机会，接好了。'],
  'pei-zhixu': ['换我了，规则替我省了话。', '该你了，我的借口先收着。'],
  'song-yucheng': ['我来啦，公主等我一下！', '轮到公主啦，我看着！'],
  'xu-qinghe': ['那我慢慢打，你歇一会儿。', '换你啦，别着急。'],
};

// Explicit motifs catch near-synonym loops across scenes; this is editorial metadata, not NLP.
export function dialogueMotif(scene: string, text: string): string {
  if (['OPEN_PLAYER', 'REMATCH'].includes(scene)) return `opening:${text}`;
  if (['P_FIRST_POT', 'P_ONE', 'P_RECOVER'].includes(scene)) {
    if (/袋口|到站|上车|下班/.test(text)) return 'delivery-joke';
    if (/记|一分|这分|账/.test(text)) return 'scorekeeping';
    if (/等|旁边|一旁|坐回|不催|不发表/.test(text)) return 'give-space';
    if (/追|认真|接招|偷懒|认输/.test(text)) return 'challenge';
    if (/节奏|下一杆|继续|抬杆/.test(text)) return 'next-action';
    return 'praise';
  }
  return scene;
}
