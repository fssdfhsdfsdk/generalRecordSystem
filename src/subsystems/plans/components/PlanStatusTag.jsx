import React from 'react'
import { Tag } from 'antd'
import { planStatusMeta } from '../planMeta'

export default function PlanStatusTag({ status, size = 'default' }) {
  const meta = planStatusMeta(status)
  return (
    <Tag
      className={`plan-status-tag plan-status-${meta.tone} ${
        size === 'small' ? 'plan-status-tag-sm' : ''
      }`}
      bordered={false}
    >
      <span className="plan-status-dot" />
      {meta.label}
    </Tag>
  )
}
