/*
[INPUT]: 本局固定陪练身份与真实进球/思考情境
[OUTPUT]: 十位陪练各自的简短台词；不生成无关解释或虚构成绩
[POS]: 情感化呈现纯数据层；不参与 AI 和规则
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { companionFor } from './companions';
const LINES: Record<string, { pot: string; thinking: string }> = {
  'shen-yubai': { pot: '这一杆，稳得漂亮', thinking: '容我想一杆' },
  'lu-jingchen': { pot: '公主，这杆真漂亮', thinking: '这条球路有点意思' },
  'wen-xingye': { pot: '好球！再来一颗', thinking: '让我找个好角度' },
  'gu-yanchuan': { pot: '落点很准', thinking: '先看清这一杆' },
  'jiang-yueheng': { pot: '这一球，恰到好处', thinking: '慢一点，看准再出手' },
  'zhou-mubai': { pot: '看见你的进步了', thinking: '别急，我想一想' },
  'xie-linyu': { pot: '这一杆，有你的风格', thinking: '换条球路试试' },
  'pei-zhixu': { pot: '漂亮，节奏正好', thinking: '下一球该留在哪里' },
  'song-yucheng': { pot: '好球，我为你喝彩', thinking: '这一杆，认真一点' },
  'xu-qinghe': { pot: '清清爽爽的一杆', thinking: '让我静静看一眼' },
};
export function companionMomentLine(id: string | undefined, moment: 'pot' | 'thinking'): string {
  return LINES[companionFor(id).id][moment];
}
