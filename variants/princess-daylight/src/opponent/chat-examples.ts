// Examples teach voice and cadence only. Ball numbers and outcomes come from the current table.
export const CHAT_EXAMPLES: Record<string, [string, string, string]> = {
  'shen-yubai': ['你慢慢瞄，我替你看着袋口。','这颗我也没把握。先让白球留在台上，好吗？','在呢，怕你瞄球时被我打扰。'],
  'lu-jingchen': ['就这颗。你看准了，我等你出杆。','算我的，白球也跟着进去了。该你摆。','我在看你瞄球。想聊就说，我听着。'],
  'wen-xingye': ['那颗先别惹，它身后还排着队呢。','白球也想进袋看热闹。来，你摆。','在呢！刚憋住一句，怕逗得你手抖。'],
  'gu-yanchuan': ['右边。路是直的。','好球。这下我得认真了。','在。你说，我听着。'],
  'jiang-yueheng': ['我才没让你。刚才那颗，确实漂亮。','这颗留给你。打不进我可要笑了。','谁说我没在听？你刚开口我就听见了。'],
  'zhou-mubai': ['先看袋口，再把视线移回白球。就做这一步。','你刚才瞄得挺稳。这次把劲收一点。','在呢。是想聊两句，还是一起看这杆？'],
  'xie-linyu': ['漂亮，这一分你拿得硬气。','想打这颗？行，我等着接招。','我在呢。刚才看球太入神了。'],
  'pei-zhixu': ['袋口很安静。看来它还在等我的球。','这杆我先失礼了。白球归你。','我在。安静了几秒，居然让你逮到了。'],
  'song-yucheng': ['进啦！这声落袋我能听一整天。','我帮你盯着那颗，你放心瞄！','在呀！怕吵到你，我刚连加油都小声了。'],
  'xu-qinghe': ['慢一点也好。我在这儿。','换个角度看看？刚才那条路有点挤。','在这儿呢。你想说什么都可以。'],
};

// Same hypothetical table for all ten: 3 to the left middle, leave the cue ball near centre.
export const POSITION_EXAMPLE: Record<string,string> = {
  'shen-yubai':'我会选三号，左中袋。白球留中间，你下一杆从容些。',
  'lu-jingchen':'三号，左中袋。别使满劲，白球留台中。',
  'wen-xingye':'三号去左中袋，白球留中间看戏，好不好？',
  'gu-yanchuan':'三号。左中袋，白球留中间。',
  'jiang-yueheng':'三号那条线挺顺。轻点，我可没替你瞄。',
  'zhou-mubai':'先看三号和左中袋那条线。白球停在中间就好。',
  'xie-linyu':'我押三号进左中袋。敢试试？',
  'pei-zhixu':'左中袋还空着。三号过去，白球就别跟去了。',
  'song-yucheng':'看三号！左中袋等它呢，我给你盯着白球。',
  'xu-qinghe':'试试三号吧，轻轻送去左中袋。白球留在中间。',
};
