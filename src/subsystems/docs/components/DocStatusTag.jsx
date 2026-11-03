import React from 'react'
import { docStatusMeta } from '../docsMeta'

export default function DocStatusTag({ status, size = 'md' }) {
  const meta = docStatusMeta(status)
  return (
    <span className={`doc-status-tag doc-status-${meta.tone} doc-status-${size}`}>
      <span className="doc-status-dot" />
      {meta.label}
    </span>
  )
}
