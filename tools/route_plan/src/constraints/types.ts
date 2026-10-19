/**
 * 约束框架：所有「影响某点位到达时刻是否可行 / 代价多少」的规则都实现 SchedConstraint。
 * 求解器（DP）与时刻表引擎只消费 ResolvedStop + FastEvaluator，不感知具体约束语义。
 * 新增约束（营业时间 / 天气 / 必拍可选……）只需实现接口并注册，DP 与时刻表代码零改动。
 */

import type { Plan, Stop } from '../model/types';

/** 某点位的日照时刻（当天分钟数；极昼极夜等无解时为 null） */
export interface SunTimes {
  sunriseMin: number;
  sunsetMin: number;
  dawnMin: number;
  duskMin: number;
  /** 傍晚黄金时段起点（太阳约 +6°） */
  goldenEveningStartMin: number;
  /** 清晨黄金时段终点 */
  goldenMorningEndMin: number;
}

export interface ConstraintContext {
  plan: Plan;
  sunTimesByStop: Map<string, SunTimes | null>;
}

/** 解析后的绝对窗口（求解器唯一认识的窗口形态） */
export interface AbsWindow {
  startMin: number;
  endMin: number;
  hardness: 'hard' | 'soft';
  penaltyPerMin: number;
}

/** 单点位解析结果：求解器与时刻表的热路径数据 */
export interface ResolvedStop {
  stopId: string;
  name: string;
  dwellMin: number;
  /** 按 startMin 升序；空数组 = 无窗口限制 */
  windows: AbsWindow[];
}

export interface ConstraintVerdict {
  /** false = 硬性不可行（该到达时刻直接剪枝） */
  feasible: boolean;
  /** 早到需要等待到该时刻才可开始拍摄（分钟数；0 = 无需等待） */
  waitUntilMin: number;
  /** 软性代价（分钟等效） */
  penaltyMin: number;
  /** 违规信息（供冲突报告） */
  lateMin?: number;
  windowEndMin?: number;
  reason?: string;
}

export type FastEvaluator = (arriveMin: number) => ConstraintVerdict;

export type ConstraintKind =
  | 'time-window'
  | 'opening-hours'
  | 'sun-relative'
  | 'weather'
  | 'priority';

export interface SchedConstraint {
  id: string;
  kind: ConstraintKind;
  /** 求解前：把相对约束解析为绝对窗口（写入 resolved）。 */
  resolve?(stop: Stop, ctx: ConstraintContext, resolved: ResolvedStop, warnings: string[]): void;
  /** 通用评估（UI/报告用；热路径请提供 compile）。 */
  evaluate?(arriveMin: number, stop: Stop, ctx: ConstraintContext): ConstraintVerdict;
  /** 编译为热路径快速评估器（DP / 时刻表逐段调用）。 */
  compile?(stop: Stop, ctx: ConstraintContext, resolved: ResolvedStop): FastEvaluator;
}

export const FEASIBLE_VERDICT: ConstraintVerdict = {
  feasible: true,
  waitUntilMin: 0,
  penaltyMin: 0,
};
