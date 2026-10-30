/*
[INPUT]: 独立实验的原球径与 +2.5% 口宽共享米制尺寸；不改变球桌长宽或物理摩擦
[OUTPUT]: 球半径、袋口倍率与球心安全余量的唯一尺寸合同
[POS]: 纯常量层；physics、袋口几何与视觉剖面共同消费
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
/** 公主独立实验：83.15325mm 球与143.5/123mm袋口；碰撞、摆球、瞄准与可视几何共用。 */
export const BALL_SCALE = 1.455; // 2026-10-27：相对1.50缩小3%，视觉与物理共用
// 袋腔深度保留；角袋和中袋分别控制口宽。
// Only mouth width grows 2.5%; jaw radii, shelves, capture insets and ball size stay fixed.
export const POCKET_MOUTH_SCALE = { corner: .1435 / .100, side: .123 / .102 } as const;
export const BALL_POCKET_SCALE = 1.28;
export const BALL_RADIUS = 0.028575 * BALL_SCALE;
export const POCKET_AIM_CLEARANCE = 0.00075 * BALL_SCALE;
