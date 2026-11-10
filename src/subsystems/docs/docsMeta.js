export const DOC_STATUS_META = {
  unread: {
    label: '未阅读',
    tone: 'gray',
    description: '还没有开始阅读。',
  },
  reading: {
    label: '进行中',
    tone: 'blue',
    description: '正在阅读，进度会保留在文档中。',
  },
  completed: {
    label: '完成',
    tone: 'green',
    description: '已经读完，可以继续补充笔记与感想。',
  },
}

export const DOC_STATUS_OPTIONS = Object.entries(DOC_STATUS_META).map(
  ([value, meta]) => ({ value, label: meta.label }),
)

export const DOC_PRIORITY_META = {
  1: { label: '很低', tone: 'gray' },
  2: { label: '较低', tone: 'teal' },
  3: { label: '普通', tone: 'blue' },
  4: { label: '较高', tone: 'amber' },
  5: { label: '最高', tone: 'rose' },
}

export const DOC_PRIORITY_OPTIONS = Object.entries(DOC_PRIORITY_META).map(
  ([value, meta]) => ({
    value: Number(value),
    label: `P${value} · ${meta.label}`,
  }),
)

export const DOC_TYPE_TONES = ['violet', 'blue', 'amber', 'teal', 'rose']

const SLUG_TONES = {
  books: 'violet',
  papers: 'blue',
  articles: 'amber',
  tech: 'teal',
  business: 'rose',
}

const SLUG_KICKERS = {
  books: 'BOOKS',
  papers: 'PAPERS',
  articles: 'ARTICLES',
  tech: 'TECH & SPECS',
  business: 'BUSINESS',
}

export function docTypeTone(type, index = 0) {
  if (type?.slug && SLUG_TONES[type.slug]) return SLUG_TONES[type.slug]
  const numericId = Number(type?.id)
  if (Number.isFinite(numericId) && numericId > 0) {
    return DOC_TYPE_TONES[(numericId - 1) % DOC_TYPE_TONES.length]
  }
  return DOC_TYPE_TONES[index % DOC_TYPE_TONES.length]
}

export function docTypeMeta(type) {
  return {
    kicker: type?.slug ? SLUG_KICKERS[type.slug] : 'DOCUMENTS',
    tone: docTypeTone(type),
    description: type?.description || '这一类文档的说明还没有填写。',
  }
}

export function docStatusMeta(status) {
  return DOC_STATUS_META[status] || DOC_STATUS_META.unread
}

export function docPriorityMeta(priority) {
  return DOC_PRIORITY_META[Number(priority)] || DOC_PRIORITY_META[3]
}

export function formatDocHours(value) {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return `${Number.isInteger(number) ? number : number.toFixed(2)} h`
}

export function formatHistoryRange(start, end) {
  if (!start && !end) return '未记录起止时间'
  const compact = (value) => String(value).slice(0, 16)
  if (start && end) return `${compact(start)} → ${compact(end)}`
  if (start) return `${compact(start)} 起`
  return `截止 ${compact(end)}`
}
