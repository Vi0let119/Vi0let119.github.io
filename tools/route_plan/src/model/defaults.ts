/** 默认值集中定义（旧默认起点的迁移逻辑依赖这些常量） */

import type { StartPoint } from './types';

/** 默认起点：华东师范大学普陀校区（中山北路3663号，坐标经高德 POI 搜索解析） */
export const DEFAULT_START: StartPoint = {
  name: '华东师范大学普陀校区',
  lng: 121.40468,
  lat: 31.227938,
};

/** 历史默认起点（上海人民广场）：加载旧存档时若起点仍是它（名称+坐标都未改），自动迁移为 DEFAULT_START */
export const LEGACY_DEFAULT_START: StartPoint = {
  name: '起点（可在卡片中修改）',
  lng: 121.4737,
  lat: 31.2304,
};
