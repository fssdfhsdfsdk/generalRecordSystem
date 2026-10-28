import React from 'react'
import { Tooltip } from 'antd'

export const TITLE_PREVIEW_CHARS = 48

export function previewTitle(text, maxChars = TITLE_PREVIEW_CHARS) {
  const value = String(text ?? '')
  const characters = Array.from(value)
  if (characters.length <= maxChars) {
    return { display: value, truncated: false }
  }
  return {
    display: `${characters.slice(0, maxChars).join('')}...`,
    truncated: true,
  }
}

/**
 * A title that is limited to a readable number of characters. The complete
 * title is always available in a tooltip, even when CSS also truncates it.
 */
export default function TitleText({
  text,
  maxChars = TITLE_PREVIEW_CHARS,
  className = '',
  as: Tag = 'span',
  placement = 'topLeft',
}) {
  const value = String(text ?? '')
  const { display } = previewTitle(value, maxChars)
  const node = (
    <Tag className={`title-text ${className}`.trim()} aria-label={value}>
      {display}
    </Tag>
  )

  if (!value) return node
  return (
    <Tooltip title={value} placement={placement} mouseEnterDelay={0.2}>
      {node}
    </Tooltip>
  )
}
