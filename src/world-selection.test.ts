import { describe, expect, it } from 'vitest';
import { WORLD_OPTIONS, resolveWorldSelection, worldSelectionUrl } from './world-selection';

describe('局前世界入口', () => {
  it('普通和未知参数均保持室内', () => {
    for (const search of ['', '?theme=noir', '?world=', '?world=missing']) {
      expect(resolveWorldSelection(search)).toBe('studio');
    }
  });
  it('五种有效世界都可由链接预选', () => {
    expect(WORLD_OPTIONS.map(world => world.id)).toEqual(['studio', 'cloud-sea', 'galaxy', 'bamboo', 'aurora-lake']);
    for (const { id: worldId } of WORLD_OPTIONS) {
      expect(resolveWorldSelection('?world=' + worldId)).toBe(worldId);
    }
  });
  it('选择只改 world，保留主题、路径和哈希', () => {
    for (const { id } of WORLD_OPTIONS) {
      expect(worldSelectionUrl('http://127.0.0.1:5201/game/?theme=noir&world=studio#play', id))
        .toBe(`http://127.0.0.1:5201/game/?theme=noir&world=${id}#play`);
    }
  });
});
