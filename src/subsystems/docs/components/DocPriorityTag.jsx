import React from 'react'
import { Tooltip } from 'antd'
import { docPriorityMeta } from '../docsMeta'

export default function DocPriorityTag({ priority }) {
  const meta = docPriorityMeta(priority)
  return (
    <Tooltip title={`优先级 ${priority} · ${meta.label}`}>
      <span className={`doc-priority-tag doc-priority-${meta.tone}`}>
        P{priority}
      </span>
    </Tooltip>
  )
}
