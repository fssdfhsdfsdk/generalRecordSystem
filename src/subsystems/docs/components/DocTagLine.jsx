import React from 'react'
import { Tooltip } from 'antd'
import TagPill from '../../../components/TagPill'

export default function DocTagLine({
  tags = [],
  max = 3,
  size = 'sm',
  onTagClick,
}) {
  if (!tags.length) return <span className="muted-text">—</span>
  const shown = tags.slice(0, max)
  const rest = tags.length - shown.length
  return (
    <Tooltip title={tags.map((tag) => `#${tag}`).join('  ')}>
      <span className="doc-tag-line">
        {shown.map((tag) => (
          <TagPill
            key={tag}
            name={tag}
            size={size}
            className="doc-tag-pill"
            onClick={onTagClick}
          />
        ))}
        {rest > 0 ? <span className="doc-tag-more">+{rest}</span> : null}
      </span>
    </Tooltip>
  )
}
