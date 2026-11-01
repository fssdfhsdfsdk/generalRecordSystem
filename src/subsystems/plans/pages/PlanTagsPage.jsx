import React, { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  Input,
  Popconfirm,
  Segmented,
  Space,
  Spin,
} from 'antd'
import {
  ArrowRightOutlined,
  ClearOutlined,
  SearchOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { planApi } from '../api'
import { navigate } from '../../../router'
import { tagTone } from '../../../utils'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'

export default function PlanTagsPage() {
  const { message } = AntApp.useApp()
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('count')
  const [cleaning, setCleaning] = useState(false)

  const loadTags = async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const data = await planApi.listTags({ sort: 'count' })
      setTags(data.tags)
    } catch (error) {
      message.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTags()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleTags = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    const filtered = keyword
      ? tags.filter((tag) => tag.name.toLocaleLowerCase().includes(keyword))
      : tags
    const result = [...filtered]
    if (sort === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    } else {
      result.sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'),
      )
    }
    return result
  }, [tags, query, sort])

  const totalReferences = tags.reduce((sum, tag) => sum + tag.count, 0)
  const orphanCount = tags.filter((tag) => !tag.count).length

  const cleanup = async () => {
    setCleaning(true)
    try {
      const result = await planApi.cleanupTags()
      message.success(
        result.deleted
          ? `已清理 ${result.deleted} 个孤立计划标签`
          : '没有需要清理的孤立标签',
      )
      await loadTags(false)
    } catch (error) {
      message.error(error.message)
    } finally {
      setCleaning(false)
    }
  }

  return (
    <div className="page plan-tags-page">
      <PageHeader
        eyebrow="PLAN TAGS"
        title="计划标签"
        description="计划使用独立标签词库，与通用记录互不影响。点击标签查看跨类型的关联计划。"
        extra={
          <Popconfirm
            title={`清理 ${orphanCount} 个孤立计划标签？`}
            description="只删除没有再被任何计划使用的标签，不影响通用记录的标签。"
            okText="清理"
            cancelText="取消"
            disabled={!orphanCount}
            onConfirm={cleanup}
          >
            <Button
              icon={<ClearOutlined />}
              disabled={!orphanCount}
              loading={cleaning}
            >
              清理孤立标签{orphanCount ? `（${orphanCount}）` : ''}
            </Button>
          </Popconfirm>
        }
      />

      <div className="tag-stats-strip">
        <div className="tag-stat">
          <span className="tag-stat-label">全部标签</span>
          <strong>{tags.length}</strong>
        </div>
        <div className="tag-stat">
          <span className="tag-stat-label">引用次数</span>
          <strong>{totalReferences}</strong>
        </div>
        <div className="tag-stat">
          <span className="tag-stat-label">孤立标签</span>
          <strong className={orphanCount ? 'is-warning' : ''}>{orphanCount}</strong>
        </div>
        <div className="tag-stat-copy">
          计划标签保存在 plans.db；通用记录的标签保存在 records.db。
        </div>
      </div>

      <div className="tag-toolbar">
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<SearchOutlined className="input-prefix" />}
          placeholder="模糊搜索计划标签"
          className="tag-search"
        />
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { label: '按数量', value: 'count' },
            { label: '按名称 A-Z', value: 'name' },
          ]}
        />
        <span className="result-count">{visibleTags.length} 个</span>
      </div>

      {loading ? (
        <div className="tag-loading">
          <Spin />
        </div>
      ) : visibleTags.length ? (
        <div className="tag-card-grid">
          {visibleTags.map((tag) => (
            <button
              type="button"
              className={`tag-card tag-tone-${tagTone(tag.name)} ${
                tag.count ? '' : 'is-orphan'
              }`}
              key={tag.id}
              onClick={() =>
                navigate(`/plans/tags/${encodeURIComponent(tag.name)}`)
              }
            >
              <div className="tag-card-top">
                <span className="tag-card-hash">#</span>
                <span className="tag-card-count">{tag.count}</span>
              </div>
              <div className="tag-card-name" title={tag.name}>
                {tag.name}
              </div>
              <div className="tag-card-foot">
                <span>{tag.count ? `${tag.count} 个计划` : '暂未被使用'}</span>
                <ArrowRightOutlined />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<TagsOutlined />}
          title={query ? '没有匹配的计划标签' : '计划标签还是空的'}
          description={
            query
              ? '换一个关键词试试，或者清空搜索查看全部标签。'
              : '创建计划时添加标签，它们会自动汇总到这里。'
          }
          action={
            query ? (
              <Button onClick={() => setQuery('')}>清空搜索</Button>
            ) : (
              <Space>
                <Button
                  type="primary"
                  onClick={() => navigate('/plans/short')}
                >
                  去创建计划
                </Button>
              </Space>
            )
          }
        />
      )}
    </div>
  )
}
