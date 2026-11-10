import dayjs from 'dayjs'

export function formatDate(value) {
  if (!value) return '—'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : value
}

export function formatShortDate(value) {
  if (!value) return '—'
  const parsed = dayjs(value)
  if (!parsed.isValid()) return value
  const now = dayjs()
  if (parsed.isSame(now, 'day')) return parsed.format('今天 HH:mm')
  if (parsed.isSame(now.subtract(1, 'day'), 'day')) return `昨天 ${parsed.format('HH:mm')}`
  if (parsed.isSame(now, 'year')) return parsed.format('MM-DD HH:mm')
  return parsed.format('YYYY-MM-DD')
}

export function tagTone(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return hash % 6
}

export function pluralRecords(count) {
  return `${count} 条记录`
}

export function classNames(...values) {
  return values.filter(Boolean).join(' ')
}
