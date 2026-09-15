/*
[INPUT]: 只读球位、合法目标编号与高亮环外半径
[OUTPUT]: 不会与另一合法目标高亮环相交的目标编号
[POS]: 合法目标提示的纯视觉筛选；不修改规则、球位或物理状态
*/

export type TargetRingBall = Readonly<{
  number: number;
  active: boolean;
  x: number;
  z: number;
}>;

/**
 * 紧贴球的半透明环若共面相交，手机低机位会把相交边缘压成闪动虚线。
 * 相邻合法球留给球色表达；已经分开的合法球继续显示原有单球提示。
 */
export function nonOverlappingTargetNumbers(
  balls: readonly TargetRingBall[],
  legalTargets: ReadonlySet<number>,
  outerRadius: number,
): Set<number> {
  const candidates = balls.filter(ball => ball.active && legalTargets.has(ball.number));
  const minimumDistanceSq = (outerRadius * 2) ** 2;
  return new Set(candidates
    .filter((ball, index) => candidates.every((other, otherIndex) =>
      index === otherIndex || (ball.x - other.x) ** 2 + (ball.z - other.z) ** 2 >= minimumDistanceSq))
    .map(ball => ball.number));
}
