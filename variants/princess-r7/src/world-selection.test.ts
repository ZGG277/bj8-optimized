import { describe, expect, it } from 'vitest';
import { WORLD_OPTIONS, resolveWorldSelection, worldSelectionUrl } from './world-selection';

describe('局前世界入口', () => {
  it('普通和未知参数均保持室内', () => {
    for (const search of ['', '?theme=noir', '?world=', '?world=missing']) {
      expect(resolveWorldSelection(search)).toBe('studio');
    }
  });
  it('只公开室内、云海与湖面', () => {
    expect(WORLD_OPTIONS.map(world => world.id)).toEqual(['studio', 'cloud-sea', 'lake']);
    for (const { id: worldId } of WORLD_OPTIONS) {
      expect(resolveWorldSelection('?world=' + worldId)).toBe(worldId);
    }
  });
  it('湖面兼容旧参数，云海和室内会清掉湖面覆盖', () => {
    expect(resolveWorldSelection('?world=cloud-sea&lake360=1')).toBe('lake');
    expect(worldSelectionUrl('http://127.0.0.1:5201/game/?theme=noir&lake360=1#play', 'cloud-sea'))
      .toBe('http://127.0.0.1:5201/game/?theme=noir&world=cloud-sea#play');
    expect(worldSelectionUrl('http://127.0.0.1:5201/game/?theme=noir#play', 'lake'))
      .toBe('http://127.0.0.1:5201/game/?theme=noir&world=lake&lake360=1#play');
  });
});
