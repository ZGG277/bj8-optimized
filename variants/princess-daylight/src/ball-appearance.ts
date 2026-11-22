// The table renderer and both chat paths describe the same seven pairs of balls.
const jewels = [
  ['#f4be21', '黄色'], ['#216ce2', '蓝色'], ['#e9384b', '红色'],
  ['#8946cd', '紫色'], ['#f57e24', '橙色'], ['#18b66b', '绿色'], ['#bd3855', '酒红色'],
] as const;

export const JEWEL_COLORS = jewels.map(([color]) => color);

export function ballAppearance(n: number): string {
  if (n === 0) return '纯白的母球';
  if (n === 8) return '黑色的8号球';
  return jewels[(n - 1) % 8][1] + (n > 8 ? '、中间有白带的那颗' : '、没有白带的那颗');
}
