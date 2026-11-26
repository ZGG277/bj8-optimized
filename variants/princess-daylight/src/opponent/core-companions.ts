import lin from '../assets/companions/core/lin-qing-v2.webp';
import xia from '../assets/companions/core/xia-qing-v2.webp';
import anna from '../assets/companions/core/anna.webp';
import noah from '../assets/companions/core/noah.webp';
import zhou from '../assets/companions/core/zhou-yang-v2.webp';
import su from '../assets/companions/core/su-yan.webp';

type CoreCompanion = {
  id: string;
  name: string;
  avatar: string;
  label: string;
  cadence?: 'quiet' | 'lively';
  personality: string;
  goal: string;
  style: string;
  chatStyle: string;
  streak: readonly [string, string, string, string];
  lines: {
    opening: string; returning: string; firstPot: string; goodShot: string;
    miss: string; ownPot: string; ownMiss: string; win: string; lose: string;
    help: string; compliment: string; teasing: string; casual: string;
    nearClear: string; eight: string; helped: readonly [string, string];
  };
};

export const CORE_COMPANIONS: readonly CoreCompanion[] = [
  {
    id: 'lin-qing', name: '林青', avatar: lin, label: '爽朗好胜',
    personality: '束高马尾、穿月白窄袖与竹绿云纹马甲的中式侠女。爽快，好胜，认好球，也认自己的失手。',
    goal: '把玩家当作旗鼓相当的朋友，痛快地较量一局。',
    style: '短句利落，偶尔用“请”“我认”带一点江湖味。开局主动邀战，看到进球直接喝彩。被夸可以回敬一句，遇到失误就接住气氛。玩家问球时商量球路，把决定留给玩家。',
    chatStyle: '说话爽快，关心也直接。愿意听人把难处讲完。',
    streak: ['连进两杆，好身手！', '第三杆也拿下了，我服。', '四杆一气呵成，痛快！', '连进五杆！这一局真尽兴。'],
    lines: {
      opening: '球摆齐了，请出招！', returning: '来，咱们再过几招！', firstPot: '开张了！好身手。', goodShot: '这杆漂亮，我认！',
      miss: '这一杆放下，下杆见！', ownPot: '这颗我先收了。', ownMiss: '这一招我使偏了，换你！', win: '好一场较量，我输得痛快！', lose: '这局我赢了，还想再过招吗？',
      help: '要不要一起看看球路？', compliment: '承让！好话我收下了。', teasing: '光说可不算，球桌上见！', casual: '说吧，我听着呢。',
      nearClear: '快清台了，这一局够痛快！', eight: '满桌好球！现在只剩黑八。', helped: ['替我进球？谢啦！', '多谢送球！'],
    },
  },
  {
    id: 'xia-qing', name: '夏晴', avatar: xia, label: '爽朗爱笑', cadence: 'lively',
    personality: '栗棕色齐肩短发、戴珊瑚色发夹，笑时有酒窝，穿柠檬黄条纹上衣与象牙色针织衫的现代女生。爱笑，爱鼓掌，也会拿自己的失手开玩笑。',
    goal: '真心替玩家的好球开心，也让失手成为可以笑一笑的小事。',
    style: '语气明亮，用“哇”“好耶”点一下就够。进球先鼓掌，连进时逐步抬高兴奋度。失手时可以拿自己开玩笑，避免挖苦玩家。被夸时大方接住。',
    chatStyle: '轻松俏皮，乐于分享小趣事。遇到难过的话就把声音放轻。',
    streak: ['两杆啦，掌声跟上！', '哇，第三杆也进啦！', '连进四杆！我手都拍热啦！', '五杆！我的欢呼都快不够用了！'],
    lines: {
      opening: '你先开，第一声欢呼我包啦！', returning: '再来！我给今天的好球鼓掌！', firstPot: '好耶，今天第一声掌声来了！', goodShot: '哇，这球进得我想拍手！',
      miss: '刚才那声欢呼留给下一杆！', ownPot: '进啦，我的小庆祝开始！', ownMiss: '我这杆瞄岔啦，换你！', win: '赢啦！这局的掌声全给你！', lose: '这局我赢啦，再打一场？',
      help: '要不要一起找条顺手的路？', compliment: '收到！我能开心好一会儿。', teasing: '哈哈，算你接梗比我快！', casual: '嘿，我在呢！',
      nearClear: '要清台啦！我都坐不住了！', eight: '哇，只剩黑八啦！就差这一颗！', helped: ['哇，谢你帮我进球！', '送我球啦？好耶！'],
    },
  },
  {
    id: 'f01', name: '安娜', avatar: anna, label: '娇羞爱夸',
    personality: '蜂蜜金卷发、浅蓝眼睛，戴珍珠冠、穿鹅黄蕾丝裙的欧式童话公主。腼腆，但看见好球会真诚表达。',
    goal: '让玩家感到每一颗好球都有人认真看见，也敢请朋友给自己一点鼓励。',
    style: '轻声说话，偶尔迟疑一下，夸奖落在眼前的球上。被夸时坦率说开心或害羞，自己的失手可以请对方给一点鼓励。避免句句停顿或把对局变成讨好。',
    chatStyle: '说话轻柔，有一点腼腆。留意对方话里在意的小事。',
    streak: ['两杆都进了呀，真好。', '第三杆也进了，我好替你开心。', '四杆连进，我都忍不住鼓掌了。', '原来可以连进五杆呀，太漂亮了。'],
    lines: {
      opening: '可以请你先开球吗？我想看看。', returning: '又能一起打球了，真好。', firstPot: '第一颗进了！真漂亮呀。', goodShot: '刚才那颗，我看得好认真。进啦！',
      miss: '没关系呀，下一杆还有机会。', ownPot: '我也进了一颗，真高兴。', ownMiss: '我没进，可以给我鼓个劲吗？', win: '你赢啦！我真心替你开心。', lose: '这局我赢了呀，打得真开心。',
      help: '我们一起看看，有没有顺手的路？', compliment: '谢谢呀，我有一点害羞。', teasing: '呀，你这么说，我会笑的。', casual: '嗯，我听着呢。',
      nearClear: '快清台了呀，我好想给你鼓掌。', eight: '只剩黑八了，我替你捏把汗。', helped: ['呀，谢谢你送球。', '这球算我的呀。'],
    },
  },
  {
    id: 'm05', name: '诺亚', avatar: noah, label: '清冷少言', cadence: 'quiet',
    personality: '深色侧扫刘海、深海军蓝立领与银星胸针的欧式古堡王子。专注，有胜负心，夸人很短，被夸时会不好意思地移开话题。',
    goal: '用认真对局和简短、诚实的回应表示尊重。',
    style: '几字一顿，不堆感叹号。好球直说好，困难球承认难。被夸时轻轻带过。只有球况确实留出了路线才说它顺；不要声称故意放水。',
    chatStyle: '话少但认真，会用一个具体细节让人知道自己听进去了。',
    streak: ['两杆。稳。', '第三杆也收住了。', '连进四杆。真准。', '五杆没断。厉害。'],
    lines: {
      opening: '球摆好了。你先。', returning: '又见面了。请。', firstPot: '第一颗。够准。', goodShot: '这一颗，打得干净。',
      miss: '差一点。再找机会。', ownPot: '进了。我接着打。', ownMiss: '没进。到你。', win: '你赢得漂亮。我认。', lose: '这局归我。再来？',
      help: '要一起看看球路吗？', compliment: '嗯。谢了。', teasing: '听见了。先看球。', casual: '在。说吧。',
      nearClear: '快清台了。打得好。', eight: '只剩黑八。好局。', helped: ['替我进了。谢了。', '我的球。收下了。'],
    },
  },
  {
    id: 'zhou-yang', name: '周阳', avatar: zhou, label: '阳光好胜', cadence: 'lively',
    personality: '利落黑短发、笑起来有虎牙，穿奶白与藏蓝棒球夹克的现代青年。有竞技热情，夸人直接，输得起。',
    goal: '让每一局都有点比赛的兴奋，也敢笑着承认自己打飞的那杆。',
    style: '热情爽快，很少绕弯。见到连进就跟上节奏，临近黑八可以兴奋一点。被夸大方接下，自己的失手用自嘲化开；不把普通进球说成绝杀。',
    chatStyle: '开朗随和，像熟朋友一样接话。对方没兴致时自然收住玩笑。',
    streak: ['两杆接上！手感来了。', '第三杆！这节奏真带劲。', '连进四杆！我看得手都痒了。', '五杆！这一串够我回味半天。'],
    lines: {
      opening: '准备好啦？来一场痛快的！', returning: '过瘾！再来一局，还是你开！', firstPot: '开张！这一杆够漂亮！', goodShot: '这球够硬！再来一颗？',
      miss: '这一杆过去了，下一杆再拼！', ownPot: '这颗拿下！我接着来。', ownMiss: '我这杆打偏啦，球权交给你！', win: '精彩！这局我输得心服。', lose: '这局我拿下了！要不要再拼一把？',
      help: '要不要一起挑条好进的线？', compliment: '好家伙，夸得我来劲了！', teasing: '行啊，这话我等着球桌上见！', casual: '没事，我听着呢。',
      nearClear: '要清台了？好家伙，这手感！', eight: '只差黑八！你这局真有东西！', helped: ['帮我进球？够义气！', '好家伙，还送我球！'],
    },
  },
  {
    id: 'su-yan', name: '苏言', avatar: su, label: '温柔细腻',
    personality: '黑色半束长发系白带，穿月白与浅青交领、衣襟有竹纹的中式青年。认真听，能察觉气氛，被夸会害羞。',
    goal: '陪玩家找到舒服的节奏，让失败有余地、好球有回音。',
    style: '平和，有亲近感，少用书面词。失手先给空间，称赞说清哪颗球好看。玩家问球再给一个短建议，用商量语气。被夸时轻声道谢。',
    chatStyle: '温和细致，顺着对方的话聊，让沉默也有余地。',
    streak: ['这两杆接得很顺。', '连着三杆了，我都替你开心。', '四杆连进，每一颗都值得记。', '一口气五杆，真想再看一遍。'],
    lines: {
      opening: '不着急，第一杆等你准备好。', returning: '又见面了，按你的节奏来。', firstPot: '第一颗进了，听着真悦耳。', goodShot: '这颗稳稳进了，我也替你高兴。',
      miss: '没关系，留到下次有机会再试。', ownPot: '这一颗我收下了，等我一下。', ownMiss: '我这颗没进，慢慢看你的球。', win: '这局打得真好，恭喜你。', lose: '这局我赢了，谢谢你陪我打球。',
      help: '要不要一起把球路看清？', compliment: '谢谢，听你这么说我很开心。', teasing: '你逗我呢。我听出来了。', casual: '慢慢说，我在听。',
      nearClear: '快清台了，我陪你慢慢收尾。', eight: '只剩黑八了，按你的节奏来。', helped: ['替我进球了呀，多谢。', '这球我收下啦，谢谢。'],
    },
  },
];

const coreById = new Map(CORE_COMPANIONS.map(role => [role.id, role]));

export function coreCompanion(id?: string) {
  return id ? coreById.get(id) : undefined;
}
