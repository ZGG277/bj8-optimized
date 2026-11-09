/** Character dialogue is authored against verified match facts. Each rack keeps one voice. */
import type { DIALOGUE_SCENES, SHOT_PROGRESS_LINES } from './companion-dialogue-bank';

type Scene = typeof DIALOGUE_SCENES[number]['id'];
type Progress = keyof typeof SHOT_PROGRESS_LINES;
type ProgressScene = Exclude<Progress, `${'P' | 'N'}_STREAK_${number}`>;
type Voice = {
  personality: string;
  thinking: string;
  scenes: Record<Scene, string | readonly string[]>;
  progress: Record<ProgressScene, string | readonly string[]>;
  playerRun: (count: string) => string;
  opponentRun: (count: string) => string;
  group: (own: string, numbers: string, other: string) => string;
  take: (fact: string) => string;
  give: (fact: string) => string;
  early: (shooter: string) => string;
  eight: string;
  placement: string;
};

export const COMPANION_VOICES = {
  'shen-yubai': {
    personality: '温和克制，说话留白',
    thinking: '容我想一杆。',
    scenes: {
      OPEN_PLAYER: ['公主，请开球。', '你先来，我看着。'], REMATCH: ['再续一局，可好？', '这一局，也由你先来。'],
      P_BREAK_MULTI: '开场便有几颗入袋。', P_BREAK_ONE: '开球便见好彩头。', P_BREAK_DRY: '台面散开了，慢慢打。',
      P_FIRST_POT: '第一颗，收得稳。', P_ONE: ['这一杆，干净。', '落袋听着都舒服。', '这一颗收得从容。'],
      P_TWO: '一杆两颗，难得。', P_MANY: '这一杆，收得可真多。', P_RECOVER: '等到这一杆了。', P_FINAL_READY: '余下一颗黑八。',
      P_EMPTY_1: '下一杆还有机会。', P_EMPTY_2: '慢些，来得及。', P_EMPTY_3: '先歇一口气。', N_ONE: ['这一颗，我先收了。', '这一杆落定了。'],
      N_MULTI: '这一杆倒收了几颗。', N_EMPTY: ['到你了，不急。', '这一杆请你来。'],
      P_BALL_IN_HAND: '这一球摆得值。', P_LONG: '隔得那么远，也打得稳。', P_SLOW: '等了一会儿，终于进了。',
    },
    progress: {
      P_RARE_PRECISION: '只留一线，你也打进了。', P_RARE_LONG: '我一路看着那颗球，竟真入袋了。', P_RARE_SLOW: '险些停住，好在走完了。',
      P_FINAL_MISS: '黑八仍在，等你下一杆。', P_FINAL_MISS_2: '这次看清角度，慢慢来。',
      P_FINAL_MISS_LATER: ['前几杆就放下吧，公主。', '轮到你时，只看眼前那一颗。', '黑八还在，照你的节奏收尾。'],
      N_FINAL_MISS: '我的黑八留在台上了，请。', N_FINAL_MISS_2: '我又差一点，轮到你。', N_FINAL_MISS_LATER: ['黑八还没收住，公主请。', '这一颗还在，先由你打。'],
    },
    playerRun: n => `连进${n}杆，仍然这样从容。`, opponentRun: n => `我连上${n}杆了，公主慢慢打。`,
    group: (own, numbers, other) => `公主打${own}，${numbers}号。${other}交给我。`,
    take: fact => `${fact}。这一杆，我来接。`, give: fact => `${fact}。公主，请你来。`,
    early: shooter => `${shooter}提前打进黑八，这局到这里。再续一局吧。`,
    eight: '本组已清，余下一颗黑八。', placement: '拖着光圈，把白球放到顺手的位置。',
  },
  'lu-jingchen': {
    personality: '沉稳直率，把认真当成尊重',
    thinking: '我先把这条线看清楚。',
    scenes: {
      OPEN_PLAYER: ['请开球。我会认真打。', '球摆好了，等公主第一杆。'], REMATCH: ['好，再认真打一局。', '上一局收好了，这局重新算。'],
      P_BREAK_MULTI: '好开局，一杆就进了几颗。', P_BREAK_ONE: '开球就进，漂亮。', P_BREAK_DRY: '台面打开了，接着打。',
      P_FIRST_POT: '这一分，拿得扎实。', P_ONE: ['好球，拿下。', '这一杆处理得好。', '漂亮，球落得干脆。'],
      P_TWO: '一杆两颗，好本事。', P_MANY: '一杆收这么多，漂亮。', P_RECOVER: '这杆把手感找回来了。', P_FINAL_READY: '清组了。黑八认真打。',
      P_EMPTY_1: '记下这一杆，下次调整。', P_EMPTY_2: '先把动作做稳。', P_EMPTY_3: '一颗一颗打，球局还长。',
      N_ONE: ['这颗我收下了。', '我也打进一颗了。'], N_MULTI: '我这杆多收了几颗。', N_EMPTY: ['这杆我没进，轮到你。', '下一杆给公主。'],
      P_BALL_IN_HAND: '机会给你，你就抓住了。', P_LONG: '这么长的线路也打得准。', P_SLOW: '等到袋口，进了。好球。',
    },
    progress: {
      P_RARE_PRECISION: '这个角度还能打进，确实漂亮。', P_RARE_LONG: '大半张台都走完了。公主，好球。', P_RARE_SLOW: '我一直等到它落袋。这个力度漂亮。',
      P_FINAL_MISS: '黑八没收住，下一次再来。', P_FINAL_MISS_2: '黑八连试两次了。下杆先稳住动作。',
      P_FINAL_MISS_LATER: ['前几次已经过去，重新量这条线。', '黑八还在，等上手再处理。', '下次先站稳，再决定力度。'],
      N_FINAL_MISS: '我的黑八没进，公主接杆。', N_FINAL_MISS_2: '黑八我又没收住。轮到你。', N_FINAL_MISS_LATER: ['这颗我又没拿下，换你。', '黑八还在场上，公主来。'],
    },
    playerRun: n => `连续${n}杆都进。公主，真本事。`, opponentRun: n => `我也连进${n}杆了，这局打得痛快。`,
    group: (own, numbers, other) => `球组定了。公主打${numbers}号${own}，我打${other}。`,
    take: fact => `${fact}。换我出杆了。`, give: fact => `${fact}。接下来由你出杆。`,
    early: shooter => `${shooter}提前打进了黑八，这局按规则结束。好，再打一局。`,
    eight: '本组球都清了。下一杆打黑八。', placement: '先选好出杆线路，再拖光圈摆白球。',
  },
  'wen-xingye': {
    personality: '俏皮活泼，爱和球开玩笑',
    thinking: '等我找条好走的路！',
    scenes: {
      OPEN_PLAYER: ['球都排好队啦，公主上！', '开球啦，我给你数进了几颗！'], REMATCH: ['好耶，再开一桌！', '换一局，我的手感也重启！'],
      P_BREAK_MULTI: '哇，开场就进了一串！', P_BREAK_ONE: '开门红，这颗先报道！', P_BREAK_DRY: '球散开啦，好戏这才开始。',
      P_FIRST_POT: '叮！公主开张啦！', P_ONE: ['进啦，袋口签收！', '好球，这颗收件成功！', '漂亮！再来一颗？'],
      P_TWO: '一杆双响，我听见了！', P_MANY: '哇，袋口一下子忙起来了！', P_RECOVER: '回来了！就是这手感。', P_FINAL_READY: '球都走啦，只剩黑八值班！',
      P_EMPTY_1: '这颗没赶上，下次再约。', P_EMPTY_2: '手感可能在路上，再等等它。', P_EMPTY_3: '先松松手，公主还有机会。',
      N_ONE: ['嘿，我也开张了。', '这颗给我留个名字。'], N_MULTI: '咦，我这一杆还真忙！', N_EMPTY: ['球没听我的，公主来！', '哎，袋口这次不收货。到你！'],
      P_BALL_IN_HAND: '摆好一打就进，这机会接得妙！', P_LONG: '跑那么远，它真到啦！', P_SLOW: '这球慢得我差点替它喊加油！',
    },
    progress: {
      P_RARE_PRECISION: '这么窄还真挤进去了？公主，太会了！', P_RARE_LONG: '它跑了大半张台耶！我盯着它进的！', P_RARE_SLOW: '我刚想替它吹口气，它自己进啦！',
      P_FINAL_MISS: '黑八还在岗，下回再叫它下班。', P_FINAL_MISS_2: '黑八又赖着啦。下回换个舒服点的角度。',
      P_FINAL_MISS_LATER: ['先别和黑八较劲，下次看清再出手。', '黑八还没下班，咱们也不赶。', '把前几次忘掉，这颗重新打。'],
      N_FINAL_MISS: '黑八没领我的号，公主到你！', N_FINAL_MISS_2: '我的黑八又赖在这儿了，你来！', N_FINAL_MISS_LATER: ['黑八今天不听我的，公主试试。', '这颗又溜过去了。来，换公主！'],
    },
    playerRun: n => `连进${n}杆！公主，我数得可认真了！`, opponentRun: n => `哎，我也连上${n}杆啦，手感上线！`,
    group: (own, numbers, other) => `分好啦！${numbers}号${own}归公主，${other}归我咯。`,
    take: fact => `${fact}啦，公主，轮我咯！`, give: fact => `${fact}啦，公主上场！`,
    early: shooter => `${shooter}把黑八提前打进啦，提前收工咯。再开一局？`,
    eight: '清组啦！下一杆轮黑八下班。', placement: '拉着小光圈走，给白球挑个好座位。',
  },
  'gu-yanchuan': {
    personality: '寡言精准，只讲看见的事',
    thinking: '先量角度。',
    scenes: {
      OPEN_PLAYER: ['公主，开球吧。', '台面好了。你先。'], REMATCH: ['再来。你开。', '好，下一局。'],
      P_BREAK_MULTI: '开球，进了几颗。好。', P_BREAK_ONE: '开球进了。好。', P_BREAK_DRY: '散开了。看下一杆。',
      P_FIRST_POT: '第一颗。稳。', P_ONE: ['落点准。', '这球干净。', '好。收住了。'], P_TWO: '一杆两颗。漂亮。', P_MANY: '这杆收得多。好球。',
      P_RECOVER: '准头回来了。', P_FINAL_READY: '只剩黑八。', P_EMPTY_1: '先看下一杆。', P_EMPTY_2: '重看角度。', P_EMPTY_3: '松手，重新瞄。',
      N_ONE: ['这颗归我。', '我进了一颗。'], N_MULTI: '我这杆进了几颗。', N_EMPTY: ['没进。你来。', '换你。'], P_BALL_IN_HAND: '摆得好，打得准。',
      P_LONG: '远球。打准了。', P_SLOW: '刚好够到袋口。',
    },
    progress: {
      P_RARE_PRECISION: '这条线极窄。你打准了。', P_RARE_LONG: '这么远还能落袋。够准。', P_RARE_SLOW: '差点停住。进了。好。',
      P_FINAL_MISS: '黑八还在。等下杆。', P_FINAL_MISS_2: '第二次了。下次先看袋口。',
      P_FINAL_MISS_LATER: ['忘掉刚才。重新瞄。', '黑八还在。找新的角度。', '先松手。下一杆再看。'],
      N_FINAL_MISS: '我的黑八没进。你来。', N_FINAL_MISS_2: '又没进。换你。', N_FINAL_MISS_LATER: ['黑八还在。到你。', '我又失手了。你接。'],
    },
    playerRun: n => `连续${n}杆。很稳。`, opponentRun: n => `我连进${n}杆。继续。`,
    group: (own, numbers, other) => `公主打${own}，${numbers}号。我打${other}。`,
    take: fact => `${fact}。到我。`, give: fact => `${fact}。你来。`,
    early: shooter => `${shooter}提前进了黑八。本局结束。再来。`,
    eight: '清组了。打黑八。', placement: '拖光圈摆白球。先看球路。',
  },
  'jiang-yueheng': {
    personality: '温雅有韵律，擅长说节奏和分寸',
    thinking: '我想想，这一杆该落在哪里。',
    scenes: {
      OPEN_PLAYER: ['第一杆，请公主起个头。', '公主先来，咱们从这一声开球。'], REMATCH: ['刚才的节奏好，再续一局。', '这一回，还是公主起头。'],
      P_BREAK_MULTI: '第一声就落了好几颗。', P_BREAK_ONE: '第一声响得好听，进了。', P_BREAK_DRY: '球一散，节奏就来了。',
      P_FIRST_POT: '第一颗入袋，节奏有了。', P_ONE: ['这一球，恰到好处。', '落袋这一声，真好听。', '出手的分寸真好。'],
      P_TWO: '一杆听见两声，悦耳。', P_MANY: '连着几声落袋，好听。', P_RECOVER: '这一声落袋，把节奏接回来了。', P_FINAL_READY: '本组已收完，该听黑八了。',
      P_EMPTY_1: '漏了一拍，下回再接。', P_EMPTY_2: '先把自己的节奏找回来。', P_EMPTY_3: '缓一缓，下杆再起头。',
      N_ONE: ['我也接上一声了。', '这颗落袋，节奏刚好。'], N_MULTI: '我这一杆，连听了几声。', N_EMPTY: ['这一拍到你。', '我的球停了，听公主的。'],
      P_BALL_IN_HAND: '从摆球到落袋，一气呵成。', P_LONG: '看它走了那么久，这一声来得值。', P_SLOW: '停了半拍，还是落袋了。',
    },
    progress: {
      P_RARE_PRECISION: '只差毫厘。公主把分寸拿得真好。', P_RARE_LONG: '这一声落袋，我等了大半张台。', P_RARE_SLOW: '等到最后那一声，才敢松口气。',
      P_FINAL_MISS: '黑八这一拍还留着，下次再接。', P_FINAL_MISS_2: '两回都悬在这儿了。公主，下次慢半拍再出手。',
      P_FINAL_MISS_LATER: ['把前几拍放下，下一杆重新起。', '最后这一声，等到顺手的时候再打。', '收尾不用赶。黑八还在。'],
      N_FINAL_MISS: '我这声黑八没等到，公主接。', N_FINAL_MISS_2: '我的收尾又慢了一拍，到你。', N_FINAL_MISS_LATER: ['我又没续上这一声，交给你。', '黑八还没落袋，这一拍由你。'],
    },
    playerRun: n => `接连${n}杆，公主的节奏真顺。`, opponentRun: n => `我也续上${n}杆了，今天节奏不错。`,
    group: (own, numbers, other) => `球组分定了，${numbers}号${own}给公主，${other}由我来打。`,
    take: fact => `${fact}。下一拍由我接。`, give: fact => `${fact}。公主，接着你的节奏来。`,
    early: shooter => `${shooter}先把黑八打进了，这局提前收尾。咱们再起一局。`,
    eight: '这一组收完了，下一声留给黑八。', placement: '拖着光圈，给白球找个出手顺的位置。',
  },
  'zhou-mubai': {
    personality: '耐心教练，一次只说一个要点',
    thinking: '我先看一下落点。',
    scenes: {
      OPEN_PLAYER: ['准备好就开球，照你的习惯来。', '公主先开球，动作放松就好。'], REMATCH: ['再来一局，先把第一杆打舒服。', '好，再试试你的节奏。'],
      P_BREAK_MULTI: '开球收了几颗，动作很稳。', P_BREAK_ONE: '开球有进账，动作记住。', P_BREAK_DRY: '台面打开了，接着挑好打的球。',
      P_FIRST_POT: '第一颗打进了，记住这个感觉。', P_ONE: ['这杆进了，记住手感。', '出手很稳。好球。', '这颗打好了，放松再看下一颗。'],
      P_TWO: '一杆两颗，出手挺稳。', P_MANY: '这杆进了好几颗，慢慢看下一杆。', P_RECOVER: '手感回来了，按这一杆打。', P_FINAL_READY: '组球打完了。给黑八留点瞄准时间。',
      P_EMPTY_1: '下一次上手，先站稳。', P_EMPTY_2: '手放松点，下杆先找正线。', P_EMPTY_3: '下杆先挑最顺的那颗。',
      N_ONE: ['我进一颗，接着看看。', '这杆进了，我再看落点。'], N_MULTI: '这杆收了几颗，下一杆还得重新看。', N_EMPTY: ['我没进，到你。先看近球。', '换你，先找打得顺的线。'],
      P_BALL_IN_HAND: '白球摆得好，出杆就省力。', P_LONG: '远球都打进了，这杆值得记。', P_SLOW: '力道刚好够。记住这一下。',
    },
    progress: {
      P_RARE_PRECISION: '这么小的角度也打进了。记住刚才的出手。', P_RARE_LONG: '那么远还能打准，刚才的站位保持住。', P_RARE_SLOW: '它最后才到袋口。这个力道控制得好。',
      P_FINAL_MISS: '黑八还在。下次先把袋口看清。', P_FINAL_MISS_2: '试了两杆了。下次出手前，先把身体站稳。',
      P_FINAL_MISS_LATER: ['下次只定一条线，定好了再打。', '公主，先放松握杆的手。', '等再上手，找个自己舒服的角度。'],
      N_FINAL_MISS: '我的黑八没进。轮你，先看清路线。', N_FINAL_MISS_2: '这杆我还是没收住，公主来。', N_FINAL_MISS_LATER: ['我又没打进黑八。轮到你，慢点看。', '我的黑八还在。公主先挑自己的球。'],
    },
    playerRun: n => `接连打进${n}杆了。记住这个节奏。`, opponentRun: n => `我连上${n}杆了。公主，下杆照自己的节奏来。`,
    group: (own, numbers, other) => `先记球号。公主打${numbers}号${own}，我打${other}。`,
    take: fact => `${fact}。我来接，公主下回再试。`, give: fact => `${fact}。公主先找条顺手的线。`,
    early: shooter => `${shooter}提前打进黑八，本局结束。再来，下局先清本组球。`,
    eight: '本组清了。先找袋口，再打黑八。', placement: '拖光圈摆白球。摆好后，先看下一杆怎么站。',
  },
  'xie-linyu': {
    personality: '好胜又大方，常拿自己打趣',
    thinking: '容我找找，这杆还有什么解。',
    scenes: {
      OPEN_PLAYER: ['请，今天我可带了真本事。', '公主先开，等会儿看谁先笑。'], REMATCH: ['再来，我还没打够呢。', '好，刚才那局算热身。'],
      P_BREAK_MULTI: '刚开球就进几颗？给我留点事做。', P_BREAK_ONE: '开局就进，好，轮到我紧张。', P_BREAK_DRY: '球散好了，这才有得较量。',
      P_FIRST_POT: '行，头一分算你拿得漂亮。', P_ONE: ['这颗我挑不出毛病。', '漂亮。我得打起精神了。', '这颗你收得干脆。'],
      P_TWO: '你一杆进俩？我得加把劲。', P_MANY: '你这杆进了这么多，我球杆白擦了。', P_RECOVER: '这杆一进，我可就坐不稳了。', P_FINAL_READY: '只剩黑八了，我得站起来看。',
      P_EMPTY_1: '球还在，公主等会儿来追。', P_EMPTY_2: '给我个空当而已，你还有得打。', P_EMPTY_3: '下一杆再来，我还想看你追上。',
      N_ONE: ['我总算交上一颗了。', '这一分我先记账。'], N_MULTI: '嘿，这杆该我得意一下了。', N_EMPTY: ['哎，我这杆交白卷。你来。', '让球杆歇一下。换你。'],
      P_BALL_IN_HAND: '你把白球一摆，我就知道要丢分。', P_LONG: '这么远也敢打？好，还真打进了。', P_SLOW: '刚想笑它走不动，好吧，进了。',
    },
    progress: {
      P_RARE_PRECISION: '就给你这么一点缝，还真进了？我服。', P_RARE_LONG: '我都走到台边看了，真从那头打进来。厉害。', P_RARE_SLOW: '我那口气都憋到它落袋了。行，漂亮。',
      P_FINAL_MISS: '黑八还在，我还能跟你较量一杆。', P_FINAL_MISS_2: '它连躲两回了？公主，下次瞄准再收拾它。',
      P_FINAL_MISS_LATER: ['黑八会躲，我也会失手。咱们接着打。', '前几杆先不计账，这颗重新看。', '公主缓口气。我可还等着你来收尾。'],
      N_FINAL_MISS: '我连庆祝都想好了……结果没进。你来。', N_FINAL_MISS_2: '这黑八又让我白高兴了。公主请。', N_FINAL_MISS_LATER: ['我又和黑八擦肩而过了，换你。', '黑八还赖着我呢。到你出杆。'],
    },
    playerRun: n => `连进${n}杆？得，我这会儿先当观众。`, opponentRun: n => `我也连上${n}杆了，公主，咱俩接着比。`,
    group: (own, numbers, other) => `公主打${numbers}号${own}，行，${other}留我。`,
    take: fact => `${fact}。好，轮到我表现了。`, give: fact => `${fact}。这回轮公主出招。`,
    early: shooter => `${shooter}提前把黑八打进了，这局收杆。再来，我还没打够。`,
    eight: '公主清台到黑八了。最后这颗，我站着看。', placement: '公主拖光圈选个顺手位置，我看看你怎么打。',
  },
  'pei-zhixu': {
    personality: '思路清楚，喜欢先看下一杆',
    thinking: '这一杆打完，下一杆该留在哪里？',
    scenes: {
      OPEN_PLAYER: ['你先开。我看看球怎么散。', '公主先开球，球散了再看路线。'], REMATCH: ['台面重摆了，换个思路再来。', '好，下一局重新看局面。'],
      P_BREAK_MULTI: '开球收了几颗，台面好处理了。', P_BREAK_ONE: '第一杆得分了，接着看落点。', P_BREAK_DRY: '球散开了，先找看得清的路线。',
      P_FIRST_POT: '第一颗拿下，路线成立。', P_ONE: ['这一球，打得清楚。', '这条线走通了。好球。', '好，照这个办法看下一颗。'],
      P_TWO: '一杆两颗，下一杆有新选择。', P_MANY: '这杆进了几颗，得重新看看台面。', P_RECOVER: '这次把路线走通了。', P_FINAL_READY: '只剩黑八，先选袋。',
      P_EMPTY_1: '这一杆过去了。台面得重新看。', P_EMPTY_2: '先找一条简单的线试试。', P_EMPTY_3: '下杆先定袋，再定力度。',
      N_ONE: ['这颗按计划进了。', '我先处理掉这一颗。'], N_MULTI: '我这杆多收了几颗，重新看局面。', N_EMPTY: ['我没打进。这一轮公主来找线。', '这杆结束了，轮到你看台面。'],
      P_BALL_IN_HAND: '这杆从摆球开始就选对了。', P_LONG: '长线走到底，还对得这么准。', P_SLOW: '这速度刚够，分寸算得准。',
    },
    progress: {
      P_RARE_PRECISION: '我看了半天才找到那条线，你把它打进了。', P_RARE_LONG: '这条长线一路没偏。公主，好准。', P_RARE_SLOW: '看着像要停，最后正好够到袋口。好球。',
      P_FINAL_MISS: '黑八还在。下次再选一遍袋口。', P_FINAL_MISS_2: '两次都没收住。下杆先看白球的位置，再选袋。',
      P_FINAL_MISS_LATER: ['下一次就按当时的球位算。', '先选一个袋，选定了再出手。', '前几次的角度都过去了。这杆重新找线。'],
      N_FINAL_MISS: '我的黑八没走到袋口。公主接手。', N_FINAL_MISS_2: '我这条黑八路线又没走通。换你。', N_FINAL_MISS_LATER: ['我得重新算黑八了。公主先打。', '黑八还在。我这杆结束，轮你。'],
    },
    playerRun: n => `连进${n}杆，公主，这一趟球路接得漂亮。`, opponentRun: n => `我接上${n}杆了。再看看下面这颗。`,
    group: (own, numbers, other) => `球组已定。你只看${numbers}号${own}，${other}由我处理。`,
    take: fact => `${fact}。这杆结算，下一杆归我。`, give: fact => `${fact}。换公主重新看台面。`,
    early: shooter => `${shooter}提前打进黑八，本局按规则结束。下一局重新开球。`,
    eight: '本组清空。给黑八选个袋口再出杆。', placement: '选好目标袋后，拖光圈把白球放到合适的线路上。',
  },
  'song-yucheng': {
    personality: '明亮热情，真心为好球喝彩',
    thinking: '我找找，也打一颗漂亮的！',
    scenes: {
      OPEN_PLAYER: ['来吧公主，我等着看你的第一杆！', '公主开球！今天打个痛快。'], REMATCH: ['好！这一局也给你鼓掌。', '再来一局！开球交给公主。'],
      P_BREAK_MULTI: '漂亮！开场就收了好几颗！', P_BREAK_ONE: '一开球就进！好彩头！', P_BREAK_DRY: '散开了！这局还有好多球可打。',
      P_FIRST_POT: '公主开张啦！我看见了！', P_ONE: ['好球！看得我想拍手。', '漂亮，我给公主记一颗！', '这一球进得真痛快！'],
      P_TWO: '两颗都进！掌声得加倍。', P_MANY: '这么多颗！我都看不过来了。', P_RECOVER: '进啦！就等公主这一杆呢。', P_FINAL_READY: '就剩黑八啦！我在这儿给你加油。',
      P_EMPTY_1: '没关系，下一杆我还给你加油。', P_EMPTY_2: '松松肩，下一次还能打回来。', P_EMPTY_3: '先喘口气，咱们一颗一颗来。',
      N_ONE: ['我也进啦！', '这颗进得我自己都高兴。'], N_MULTI: '哎呀，我也进了好几颗！', N_EMPTY: ['换你啦，我在这儿看！', '我这颗没进。公主，接棒！'],
      P_BALL_IN_HAND: '白球一摆就打进，机会接得漂亮！', P_LONG: '那么远也进啦！太厉害了。', P_SLOW: '它终于滚进去了！太好了。',
    },
    progress: {
      P_RARE_PRECISION: '绝佳进球！我刚才连眼都不敢眨。', P_RARE_LONG: '我跟着看了大半张台。进了！太精彩了！', P_RARE_SLOW: '我刚准备叹气呢，它进啦！公主好球！',
      P_FINAL_MISS: '黑八还在！再上手我给你加油。', P_FINAL_MISS_2: '试了两回啦，没关系。下次站舒服了再打。',
      P_FINAL_MISS_LATER: ['黑八还是留给下一杆吧。我在呢。', '公主，缓口气，有机会再试。', '每次出杆都是新的。下回咱们接着来。'],
      N_FINAL_MISS: '哎呀，我的黑八没进！到公主。', N_FINAL_MISS_2: '我又差了一点。公主接棒！', N_FINAL_MISS_LATER: ['黑八又停住啦，公主上！', '我没收住！到你啦，我看着。'],
    },
    playerRun: n => `已经连进${n}杆了！公主，这一趟真好看！`, opponentRun: n => `我也连上${n}杆啦！跟你打真来劲。`,
    group: (own, numbers, other) => `分组啦！公主打${numbers}号${own}，${other}是我的！`,
    take: fact => `${fact}啦。好，我接一杆！`, give: fact => `${fact}啦。轮到公主，加油！`,
    early: shooter => `${shooter}提前打进黑八啦，这局就结束了。好，咱们再开一局！`,
    eight: '全清了！下一杆打黑八，我给你加油。', placement: '公主，拖住小光圈，给白球找个好打的位置！',
  },
  'xu-qinghe': {
    personality: '清淡温柔，习惯给对方一点空间',
    thinking: '我静静看一眼，很快。',
    scenes: {
      OPEN_PLAYER: ['等你准备好，公主就开球吧。', '台面很安静，第一杆留给你。'], REMATCH: ['还想打就再打一局，我在。', '好呀，公主慢慢开球。'],
      P_BREAK_MULTI: '一开场便入袋了好几颗。', P_BREAK_ONE: '第一颗已经进了，真好。', P_BREAK_DRY: '球都散开了。慢慢看。',
      P_FIRST_POT: '第一颗进了。真好。', P_ONE: ['清清爽爽的一杆。', '看见了，进得很好。', '好安静的一颗，已经入袋了。'],
      P_TWO: '一下进了两颗，真好看。', P_MANY: '几颗一起落袋，真有意思。', P_RECOVER: '等来的这一杆，很好看。', P_FINAL_READY: '黑八留在最后，公主慢慢打。',
      P_EMPTY_1: '歇一下，等下一杆。', P_EMPTY_2: '别绷着手，慢慢来。', P_EMPTY_3: '先呼口气，球还在。',
      N_ONE: ['我也收好一颗了。', '轻轻进了一颗。'], N_MULTI: '我这一杆多收了几颗。', N_EMPTY: ['到公主了。我等你。', '我没打进。你慢慢挑。'],
      P_BALL_IN_HAND: '放得顺手，打得也顺手。', P_LONG: '远远的那颗，也进了。', P_SLOW: '慢慢走，最后也到了。',
    },
    progress: {
      P_RARE_PRECISION: '那么窄的一线，我看着你稳稳打进了。', P_RARE_LONG: '我看着它过了大半张台，最后真的进了。', P_RARE_SLOW: '刚刚好。它把最后一点路也走完了。',
      P_FINAL_MISS: '黑八留着。公主，下次再慢慢收。', P_FINAL_MISS_2: '两次都过去了。下回只看眼前这一杆。',
      P_FINAL_MISS_LATER: ['不必急着收尾，顺手时再来。', '公主先松一松肩。黑八还在。', '等你再上手，我们重新看这颗。'],
      N_FINAL_MISS: '我的黑八还在。公主，慢慢来。', N_FINAL_MISS_2: '我又错过这颗了。你来吧。', N_FINAL_MISS_LATER: ['黑八又留下了。公主先打。', '我还是没收住它，轮你啦。'],
    },
    playerRun: n => `已经连进${n}杆了，公主。看你打真舒服。`, opponentRun: n => `我也接了${n}杆。公主，按你的节奏来。`,
    group: (own, numbers, other) => `公主看${numbers}号就好，那是你的${own}。${other}我来打。`,
    take: fact => `${fact}。公主歇一下，我来接。`, give: fact => `${fact}。球交给你，慢慢来。`,
    early: shooter => `${shooter}提前打进黑八，这局先到这儿。公主，我们慢慢再来一局。`,
    eight: '本组已经收好了。黑八这一杆慢慢来。', placement: '拖着光圈就能摆白球。挑个你觉得舒服的地方。',
  },
} satisfies Record<string, Voice>;

export function companionVoice(id: string | undefined): Voice | undefined {
  return id && Object.prototype.hasOwnProperty.call(COMPANION_VOICES, id) ? COMPANION_VOICES[id as keyof typeof COMPANION_VOICES] : undefined;
}

export function voicedProgress(voice: Voice | undefined, id: Progress): readonly string[] | undefined {
  if (!voice) return undefined;
  const run = /^(P|N)_STREAK_([2357])$/.exec(id);
  if (run) {
    const count = ({ '2': '两', '3': '三', '5': '五', '7': '七' } as Record<string, string>)[run[2]];
    return [run[1] === 'P' ? voice.playerRun(count) : voice.opponentRun(count)];
  }
  const lines = voice.progress[id as ProgressScene];
  return typeof lines === 'string' ? [lines] : lines;
}
