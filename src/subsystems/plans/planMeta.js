export const PLAN_TYPES = [
  {
    key: 'long',
    label: '长远计划',
    short: '长远',
    path: '/plans/long',
    kicker: 'LONG TERM',
    description: '以季度、年度为尺度，关注方向、积累与结构性目标。',
    tone: 'violet',
  },
  {
    key: 'mid',
    label: '中期计划',
    short: '中期',
    path: '/plans/mid',
    kicker: 'MID TERM',
    description: '以月为尺度，把长期方向拆成可交付的阶段。',
    tone: 'blue',
  },
  {
    key: 'short',
    label: '短期计划',
    short: '短期',
    path: '/plans/short',
    kicker: 'SHORT TERM',
    description: '以周、日为尺度，聚焦下一件具体要做完的事。',
    tone: 'amber',
  },
]

export const PLAN_TYPE_MAP = Object.fromEntries(
  PLAN_TYPES.map((item) => [item.key, item]),
)

export const PLAN_STATUS_META = {
  in_progress: {
    label: '进行中',
    tone: 'blue',
    description: '正在推进，可以继续记录进度与节点。',
  },
  completed: {
    label: '完成',
    tone: 'green',
    description: '已完成；重新打开会写入状态审计。',
  },
  abandoned: {
    label: '放弃',
    tone: 'gray',
    description: '已放弃；重新打开会写入状态审计。',
  },
  overdue: {
    label: '超时',
    tone: 'red',
    description: '已超过计划时间，等待恢复或收尾。',
  },
  on_hold: {
    label: '搁置',
    tone: 'gold',
    description: '暂缓推进，恢复后回到进行中。',
  },
}

export const PLAN_STATUS_OPTIONS = Object.entries(PLAN_STATUS_META).map(
  ([value, meta]) => ({ value, label: meta.label }),
)

export const NODE_STATUS_META = {
  pending: { label: '未开始', tone: 'gray' },
  in_progress: { label: '进行中', tone: 'blue' },
  completed: { label: '完成', tone: 'green' },
  abandoned: { label: '放弃', tone: 'gray' },
}

export const NODE_STATUS_OPTIONS = Object.entries(NODE_STATUS_META).map(
  ([value, meta]) => ({ value, label: meta.label }),
)

export const PROGRESS_TYPE_META = {
  progress: { label: '进度变化', tone: 'blue' },
  blocker: { label: '阻塞', tone: 'red' },
  difficulty: { label: '困难', tone: 'gold' },
}

export const PROGRESS_TYPE_OPTIONS = Object.entries(PROGRESS_TYPE_META).map(
  ([value, meta]) => ({ value, label: meta.label }),
)

export const ALLOWED_TRANSITIONS = {
  in_progress: ['completed', 'abandoned', 'overdue', 'on_hold'],
  on_hold: ['in_progress', 'abandoned'],
  overdue: ['in_progress', 'completed', 'abandoned'],
  completed: ['in_progress'],
  abandoned: ['in_progress'],
}

export function planTypeMeta(type) {
  return PLAN_TYPE_MAP[type] || PLAN_TYPE_MAP.short
}

export function planStatusMeta(status) {
  return PLAN_STATUS_META[status] || PLAN_STATUS_META.in_progress
}

export function formatHours(value) {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return `${Number.isInteger(number) ? number : number.toFixed(2)} h`
}

export function formatRange(start, end) {
  if (!start && !end) return '未设置时间线'
  if (start && end) return `${start.slice(0, 16)} → ${end.slice(0, 16)}`
  if (start) return `${start.slice(0, 16)} 起`
  return `截止 ${end.slice(0, 16)}`
}

export function formatRangeCompact(start, end) {
  if (!start && !end) return '未设置'
  const compact = (value) => value.slice(5, 16)
  if (start && end) return `${compact(start)} → ${compact(end)}`
  if (start) return `${compact(start)} 起`
  return `截止 ${compact(end)}`
}
