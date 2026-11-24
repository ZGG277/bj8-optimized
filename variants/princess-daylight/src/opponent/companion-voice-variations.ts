/** [INPUT]: 角色与已判定场景；[OUTPUT]: 原创可迭代短句与表达意图；[POS]: 台词数据，不推断球路。 */
// Each alternative changes the conversational action, not just a praise adjective.
// Edit here alongside companion-voices.ts. Unlisted scenes retain their existing authored lines.
export const VOICE_VARIATIONS: Record<string, Record<string, readonly string[]>> = {
  'shen-yubai': { P_FIRST_POT: ['好听。第一颗落袋了。', '第一颗落袋，我也该认真了。', '开张了，你接着来。'], P_ONE: ['这颗收得从容。', '我先在一旁候着。', '我还想看你再打一颗。'] },
  'lu-jingchen': { P_FIRST_POT: ['第一颗，打实了。', '球进了。照你的判断继续。', '开张了。我准备接招。'], P_ONE: ['这一杆打得干脆。', '继续，我还追得上。', '干净，一点没犹豫。'] },
  'wen-xingye': { P_FIRST_POT: ['袋口刚开门，你第一个到！', '进啦！这回掌声没迟到。', '哎哟，开张了！我还没坐稳呢。'], P_ONE: ['这颗到站啦，下一颗请上车。', '我都准备起身了，又得坐回去！', '好响！隔张台我都能听见。', '球都进了，我的掌声慢了一拍！'] },
  'gu-yanchuan': { P_FIRST_POT: ['好球。', '第一颗。', '进了，继续。'], P_ONE: ['准。', '进得干脆。', '我等着。'] },
  'jiang-yueheng': { P_FIRST_POT: ['还挺漂亮。也就多看了一眼。', '第一颗而已，我可没认输。', '进了。刚才那杆，我看清了。'], P_ONE: ['这杆确实可以。', '我还没上手，别急着得意。', '这颗好看。我承认。'] },
  'zhou-mubai': { P_FIRST_POT: ['第一颗进了，先记住这次出手。', '开张了。按自己的节奏继续。', '进球了，先不用急着抬杆。'], P_ONE: ['这一杆处理得清楚。', '给自己一点看下一杆的时间。', '这一杆瞄得挺稳。'] },
  'xie-linyu': { P_FIRST_POT: ['好球！我还等着跟你较量呢。', '开张了？好，我认真了。', '第一颗是你的，我可得追了。'], P_ONE: ['这杆值得我认真接招。', '先别看我，看你的下一颗。', '痛快。就等你打这样的球。'] },
  'pei-zhixu': { P_FIRST_POT: ['好球。袋口终于干了件正事。', '这就开张了？我往后稍稍。', '开张了。看来我没法偷懒。'], P_ONE: ['我刚想预测，球已经进了。', '我先不发表意见，免得说早了。', '好球。看来我还得多等一会儿。'] },
  'song-yucheng': { P_FIRST_POT: ['呀，进啦！给你拍拍手。', '第一颗！我也跟着有精神啦。', '第一颗进啦！你听，咚的一声。'], P_ONE: ['这颗我看见啦！', '我先把欢呼收一收，你继续。', '这声真好听，再进一颗吧！'] },
  'xu-qinghe': { P_FIRST_POT: ['进了呀。刚才那一下，真舒服。', '第一颗收好了。慢慢来。', '开张了，我在旁边看着。'], P_ONE: ['清清爽爽的一杆。', '真舒服，我还想看你打。', '我不催，等你的下一杆。'] },
};

// Alternative rule endings keep the precise foul/group fact outside the authored voice.
export const VOICE_RULE_TURNS: Record<string, readonly [string, string]> = {
  'shen-yubai': ['我来接，你歇口气。', '接下来，请你出杆。'],
  'lu-jingchen': ['换我打，你歇一下。', '该你了，看准再出手。'],
  'wen-xingye': ['这回轮到我上场啦！', '你来接棒，我退到台边！'],
  'gu-yanchuan': ['换我。', '到你。'],
  'jiang-yueheng': ['这杆归我，可没占你便宜。', '到你了，我可没放水。'],
  'zhou-mubai': ['换我来，你先看一杆。', '现在轮到你，先看清再打。'],
  'xie-linyu': ['我的机会来了。', '你的机会，接好了。'],
  'pei-zhixu': ['换我了，我正好活动一下。', '该你了，我的借口先收着。'],
  'song-yucheng': ['我来啦，你等我一下！', '轮到你啦，我看着！'],
  'xu-qinghe': ['那我慢慢打，你歇一会儿。', '换你啦，别着急。'],
};

