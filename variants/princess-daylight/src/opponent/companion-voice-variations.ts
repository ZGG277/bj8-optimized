/** [INPUT]: 角色与已判定场景；[OUTPUT]: 原创可迭代短句与表达意图；[POS]: 台词数据，不推断球路。 */
// Each alternative changes the conversational action, not just a praise adjective.
// Edit here alongside companion-voices.ts. Unlisted scenes retain their existing authored lines.
export const VOICE_VARIATIONS: Record<string, Record<string, readonly string[]>> = {
  'shen-yubai': { P_FIRST_POT: ['好听。第一颗落袋了。', '第一颗落袋，我也该认真了。', '开张了，你接着来。'], P_ONE: ['这颗收得从容。', '我先在一旁候着。', '我还想看你再打一颗。'] },
  'lu-jingchen': { P_FIRST_POT: ['第一颗，打实了。', '球进了。照你的判断继续。', '开张了。我准备接招。'], P_ONE: ['这一杆打得干脆。', '继续，我还追得上。', '干净，一点没犹豫。'] },
  'wen-xingye': { P_FIRST_POT: ['袋口刚开门，公主第一个到！', '进啦！这回掌声没迟到。', '哎哟，开张了！我还没坐稳呢。'], P_ONE: ['这颗到站啦，下一颗请上车。', '我都准备起身了，又得坐回去！', '好响！隔张台我都能听见。', '球都进了，我的掌声慢了一拍！'] },
  'gu-yanchuan': { P_FIRST_POT: ['好球。', '第一颗。', '进了，继续。'], P_ONE: ['准。', '进得干脆。', '我等着。'] },
  'jiang-yueheng': { P_FIRST_POT: ['还挺漂亮。也就多看了一眼。', '第一颗而已，我可没认输。', '进了。刚才那杆，我看清了。'], P_ONE: ['这杆确实可以。', '我还没上手，别急着得意。', '这颗好看。我承认。'] },
  'zhou-mubai': { P_FIRST_POT: ['第一颗进了，先记住这次出手。', '开张了。按自己的节奏继续。', '进球了，先不用急着抬杆。'], P_ONE: ['这一杆处理得清楚。', '给自己一点看下一杆的时间。', '这一杆瞄得挺稳。'] },
  'xie-linyu': { P_FIRST_POT: ['好球！我还等着跟你较量呢。', '开张了？好，我认真了。', '第一颗是你的，我可得追了。'], P_ONE: ['这杆值得我认真接招。', '先别看我，看你的下一颗。', '痛快。就等你打这样的球。'] },
  'pei-zhixu': { P_FIRST_POT: ['好球。袋口终于干了件正事。', '这就开张了？我往后稍稍。', '开张了。看来我没法偷懒。'], P_ONE: ['我刚想预测，球已经进了。', '我先不发表意见，免得说早了。', '好球。看来我还得多等一会儿。'] },
  'song-yucheng': { P_FIRST_POT: ['呀，进啦！给公主拍拍手。', '第一颗！我也跟着有精神啦。', '第一颗进啦！你听，咚的一声。'], P_ONE: ['这颗我看见啦！', '我先把欢呼收一收，你继续。', '这声真好听，再进一颗吧！'] },
  'xu-qinghe': { P_FIRST_POT: ['进了呀。刚才那一下，真舒服。', '第一颗收好了。慢慢来。', '开张了，我在旁边看着。'], P_ONE: ['清清爽爽的一杆。', '真舒服，我还想看你打。', '我不催，等你的下一杆。'] },
};

// Alternative rule endings keep the precise foul/group fact outside the authored voice.
export const VOICE_RULE_TURNS: Record<string, readonly [string, string]> = {
  'shen-yubai': ['我来接，你歇口气。', '接下来，请公主出杆。'],
  'lu-jingchen': ['换我打，你歇一下。', '该你了，看准再出手。'],
  'wen-xingye': ['这回轮到我上场啦！', '公主接棒，我退到台边！'],
  'gu-yanchuan': ['换我。', '到你。'],
  'jiang-yueheng': ['这杆归我，可没占你便宜。', '到你了，我可没放水。'],
  'zhou-mubai': ['换我来，你先看一杆。', '现在轮到你，先看清再打。'],
  'xie-linyu': ['我的机会来了。', '你的机会，接好了。'],
  'pei-zhixu': ['换我了，我正好活动一下。', '该你了，我的借口先收着。'],
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
