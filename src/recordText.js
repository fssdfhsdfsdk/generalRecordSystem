/**
 * Build a portable Markdown representation of a record for "copy all".
 * The title is always copied in full even when the UI shows an ellipsis.
 */
export function buildRecordMarkdown(record) {
  if (!record) return ''

  const lines = [
    `# ${record.title || ''}`,
    '',
    `- 类型：${record.type_name || ''}`,
    `- 创建时间：${record.created_at || ''}`,
    `- 更新时间：${record.updated_at || ''}`,
    `- 标签：${record.tags?.length ? record.tags.map((tag) => `#${tag}`).join(' ') : '无'}`,
    '',
    '---',
    '',
  ]

  ;(record.fields || []).forEach((field) => {
    lines.push(`## ${field.name || ''}`, '')
    const value = String(field.value || '').trim()
    lines.push(value || '（空）', '')
  })

  return `${lines.join('\n').trimEnd()}\n`
}
