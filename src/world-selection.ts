/*
[INPUT]: URL search 与局前世界选择
[OUTPUT]: 室内、云海与湖面三种公开局前世界的解析及互斥 URL；无参数保留室内
[POS]: 正式局前世界入口合同，不接触物理或渲染
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
export const WORLD_OPTIONS = [
  { id: 'studio', label: '静谧球房', hint: '熟悉的室内比赛空间' },
  { id: 'cloud-sea', label: '云海浮台', hint: '暮色里，打完这一杆' },
  { id: 'lake', label: '安静湖面', hint: '天空与水面环绕球桌' },
] as const;

export type PublicWorldId = (typeof WORLD_OPTIONS)[number]['id'];
/** 历史世界资产继续保留为可恢复能力，但不再显示在局前公开入口。 */
export type WorldId = PublicWorldId | 'galaxy' | 'bamboo' | 'aurora-lake';

export function resolveWorldSelection(search: string): PublicWorldId {
  const params = new URLSearchParams(search);
  if (params.get('lake360') === '1') return 'lake';
  const value = params.get('world');
  const option = WORLD_OPTIONS.find(world => world.id === value);
  return option?.id ?? 'studio';
}

export function worldSelectionUrl(href: string, worldId: PublicWorldId): string {
  const url = new URL(href);
  url.searchParams.set('world', worldId);
  if (worldId === 'lake') url.searchParams.set('lake360', '1');
  else url.searchParams.delete('lake360');
  return url.href;
}
