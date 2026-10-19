/**
 * 全项目数据模型。
 * 时间轴统一使用「当天 0:00 起的整数分钟数」(Min = number)，展示层再格式化为 HH:mm。
 */

export type TravelMode = 'walking' | 'transit' | 'riding' | 'driving' | 'mixed';

export const TRAVEL_MODE_LABEL: Record<TravelMode, string> = {
  walking: '步行',
  transit: '公交地铁',
  riding: '骑行',
  driving: '驾车',
  mixed: '智能混合',
};

/** 窗口类型。sunset-relative 为日出日落约束的第一步（光照限制的确定性部分）；其余为二期预留。 */
export type WindowKind = 'absolute' | 'sunset-relative' /* | 'sunrise-relative' | 'golden-hour' */;

export interface TimeWindow {
  id: string;
  kind: WindowKind;
  /** absolute 模式：当天分钟数 */
  startMin: number;
  endMin: number;
  /** sunset-relative 模式：相对日落时刻的偏移（分钟，可为负） */
  offsetStartMin?: number;
  offsetEndMin?: number;
  /** 硬窗：晚到视为不可行；软窗：晚到仅警告并计入惩罚 */
  hardness: 'hard' | 'soft';
  /** 软窗惩罚系数：每迟到 1 分钟折算的等效代价（分钟）。默认 3。 */
  penaltyPerMin: number;
}

export interface Stop {
  id: string;
  name: string;
  lng: number;
  lat: number;
  /** 拍摄/停留时长（分钟） */
  dwellMin: number;
  /** 打卡窗口（可多个：满足任意一个即可）；空数组 = 无限制 */
  windows: TimeWindow[];
  /** 必拍 / 顺路（v1 恒 must，二期实现无解时自动舍弃 optional） */
  priority: 'must' | 'optional';
  note?: string;
}

export interface StartPoint {
  name?: string;
  lng: number;
  lat: number;
}

/**
 * 单日方案。多天（二期）将引入 Days = Plan[] 的容器，Day 结构与 Plan 一致。
 */
export interface Plan {
  id: string;
  name: string;
  /** 日期 YYYY-MM-DD（影响日出日落换算与公交时刻参考） */
  date: string;
  mode: TravelMode;
  /** 固定出发时刻（当天分钟数） */
  departMin: number;
  start: StartPoint;
  /** 是否回到起点（环线） */
  returnToStart: boolean;
  stops: Stop[];
}

/** 距离矩阵。节点 0 = 起点，1..n = stops 按 Plan.stops 顺序。单位为分钟 / 米。 */
export interface Matrix {
  mode: TravelMode;
  generatedAt: number;
  durationMin: number[][];
  distanceM: number[][];
  /** 智能混合模式：每对路段的实际选择（步行 or 公交地铁），其他模式为 undefined */
  legModes?: ('walking' | 'transit')[][];
  /** amap = 全部来自真实路径规划；estimate = 全部估算；mixed = 部分估算 */
  source: 'amap' | 'estimate' | 'mixed';
  estimatedPairCount: number;
}

/** 单站时刻（核心「到达/离开时间戳」的唯一事实源） */
export interface ScheduleEntry {
  stopId: string;
  /** 在矩阵中的节点序号（1..n） */
  nodeIdx: number;
  name: string;
  arriveMin: number;
  /** 早到等待时长（分钟） */
  waitMin: number;
  /** 开始拍摄时刻 = arrive + wait */
  startMin: number;
  /** 离开时刻 = start + dwell */
  departMin: number;
  /** 软窗迟到罚分（分钟等效），硬窗已满足时为 0 */
  penaltyMin: number;
}

export interface TransitSegment {
  kind: 'walk' | 'subway' | 'bus' | 'rail' | 'other';
  lineName?: string;
  distanceM: number;
  durationMin: number;
  /** 乘车站（乘车段） */
  onStation?: string;
  /** 下车站（乘车段；步行段的「目的地」由下一段的上车站或指引推断） */
  offStation?: string;
  /** 途经站数（乘车段） */
  viaNum?: number;
  /** 高德返回的原始指引（悬浮提示用） */
  instruction?: string;
  /** 该段的路径几何（可能缺失，渲染时需容忍） */
  path?: [number, number][];
}

/** 路段结果。path（真实道路几何）由地图层按需拉取，求解/时刻表不依赖它。 */
export interface LegResult {
  fromIdx: number;
  toIdx: number;
  mode: TravelMode;
  distanceM: number;
  durationMin: number;
  departMin: number;
  arriveMin: number;
  estimated?: boolean;
  transitSegments?: TransitSegment[];
}

export interface Conflict {
  stopId: string;
  stopName: string;
  /** 硬窗晚到的分钟数 */
  lateMin: number;
  arriveMin: number;
  windowEndMin: number;
  suggestion: string;
}

export interface ScheduleStats {
  totalDistanceM: number;
  /** 在途时间合计（分钟） */
  totalTravelMin: number;
  totalWaitMin: number;
  /** 最后离开时刻（不返程）/ 回到起点时刻（返程） */
  finishMin: number;
  /** finishMin - departMin */
  totalElapsedMin: number;
}

export type SolverKind = 'exact-dp' | 'heuristic' | 'manual';

export interface RouteResult {
  planId: string;
  mode: TravelMode;
  departMin: number;
  returnToStart: boolean;
  order: number[];
  schedule: ScheduleEntry[];
  legs: LegResult[];
  /** 返程段（returnToStart=true 时存在） */
  returnLeg?: LegResult;
  stats: ScheduleStats;
  conflicts: Conflict[];
  solver: SolverKind;
  /** 启发式求解时的目标值（分钟，含软窗罚分） */
  objectiveCost?: number;
  generatedAt: number;
}

/** 项目存档（JSON 导出/导入） */
export interface PlanArchive {
  version: 1;
  plan: Plan;
  result?: RouteResult;
}
