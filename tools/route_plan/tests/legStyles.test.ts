/** 视觉规则与换乘文案单测：每段唯一配色、步行虚线/其余实线、结构化换乘明细 */

import { describe, expect, it } from 'vitest';
import { LEG_PALETTE, legColor, SINGLE_LEG_STYLE } from '../src/map/legStyles';
import {
  shortLineName,
  transitSegmentsDetailed,
  transitSplitSums,
  transitSplitText,
} from '../src/model/transitText';
import type { TransitSegment } from '../src/model/types';

describe('legColor（每段唯一配色）', () => {
  it('单日上限 17 段（16 点 + 返程）内颜色互不相同', () => {
    const colors = Array.from({ length: 17 }, (_, i) => legColor(i));
    expect(new Set(colors).size).toBe(17);
  });

  it('调色盘本身无重复且为合法 hex', () => {
    expect(new Set(LEG_PALETTE).size).toBe(LEG_PALETTE.length);
    for (const c of LEG_PALETTE) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('同一 legIndex 输出稳定', () => {
    expect(legColor(5)).toBe(legColor(5));
  });
});

describe('线型规则（步行虚线、其余实线）', () => {
  it('步行 = 虚线；骑行/驾车/公交兜底 = 实线', () => {
    expect(SINGLE_LEG_STYLE.walking.style).toBe('dashed');
    expect(SINGLE_LEG_STYLE.riding.style).toBe('solid');
    expect(SINGLE_LEG_STYLE.driving.style).toBe('solid');
    expect(SINGLE_LEG_STYLE.transit.style).toBe('solid');
  });
});

const SEGS: TransitSegment[] = [
  { kind: 'walk', distanceM: 3130, durationMin: 49, instruction: '步行3130米到达中山公园地铁站' },
  {
    kind: 'bus',
    lineName: '96路(中山公园地铁站--中山南路西藏南路)',
    distanceM: 3200,
    durationMin: 20,
    viaNum: 5,
    onStation: '中山公园地铁站',
    offStation: '复兴西路武康路',
    instruction: '乘坐96路(中山公园地铁站--中山南路西藏南路)途径5站到达复兴西路武康路',
  },
  { kind: 'walk', distanceM: 443, durationMin: 8, instruction: '步行443米到达目的地' },
];

describe('transitSegmentsDetailed（步行/乘车分步：时间·距离·目的地）', () => {
  it('步行段目的地 = 下一乘车段的上车站', () => {
    const d = transitSegmentsDetailed(SEGS);
    expect(d[0].text).toContain('步行 3.1km · 49m');
    expect(d[0].text).toContain('→ 中山公园地铁站');
    expect(d[0].icon).toBe('🚶');
  });

  it('乘车段含线路简称、站数、距离、时长与下车站', () => {
    const d = transitSegmentsDetailed(SEGS);
    expect(d[1].text).toContain('96路');
    expect(d[1].text).not.toContain('--'); // 括号内区间已省略
    expect(d[1].text).toContain('5站');
    expect(d[1].text).toContain('3.2km');
    expect(d[1].text).toContain('→ 复兴西路武康路');
    expect(d[1].icon).toBe('🚌');
  });

  it('末段步行目的地为「目的地」', () => {
    expect(transitSegmentsDetailed(SEGS)[2].text).toContain('→ 目的地');
  });

  it('站点字段缺失时从指引文本兜底解析目的地', () => {
    const segs: TransitSegment[] = [
      { kind: 'walk', distanceM: 952, durationMin: 18, instruction: '步行952米到达南京东路' },
      { kind: 'subway', distanceM: 6610, durationMin: 18, instruction: '乘坐地铁10号线途径4站到达上海图书馆' },
    ];
    const d = transitSegmentsDetailed(segs);
    expect(d[0].text).toContain('→ 南京东路');
    expect(d[1].text).toContain('→ 上海图书馆');
  });
});

describe('transitSplitSums / transitSplitText（步行与乘车分开合计）', () => {
  it('距离与时间分别合计', () => {
    const split = transitSplitSums(SEGS);
    expect(split.walkDistanceM).toBe(3573);
    expect(split.walkDurationMin).toBe(57);
    expect(split.rideDistanceM).toBe(3200);
    expect(split.rideDurationMin).toBe(20);
    const text = transitSplitText(split);
    expect(text).toContain('步行 3.6km · 57m');
    expect(text).toContain('乘车 3.2km · 20m');
  });

  it('线路名去括号', () => {
    expect(shortLineName('地铁10号线(基隆路--虹桥火车站)')).toBe('地铁10号线');
    expect(shortLineName('96路')).toBe('96路');
  });
});
