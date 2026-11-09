/*
[INPUT]: 用户提供的2026-11-05话术库；原始JSON与SHA保存在artifacts/dialogue-optimization-20261105/source
[OUTPUT]: 20组原库短句、规则事实之外的递进话术与限频参数
[POS]: 陪练台词纯数据；距离、入袋速度和自由球起手使用实际记录，终局走既有结果卡
[PROTOCOL]: 变更时更新此头部，然后检查CLAUDE.md
*/
export const DIALOGUE_SCENES = [
  {"id":"OPEN_PLAYER","priority":1000,"probability":1,"max_per_rack":1,"semantic_group":"opening","lines":[{"id":"OPEN_PLAYER.1","text":"公主，请开球","weight":1},{"id":"OPEN_PLAYER.2","text":"这局，认真奉陪","weight":1},{"id":"OPEN_PLAYER.3","text":"等你这杆很久了","weight":1}]},
  {"id":"REMATCH","priority":1010,"probability":1,"max_per_rack":1,"semantic_group":"opening","lines":[{"id":"REMATCH.1","text":"又能和你打一局了","weight":1},{"id":"REMATCH.2","text":"这局，也认真陪你","weight":1},{"id":"REMATCH.3","text":"好，再较量一场","weight":1}]},
  {"id":"P_BREAK_MULTI","priority":880,"probability":0.75,"max_per_rack":1,"semantic_group":"break_result","lines":[{"id":"P_BREAK_MULTI.1","text":"开场就带走一串","weight":1},{"id":"P_BREAK_MULTI.2","text":"这开场，够热闹","weight":1},{"id":"P_BREAK_MULTI.3","text":"一上来就收获满满","weight":1}]},
  {"id":"P_BREAK_ONE","priority":870,"probability":0.55,"max_per_rack":1,"semantic_group":"break_result","lines":[{"id":"P_BREAK_ONE.1","text":"开场就有好彩头","weight":1},{"id":"P_BREAK_ONE.2","text":"这开场，漂亮","weight":1},{"id":"P_BREAK_ONE.3","text":"第一杆就有惊喜","weight":1}]},
  {"id":"P_BREAK_DRY","priority":400,"probability":0.12,"max_per_rack":1,"semantic_group":"player_setback","lines":[{"id":"P_BREAK_DRY.1","text":"球散开，好戏开场","weight":1},{"id":"P_BREAK_DRY.2","text":"这局慢慢展开","weight":1},{"id":"P_BREAK_DRY.3","text":"开场热身，接着来","weight":1}]},
  {"id":"P_FIRST_POT","priority":720,"probability":0.55,"max_per_rack":1,"semantic_group":"first_score","lines":[{"id":"P_FIRST_POT.1","text":"好球，开张了","weight":1},{"id":"P_FIRST_POT.2","text":"第一颗，漂亮","weight":1},{"id":"P_FIRST_POT.3","text":"这一杆，稳","weight":1}]},
  {"id":"P_ONE","priority":500,"probability":0.18,"max_per_rack":3,"semantic_group":"ordinary_player_pot","lines":[{"id":"P_ONE.1","text":"漂亮，接着来","weight":1},{"id":"P_ONE.2","text":"好球，看见了","weight":1},{"id":"P_ONE.3","text":"这一颗，拿下","weight":1}]},
  {"id":"P_TWO","priority":800,"probability":0.75,"max_per_rack":1,"semantic_group":"multi_pot","lines":[{"id":"P_TWO.1","text":"一杆，双份惊喜","weight":1},{"id":"P_TWO.2","text":"你还会打包带走啊","weight":1},{"id":"P_TWO.3","text":"一出手就是双份","weight":1}]},
  {"id":"P_MANY","priority":840,"probability":0.85,"max_per_rack":1,"semantic_group":"multi_pot","lines":[{"id":"P_MANY.1","text":"这一杆，收获不小","weight":1},{"id":"P_MANY.2","text":"一杆带走一串","weight":1},{"id":"P_MANY.3","text":"这杆有点忙啊","weight":1}]},
  {"id":"P_RECOVER","priority":730,"probability":0.6,"max_per_rack":1,"semantic_group":"recovery","lines":[{"id":"P_RECOVER.1","text":"这杆值得鼓掌","weight":1},{"id":"P_RECOVER.2","text":"这一杆，好看","weight":1},{"id":"P_RECOVER.3","text":"进球就有喝彩","weight":1}]},
  {"id":"P_FINAL_READY","priority":850,"probability":0.65,"max_per_rack":1,"semantic_group":"final_phase","lines":[{"id":"P_FINAL_READY.1","text":"最后一颗了","weight":1},{"id":"P_FINAL_READY.2","text":"到收尾的时候了","weight":1},{"id":"P_FINAL_READY.3","text":"这局到了关键处","weight":1}]},
  {"id":"P_EMPTY_1","priority":320,"probability":0.05,"max_per_rack":1,"semantic_group":"player_setback","lines":[{"id":"P_EMPTY_1.1","text":"这局还在，接着来","weight":1},{"id":"P_EMPTY_1.2","text":"下一杆再见","weight":1},{"id":"P_EMPTY_1.3","text":"咱们接着打","weight":1}]},
  {"id":"P_EMPTY_2","priority":340,"probability":0.12,"max_per_rack":1,"semantic_group":"player_setback","lines":[{"id":"P_EMPTY_2.1","text":"按你的节奏来","weight":1},{"id":"P_EMPTY_2.2","text":"缓一缓，不急","weight":1},{"id":"P_EMPTY_2.3","text":"下一杆是新的","weight":1}]},
  {"id":"P_EMPTY_3","priority":350,"probability":0.12,"max_per_rack":1,"semantic_group":"player_setback","lines":[{"id":"P_EMPTY_3.1","text":"节奏你来定","weight":1},{"id":"P_EMPTY_3.2","text":"这局还有得打","weight":1},{"id":"P_EMPTY_3.3","text":"不赶，接着打","weight":1}]},
  {"id":"N_ONE","priority":400,"probability":0.12,"max_per_rack":2,"semantic_group":"npc_score","lines":[{"id":"N_ONE.1","text":"我也得拿出真本事","weight":1},{"id":"N_ONE.2","text":"这局打得过瘾","weight":1},{"id":"N_ONE.3","text":"这颗，先记我账上","weight":1}]},
  {"id":"N_MULTI","priority":650,"probability":0.3,"max_per_rack":1,"semantic_group":"npc_score","lines":[{"id":"N_MULTI.1","text":"这杆我也赚到了","weight":1},{"id":"N_MULTI.2","text":"这一杆，收下了","weight":1},{"id":"N_MULTI.3","text":"看来我也有点手感","weight":1}]},
  {"id":"N_EMPTY","priority":300,"probability":0.12,"max_per_rack":2,"semantic_group":"turn_handoff","lines":[{"id":"N_EMPTY.1","text":"到你了，我看着","weight":1},{"id":"N_EMPTY.2","text":"换你出手","weight":1},{"id":"N_EMPTY.3","text":"下一杆，看你的","weight":1}]},
  {"id":"P_BALL_IN_HAND","priority":710,"probability":0.4,"max_per_rack":1,"semantic_group":"opportunity","lines":[{"id":"P_BALL_IN_HAND.1","text":"机会，被你接住了","weight":1},{"id":"P_BALL_IN_HAND.2","text":"这一杆，没浪费","weight":1},{"id":"P_BALL_IN_HAND.3","text":"稳稳收下了","weight":1}]},
  {"id":"P_LONG","priority":790,"probability":0.65,"max_per_rack":1,"semantic_group":"long_pot","lines":[{"id":"P_LONG.1","text":"这么远，也拿下了","weight":1},{"id":"P_LONG.2","text":"这颗跑得真够远","weight":1},{"id":"P_LONG.3","text":"远处这颗也收下了","weight":1}]},
  {"id":"P_SLOW","priority":785,"probability":0.6,"max_per_rack":1,"semantic_group":"pocket_drama","lines":[{"id":"P_SLOW.1","text":"慢慢来，也进了","weight":1},{"id":"P_SLOW.2","text":"它还挺会留悬念","weight":1},{"id":"P_SLOW.3","text":"这一颗，刚刚好","weight":1}]}
] as const;
export const DIALOGUE_SETTINGS = {
  "cooldown_ms": 12000,
  "min_shot_gap": 2,
  "max_lines_per_rack": 8,
  "reserve_terminal": 1,
  "recent_racks": 3,
  "recent_line_weight_multiplier": 0.2,
  "streak_counts_break": false,
  "semantic_limits": {
    "opening": 1,
    "break_result": 1,
    "first_score": 1,
    "ordinary_player_pot": 3,
    "multi_pot": 1,
    "momentum": 1,
    "opponent_waiting": 1,
    "recovery": 1,
    "opportunity": 1,
    "final_phase": 1,
    "player_setback": 1,
    "bank_pot": 1,
    "long_pot": 1,
    "thin_cut": 1,
    "pocket_drama": 1,
    "npc_score": 2,
    "turn_handoff": 2,
    "npc_self_joke": 1,
    "ending": 1
  },
  "probability_policy": "select_highest_priority_then_draw_once_no_fallback",
  "missing_data_policy": "unknown_never_matches_including_ne",
  "speaker_policy": "opponent_npc_only",
  "default_capabilities": [
    "core"
  ]
} as const;

