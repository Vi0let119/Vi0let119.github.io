/** 智能混合模式的规则单测 */

import { describe, expect, it } from 'vitest';
import { chooseLegMode, MIXED_WALK_MAX_METERS } from '../src/services/mixedRule';

describe('chooseLegMode（智能混合规则）', () => {
  it('步行距离 <2km → 步行（无论公交多快）', () => {
    expect(chooseLegMode(1999, 25, 5)).toBe('walking');
    expect(chooseLegMode(500, 7, 3)).toBe('walking');
  });

  it('≥2km 且公交更快 → 公交地铁', () => {
    expect(chooseLegMode(3000, 40, 18)).toBe('transit');
    expect(chooseLegMode(8000, 100, 45)).toBe('transit');
  });

  it('≥2km 且步行不慢于公交 → 步行（相等取步行）', () => {
    expect(chooseLegMode(2500, 30, 35)).toBe('walking');
    expect(chooseLegMode(2500, 30, 30)).toBe('walking');
  });

  it('公交无方案（null）→ 步行降级', () => {
    expect(chooseLegMode(5000, 60, null)).toBe('walking');
  });

  it('边界：恰好 2000m 进入时间比较', () => {
    expect(MIXED_WALK_MAX_METERS).toBe(2000);
    expect(chooseLegMode(2000, 25, 20)).toBe('transit');
    expect(chooseLegMode(2000, 25, 30)).toBe('walking');
  });
});
