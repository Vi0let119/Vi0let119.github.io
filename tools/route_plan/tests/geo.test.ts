/** 路径平行偏移单测：来回路线分居两侧（解决地图上路线重叠不可辨认） */

import { describe, expect, it } from 'vitest';
import { offsetPathRight } from '../src/utils/geo';

const M_PER_DEG_LAT = 111320;

describe('offsetPathRight（行进方向右侧偏移）', () => {
  it('东西向直路：向右侧（南）偏移指定米数', () => {
    const path: [number, number][] = [
      [121.4, 31.2],
      [121.41, 31.2],
    ];
    const out = offsetPathRight(path, 100);
    expect(out).toHaveLength(2);
    for (let i = 0; i < path.length; i++) {
      expect(out[i][0]).toBeCloseTo(path[i][0], 10); // 经度不变（纯南北向偏移）
      expect(out[i][1]).toBeCloseTo(path[i][1] - 100 / M_PER_DEG_LAT, 10);
    }
  });

  it('来回路线（反向路径）分居道路两侧，间距 ≈ 2×偏移量', () => {
    const forward = offsetPathRight(
      [
        [121.4, 31.2],
        [121.41, 31.2],
      ],
      80,
    );
    const backward = offsetPathRight(
      [
        [121.41, 31.2],
        [121.4, 31.2],
      ],
      80,
    );
    // 去程向南偏（右侧），回程向北偏（右侧），两者分开约 160m
    const separationM = Math.abs(forward[0][1] - backward[1][1]) * M_PER_DEG_LAT;
    expect(separationM).toBeCloseTo(160, 0);
    expect(forward[0][1]).toBeLessThan(31.2);
    expect(backward[1][1]).toBeGreaterThan(31.2);
  });

  it('单点或空路径原样返回', () => {
    expect(offsetPathRight([[121.4, 31.2]], 10)).toEqual([[121.4, 31.2]]);
    expect(offsetPathRight([], 10)).toEqual([]);
  });

  it('偏移量为 0 时不改变路径', () => {
    const path: [number, number][] = [
      [121.4, 31.2],
      [121.41, 31.21],
    ];
    expect(offsetPathRight(path, 0)).toBe(path);
  });
});