/** 一次上手的得分杆里程碑与本局黑八未进阶段。 */
export const SHOT_PROGRESS_LINES = {
  P_STREAK_2: ['两杆连上啦，公主手感来了。', '漂亮，又接上了一杆。'],
  P_STREAK_3: ['连着三杆了，我都快成观众啦。', '三杆都接住了，这节奏真好。'],
  P_STREAK_5: ['五杆连进，公主打得我都舍不得眨眼。', '连进五杆了，这一趟我得好好看。'],
  P_STREAK_7: ['七杆连进，公主，这一趟真漂亮。', '整整七杆，我服了。'],
  N_STREAK_2: ['我也连上两杆啦，今天手感不错。'],
  N_STREAK_3: ['我连进三杆了，公主别急，球局还长。', '三杆连起来了，跟公主打真来劲。'],
  N_STREAK_5: ['我连进五杆了，这一趟还真顺。'],
  N_STREAK_7: ['七杆了，我自己也有点没想到。'],
  P_FINAL_MISS: ['黑八还在，公主下一次上手再试。', '这一杆先放下，黑八等你回来。'],
  P_FINAL_MISS_2: ['试了两杆啦，公主慢一点，找个舒服的角度。', '又试了一杆，公主按自己的节奏来。'],
  P_FINAL_MISS_LATER: [
    '黑八试了几回也没关系，我陪公主慢慢收尾。',
    '前几杆都放下吧，公主，下次只看眼前这一球。',
    '黑八肯等，公主也可以慢慢来。',
  ],
  N_FINAL_MISS: ['我的黑八还在，公主，到你啦。'],
  N_FINAL_MISS_2: ['我又没收住黑八，换公主来。'],
  N_FINAL_MISS_LATER: ['黑八留我好几回了，公主，这杆看你。', '它又不肯走，公主请。'],
} as const;
