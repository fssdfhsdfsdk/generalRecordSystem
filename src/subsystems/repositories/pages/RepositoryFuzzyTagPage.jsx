import React, { useMemo } from 'react'
import { parseTags } from '../../../router'
import RepositoryListPage from './RepositoryListPage'

export default function RepositoryFuzzyTagPage({ query }) {
  const keywords = useMemo(() => parseTags(query), [query])
  return (
    <RepositoryListPage
      fuzzyTagMode
      fuzzyTagQuery={keywords.join(' ')}
      headerTitle="仓库标签模糊搜索"
      headerDescription={
        keywords.length
          ? `搜索标签名同时包含 ${keywords
              .map((keyword) => `“${keyword}”`)
              .join(' ')} 的仓库（多个关键词 AND）。`
          : '按标签模糊搜索所有仓库。多个关键词用空格分隔，结果需要同时命中全部关键词。'
      }
    />
  )
}
