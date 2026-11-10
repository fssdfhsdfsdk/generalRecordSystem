import React, { useMemo } from 'react'
import { parseTags } from '../../../router'
import ToolListPage from './ToolListPage'

export default function ToolFuzzyTagPage({ query }) {
  const keywords = useMemo(() => parseTags(query), [query])
  return (
    <ToolListPage
      fuzzyTagMode
      fuzzyTagQuery={keywords.join(' ')}
      headerTitle="工具标签模糊搜索"
      headerDescription={
        keywords.length
          ? `搜索标签名同时包含 ${keywords
              .map((keyword) => `“${keyword}”`)
              .join(' ')} 的工具（多个关键词 AND）。`
          : '按标签模糊搜索所有工具。多个关键词用空格分隔，结果需要同时命中全部关键词。'
      }
    />
  )
}
