import React, { useMemo } from 'react'
import { parseTags } from '../../../router'
import PlanListPage from './PlanListPage'

export default function PlanFuzzyTagPage({ query }) {
  const keywords = useMemo(() => parseTags(query), [query])
  return (
    <PlanListPage
      fuzzyTagQuery={keywords.join(' ')}
      headerTitle="计划标签模糊搜索"
      headerDescription={
        keywords.length
          ? `在所有计划类型中搜索标签名同时包含 ${keywords
              .map((keyword) => `“${keyword}”`)
              .join(' ')} 的计划（AND）。`
          : '在所有计划类型中按标签模糊搜索。多个关键词用空格分隔，结果需要同时命中全部关键词。'
      }
    />
  )
}
