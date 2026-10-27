import React from 'react'
import {
  BugOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'

export function typeVisual(name = '') {
  if (/q\s*&\s*a|问答|faq/i.test(name)) {
    return { Icon: QuestionCircleOutlined, tone: 'violet' }
  }
  if (/根因|问题|bug|故障|异常/i.test(name)) {
    return { Icon: BugOutlined, tone: 'rose' }
  }
  if (/需求|prd|规格/i.test(name)) {
    return { Icon: FileTextOutlined, tone: 'blue' }
  }
  if (/知识|经验|笔记/i.test(name)) {
    return { Icon: DatabaseOutlined, tone: 'teal' }
  }
  return { Icon: FolderOpenOutlined, tone: 'amber' }
}

export default function TypeIcon({ name, size = 'md' }) {
  const { Icon, tone } = typeVisual(name)
  return (
    <span className={`type-icon type-icon-${size} type-tone-${tone}`}>
      <Icon />
    </span>
  )
}
