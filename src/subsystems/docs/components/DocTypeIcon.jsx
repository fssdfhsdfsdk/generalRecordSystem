import React from 'react'
import {
  BankOutlined,
  BookOutlined,
  CodeOutlined,
  FileDoneOutlined,
  ReadOutlined,
} from '@ant-design/icons'
import { docTypeTone } from '../docsMeta'

const SLUG_ICONS = {
  books: BookOutlined,
  papers: FileDoneOutlined,
  articles: ReadOutlined,
  tech: CodeOutlined,
  business: BankOutlined,
}

export function docTypeVisual(type, index = 0) {
  return {
    Icon: SLUG_ICONS[type?.slug] || BookOutlined,
    tone: docTypeTone(type, index),
  }
}

export default function DocTypeIcon({ type, index = 0, size = 'md' }) {
  const { Icon, tone } = docTypeVisual(type, index)
  return (
    <span className={`doc-type-icon doc-type-icon-${size} doc-tone-${tone}`}>
      <Icon />
    </span>
  )
}