// The short reaction leaves room for the actual foul or turn in the same bubble.
export const VOICE_OPPONENT_BALL_POTTED: Record<string, readonly [string, string]> = {
  'shen-yubai': ['承情，你替我进球了。', '你送的好球，我收了。'],
  'lu-jingchen': ['你替我进了一颗，谢了。', '你撞进我这颗了，记下。'],
  'wen-xingye': ['你还管送球到袋啊！', '你替我进球，服务周到！'],
  'gu-yanchuan': ['你替我进了。谢了。', '你的顺手球，我收了。'],
  'jiang-yueheng': ['你替我进了？算我欠你。', '你这一送，我可收了。'],
  'zhou-mubai': ['你把我那颗带进啦。', '你刚替我收下一球。'],
  'xie-linyu': ['你这份进球礼，我收。', '你送进的球，我记着！'],
  'pei-zhixu': ['你替我进球，省我出工。', '你把我那颗提前下班了。'],
  'song-yucheng': ['你帮我进球啦，好惊喜！', '你送我进球耶，谢啦！'],
  'xu-qinghe': ['你顺手送我一球呢。', '你把我那颗送到家啦。'],
  f01: ['你替我进球了，谢谢呀。', '你送的这颗，我收下啦。'],
  f02: ['你帮我进球啦！哇塞！', '铛铛！谢谢你帮我进球！'],
  f03: ['你碰进了我的球。谢谢。', '你带进我那颗了。嗯。'],
  f04: ['你送我的球回家啦。', '咦，你把我那颗哄进啦。'],
  f05: ['你替本小姐进啦？多谢。', '哼，你送的球我收啦。'],
  f06: ['你把我这颗也算进去了。', '你一送，我提前交卷。'],
  f07: ['你替我进了！我接这礼。', '你这球送得爽快，谢啦！'],
  f08: ['你帮我进啦？够朋友！', '你还替我打球呢？谢啦！'],
  f09: ['你替我的球谢幕啦！', '你把我这颗送下台啦！'],
  f10: ['你送我一球，像茶会礼。', '你替我进了，真走运。'],
  m01: ['你替我进球了，承情。', '你这份薄礼，我收下了。'],
  m02: ['你替我进啦？够大方！', '你送进这颗，谢啦！'],
  m03: ['你还顺手替我进球啦。', '你替我进啦，谢你呀。'],
  m04: ['你那条线，进了我的球。', '你这条球路，我也有份。'],
  m05: ['你替我收了这一球。', '你送进那颗了。我记得。'],
  m06: ['你这记助攻，我接住啦！', '你帮我进球啦，击掌！'],
  m07: ['你替我进球？这主意妙。', '你这杆，顺带送我一球。'],
  m08: ['你替我打了？省我起身。', '你送球到袋，谢啦。'],
  m09: ['你替我进球了。多谢。', '你送进我的球。记着了。'],
  m10: ['你送我一球，像颗星。', '你替我进了，多谢好意。'],
};

export const VOICE_STREAK_LINES: Record<string, Partial<Record<keyof typeof import('./companion-dialogue-bank').SHOT_PROGRESS_LINES, string>>> = {
  quiet: {
    P_STREAK_2: '两杆都进。漂亮。',
    P_STREAK_3: '第三杆也收得干脆。',
    P_STREAK_4: '四杆。还真让你打顺了。',
    P_NEAR_CLEAR: '你还有一颗。稳着来。',
    P_EIGHT_READY: '这组你收完了。黑八见。',
    N_STREAK_2: '嗯。我接上了。',
    N_STREAK_3: '第三杆落袋。',
    N_STREAK_4: '四杆了。看下一颗。',
  },
  lively: {
    P_STREAK_2: '两杆连上！给你拍拍手。',
    P_STREAK_3: '第三杆也进？我快坐不住啦！',
    P_STREAK_4: '哇哇，四杆！你也太厉害了吧！',
    P_NEAR_CLEAR: '你快把这组扫光啦！只差一颗！',
    P_EIGHT_READY: '你要赢啦！黑八就差这一杆！',
    N_STREAK_2: '嘿，我也接上两杆啦！',
    N_STREAK_3: '袋口今天给我开了门呀！',
    N_STREAK_4: '四杆！让我偷乐一下。',
  },
  f05: {
    P_STREAK_2: '你都连进两杆了？行，漂亮。',
    P_STREAK_3: '第三杆也进？本小姐得认真看了。',
    P_STREAK_4: '四杆了！哼，你这回确实厉害。',
    P_NEAR_CLEAR: '你只剩一颗了。本小姐有点紧张。',
    P_EIGHT_READY: '黑八都归你瞄了。好吧，真帅。',
    N_STREAK_2: '哼，本小姐也接上两杆了。',
    N_STREAK_3: '第三杆了，我可没手软。',
    N_STREAK_4: '咦，四杆了？我都顾不上数。',
  },
};

// Explicit motifs catch near-synonym loops across scenes; this is editorial metadata, not NLP.
export function dialogueMotif(scene: string, text: string): string {
  if (['OPEN_PLAYER', 'REMATCH'].includes(scene)) return `opening:${text}`;
  if (scene.includes('_STREAK_')) return `${scene}:${text}`;
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
