/**
 * 路段视觉样式：地图与时间轴共用同一配色来源，保证「地图线条 ↔ 时刻表圆点」可对照。
 *
 * 规则：
 * 1) 线型只由方式决定 —— 步行（含公交段的接驳步行）一律虚线，公交/骑行/驾车一律实线；
 *    估算降级不改线型，只在标签标注「（估算）」并降低不透明度。
 * 2) 每条路线（leg）取唯一颜色（20 色精选盘，相邻段色差最大；≤20 段不重复），
 *    避免多条路线同色难以识别。
 * 3) 分层：公交车辆段永远画在步行类虚线之上，重叠时不被覆盖。
 */

/**
 * 20 色精选盘：按使用频率排序，相邻序号的色相/明度差异刻意做大；
 * 单日上限（16 点 + 返程 = 17 段）内绝不重复；超出 20 段后循环。
 * 按暗色底图选色（整体比浅色版更亮），保证深色地图上依然醒目。
 */
export const LEG_PALETTE = [
  '#3b82f6', // 蓝
  '#f97316', // 橙
  '#22c55e', // 绿
  '#ef4444', // 红
  '#8b5cf6', // 紫罗兰
  '#06b6d4', // 青
  '#ec4899', // 品红
  '#ca8a04', // 琥珀
  '#84cc16', // 黄绿
  '#a855f7', // 紫
  '#14b8a6', // 青绿
  '#f87171', // 浅红
  '#60a5fa', // 浅蓝
  '#fb923c', // 浅橙
  '#4ade80', // 浅绿
  '#f9a8d4', // 浅粉
  '#818cf8', // 靛蓝
  '#67e8f9', // 浅青
  '#d4a72c', // 金黄
  '#c084fc', // 浅紫
];

/** 每条路线唯一颜色（含公交段）；时间轴圆点与地图线条同色 */
export function legColor(legIndex: number): string {
  return LEG_PALETTE[legIndex % LEG_PALETTE.length];
}

/** 单模式路段的线型：步行用虚线，其余实线（估算不改线型） */
export const SINGLE_LEG_STYLE: Record<string, { weight: number; style: 'solid' | 'dashed' }> = {
  walking: { weight: 5, style: 'dashed' },
  riding: { weight: 5, style: 'solid' },
  driving: { weight: 6, style: 'solid' },
  transit: { weight: 6, style: 'solid' },
  mixed: { weight: 5, style: 'solid' },
};

/** 公交段内：接驳步行虚线、车辆段实线（同 leg 同色，线型区分步行/乘车） */
export const TRANSIT_WALK_STYLE = { weight: 4, style: 'dashed' as const };
export function transitVehicleWeight(kind: string): number {
  return kind === 'subway' ? 7 : 6;
}

/** 图层层级：公交车辆段 > 公交接驳步行 > 单模式路段 */
export const Z_SINGLE_LEG = 60;
export const Z_TRANSIT_WALK = 62;
export const Z_TRANSIT_VEHICLE = 82;
export const Z_LEG_LABEL = 120;

/**
 * 路径平行偏移距离（米）：所有路线沿行进方向右侧偏移，
 * 来回路线自动分居道路两侧；同向重叠的路线靠颜色区分。
 */
export const LEG_OFFSET_METERS = 10;
