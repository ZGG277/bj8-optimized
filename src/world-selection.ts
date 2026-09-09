/*
[INPUT]: URL search 与局前世界选择
[OUTPUT]: 五种公开局前世界的 WorldId 解析；无参数保留室内，不持久化世界偏好
[POS]: 正式局前世界入口合同，不接触物理或渲染
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
export const WORLD_OPTIONS = [
  { id: 'studio', label: '静谧球房', hint: '熟悉的室内比赛空间' },
  { id: 'cloud-sea', label: '云海浮台', hint: '暮色里，打完这一杆' },
  { id: 'galaxy', label: '宇宙星系', hint: '银河深处，一方静台' },
  { id: 'bamboo', label: '雨后竹林', hint: '竹影与微凉的石径' },
  { id: 'aurora-lake', label: '极光冰湖', hint: '冰蓝夜色，天幕流光' },
] as const;

export type WorldId = (typeof WORLD_OPTIONS)[number]['id'];

export function resolveWorldSelection(search: string): WorldId {
  const value = new URLSearchParams(search).get('world');
  const option = WORLD_OPTIONS.find(world => world.id === value);
  return option?.id ?? 'studio';
}

export function worldSelectionUrl(href: string, worldId: WorldId): string {
  const url = new URL(href);
  url.searchParams.set('world', worldId);
  return url.href;
}
