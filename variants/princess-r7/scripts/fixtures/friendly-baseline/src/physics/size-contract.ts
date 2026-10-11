/*
[INPUT]: R2 爽感球与宽口袋的共享米制尺寸；不改变球桌长宽或物理摩擦
[OUTPUT]: 球半径、袋口倍率与球心安全余量的唯一尺寸合同
[POS]: 纯常量层；physics、袋口几何与视觉剖面共同消费
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
/** 公主 R2：90.297mm 球与177/180.54mm宽口袋；碰撞、摆球、瞄准与可视几何共用。 */
export const BALL_SCALE = 1.58;
export const BALL_POCKET_SCALE = 1.77;
export const BALL_RADIUS = 0.028575 * BALL_SCALE;
export const POCKET_AIM_CLEARANCE = 0.00075 * BALL_SCALE;
