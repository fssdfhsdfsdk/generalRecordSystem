import React from 'react'
import { tagTone } from '../utils'

export default function TagPill({
  name,
  count,
  onClick,
  active = false,
  size = 'md',
  className = '',
}) {
  const content = (
    <>
      <span className="tag-hash">#</span>
      <span className="tag-name">{name}</span>
      {count !== undefined && count !== null ? (
        <span className="tag-count">{count}</span>
      ) : null}
    </>
  )

  const classes = [
    'tag-pill',
    `tag-tone-${tagTone(name)}`,
    `tag-pill-${size}`,
    active ? 'is-active' : '',
    onClick ? 'is-clickable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        onClick={(event) => {
          event.stopPropagation()
          onClick(name)
        }}
      >
        {content}
      </button>
    )
  }
  return <span className={classes}>{content}</span>
}
