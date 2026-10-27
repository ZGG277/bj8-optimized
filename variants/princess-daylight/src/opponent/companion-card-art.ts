import shen from '../assets/companion-cards/shen-yubai.webp';
import lu from '../assets/companion-cards/lu-jingchen.webp';
import wen from '../assets/companion-cards/wen-xingye.webp';
import gu from '../assets/companion-cards/gu-yanchuan.webp';
import jiang from '../assets/companion-cards/jiang-yueheng.webp';
import zhou from '../assets/companion-cards/zhou-mubai.webp';
import xie from '../assets/companion-cards/xie-linyu.webp';
import pei from '../assets/companion-cards/pei-zhixu.webp';
import song from '../assets/companion-cards/song-yucheng.webp';
import xu from '../assets/companion-cards/xu-qinghe.webp';

/** Expressions belong to the collectible card; match avatars retain their accepted portraits. */
export const COMPANION_CARD_ART: Record<string, { src: string; expression: string; praise: string }> = {
  'shen-yubai': { src: shen, expression: '温柔赞许', praise: '公主的这一杆，漂亮得让我移不开眼。' },
  'lu-jingchen': { src: lu, expression: '脸红心服', praise: '输给公主，我连心跳都慢了半拍。' },
  'wen-xingye': { src: wen, expression: '笑眼喝彩', praise: '公主也太厉害了！这一局，我心服口服。' },
  'gu-yanchuan': { src: gu, expression: '挑眉惊艳', praise: '这一步走位，公主比我想得还要漂亮。' },
  'jiang-yueheng': { src: jiang, expression: '含笑致意', praise: '公主赢得从容，连这座城堡都该为你喝彩。' },
  'zhou-mubai': { src: zhou, expression: '眉眼含笑', praise: '原来最让人心动的，是公主认真赢球的样子。' },
  'xie-linyu': { src: xie, expression: '俏皮眨眼', praise: '这一局归公主。下一局，也请继续惊艳我。' },
  'pei-zhixu': { src: pei, expression: '低眉浅笑', praise: '我想了许多夸奖，见到公主却只会笑了。' },
  'song-yucheng': { src: song, expression: '惊喜赞叹', praise: '这球也能进？公主，你又给了我一个惊喜。' },
  'xu-qinghe': { src: xu, expression: '颔首钦佩', praise: '准度和气度，公主都赢得漂亮。' },
};
