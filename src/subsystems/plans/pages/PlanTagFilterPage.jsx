import React, { useMemo } from 'react'
import { parseTags } from '../../../router'
import PlanListPage from './PlanListPage'

export default function PlanTagFilterPage({ query }) {
  const tags = useMemo(() => parseTags(query), [query])
  return (
    <PlanListPage
      fixedTags={tags}
      headerTitle="计划标签筛选"
      headerDescription={
        tags.length > 1
          ? `同时包含 ${tags.map((tag) => `#${tag}`).join(' ')} 的计划（AND）。`
          : '按计划标签筛选，点击标签可继续查看关联计划。'
      }
    />
  )
}
