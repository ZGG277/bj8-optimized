/*
[INPUT]: 实际六袋/库边几何和渲染端点斜接函数
[OUTPUT]: 接头位置一致、法向厚度不变、有界延伸回归
[POS]: 独立约束检验；不以元数据或重复构造公式自证没有接缝
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import { CUSHION_SEGMENTS } from '../physics';
import { cushionJoinOutward } from './cushion-join';

describe('cushion visual miter joins', () => {
  it('shares every touching endpoint without changing the physical nose', () => {
    let joined = 0;
    for (const segment of CUSHION_SEGMENTS) {
      for (const point of [segment.a, segment.b]) {
        const outward = cushionJoinOutward(segment, point, CUSHION_SEGMENTS);
        expect(outward.x * segment.inward.x + outward.z * segment.inward.z).toBeCloseTo(-1, 8);
        expect(Math.hypot(outward.x, outward.z)).toBeLessThan(4);
        const other = CUSHION_SEGMENTS.find(candidate => candidate !== segment &&
          [candidate.a, candidate.b].some(p => Math.hypot(p.x - point.x, p.z - point.z) < 1e-8));
        if (!other) continue;
        const peer = cushionJoinOutward(other, point, CUSHION_SEGMENTS);
        expect(peer.x).toBeCloseTo(outward.x, 10);
        expect(peer.z).toBeCloseTo(outward.z, 10);
        joined++;
      }
    }
    expect(joined).toBeGreaterThan(24);
  });
});
