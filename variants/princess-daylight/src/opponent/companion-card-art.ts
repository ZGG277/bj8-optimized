import linCore from '../assets/companion-cards/core/lin-qing-hd.webp';
import xiaCore from '../assets/companion-cards/core/xia-qing-hd.webp';
import annaCore from '../assets/companion-cards/core/anna-hd.webp';
import noahCore from '../assets/companion-cards/core/noah-hd.webp';
import zhouCore from '../assets/companion-cards/core/zhou-yang-hd.webp';
import suCore from '../assets/companion-cards/core/su-yan-hd.webp';
import linCard from '../assets/companion-cards/core/lin-qing.webp';
import xiaCard from '../assets/companion-cards/core/xia-qing.webp';
import annaCard from '../assets/companion-cards/core/anna.webp';
import noahCard from '../assets/companion-cards/core/noah.webp';
import zhouCard from '../assets/companion-cards/core/zhou-yang.webp';
import suCard from '../assets/companion-cards/core/su-yan.webp';

import { STORYBOOK_COMPANIONS } from './storybook-companions';
import { CORE_COMPANIONS, coreCompanion } from './core-companions';

// Retired companions only appear on old cards, which render a circular portrait.
const archiveArt = import.meta.glob<string>('../assets/companion-cards/archive/*.webp', { eager: true, import: 'default' });
const archivePortrait = (id: string) => archiveArt[`../assets/companion-cards/archive/${id}.webp`];
const storybookCards = Object.fromEntries(Object.entries(STORYBOOK_COMPANIONS).filter(([id]) => !coreCompanion(id)).map(([id, role]) => [id, {
  src: archivePortrait(id),
  expression: role.description,
  praise: role.lines.goodShot,
}]));
export const CORE_WELCOME_ART: Readonly<Partial<Record<string, string>>> = {
  'lin-qing': linCore, 'xia-qing': xiaCore, f01: annaCore,
  m05: noahCore, 'zhou-yang': zhouCore, 'su-yan': suCore,
};
const coreCards: Record<string, string> = {
  'lin-qing': linCard, 'xia-qing': xiaCard, f01: annaCard,
  m05: noahCard, 'zhou-yang': zhouCard, 'su-yan': suCard,
};

/** Portrait crops for collectible cards. */
export const COMPANION_CARD_ART: Record<string, { src: string; expression: string; praise: string }> = {
  ...storybookCards,
  'shen-yubai': { src: archivePortrait('shen-yubai'), expression: '温柔赞许', praise: '公主的这一杆，漂亮得让我移不开眼。' },
  'lu-jingchen': { src: archivePortrait('lu-jingchen'), expression: '脸红心服', praise: '输给公主，我连心跳都慢了半拍。' },
  'wen-xingye': { src: archivePortrait('wen-xingye'), expression: '笑眼喝彩', praise: '公主也太厉害了！这一局，我心服口服。' },
  'gu-yanchuan': { src: archivePortrait('gu-yanchuan'), expression: '挑眉惊艳', praise: '这一步走位，公主比我想得还要漂亮。' },
  'jiang-yueheng': { src: archivePortrait('jiang-yueheng'), expression: '含笑致意', praise: '公主赢得从容，连这座城堡都该为你喝彩。' },
  'zhou-mubai': { src: archivePortrait('zhou-mubai'), expression: '眉眼含笑', praise: '原来最让人心动的，是公主认真赢球的样子。' },
  'xie-linyu': { src: archivePortrait('xie-linyu'), expression: '俏皮眨眼', praise: '这一局归公主。下一局，也请继续惊艳我。' },
  'pei-zhixu': { src: archivePortrait('pei-zhixu'), expression: '低眉浅笑', praise: '我想了许多夸奖，见到公主却只会笑了。' },
  'song-yucheng': { src: archivePortrait('song-yucheng'), expression: '惊喜赞叹', praise: '这球也能进？公主，你又给了我一个惊喜。' },
  'xu-qinghe': { src: archivePortrait('xu-qinghe'), expression: '颔首钦佩', praise: '准度和气度，公主都赢得漂亮。' },
  ...Object.fromEntries(CORE_COMPANIONS.map(role => [role.id, {
    src: coreCards[role.id],
    expression: role.label,
    praise: role.lines.win,
  }])),
};
