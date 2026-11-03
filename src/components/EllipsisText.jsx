import React from 'react'
import { Tooltip } from 'antd'
import { previewTitle } from './TitleText'

export default function EllipsisText({
  text,
  maxChars = 38,
  className = '',
  placement = 'topLeft',
  empty = '—',
}) {
  const value = String(text ?? '').trim()
  if (!value) {
    return <span className={`ellipsis-text is-empty ${className}`.trim()}>{empty}</span>
  }
  const { display, truncated } = previewTitle(value, maxChars)
  const node = (
    <span
      className={`ellipsis-text ${className}`.trim()}
      title={truncated ? value : undefined}
      aria-label={value}
    >
      {display}
    </span>
  )
  return (
    <Tooltip title={value} placement={placement} mouseEnterDelay={0.2}>
      {node}
    </Tooltip>
  )
}
