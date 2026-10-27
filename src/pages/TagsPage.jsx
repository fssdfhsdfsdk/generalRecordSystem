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
import { api } from '../api'
import { navigate, tagFilterPath } from '../router'
import { tagTone } from '../utils'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

export default function TagsPage() {
  const { message } = AntApp.useApp()
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('count')
  const [cleaning, setCleaning] = useState(false)

  const loadTags = async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const data = await api.listTags({ sort: 'count' })
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
        (a, b) =>
          b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'),
      )
    }
    return result
  }, [tags, query, sort])

  const totalReferences = useMemo(
    () => tags.reduce((sum, tag) => sum + tag.count, 0),
    [tags],
  )
  const orphanCount = useMemo(() => tags.filter((tag) => !tag.count).length, [tags])

  const cleanup = async () => {
    setCleaning(true)
    try {
      const result = await api.cleanupTags()
      message.success(
        result.deleted ? `已清理 ${result.deleted} 个孤立标签` : '没有需要清理的孤立标签',
      )
      await loadTags(false)
    } catch (error) {
      message.error(error.message)
    } finally {
      setCleaning(false)
    }
  }

  return (
    <div className="page tags-page">
      <PageHeader
        eyebrow="TAG LIBRARY"
        title="标签库"
        description="标签在所有记录类型之间共享。点击任意标签，查看跨类型的所有关联记录。"
        extra={
          <Popconfirm
            title={`清理 ${orphanCount} 个孤立标签？`}
            description="只删除没有再被任何记录使用的标签，不会影响记录内容。"
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
          输入两个标签并进入筛选页，可以查看同时满足它们的记录。
        </div>
      </div>

      <div className="tag-toolbar">
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<SearchOutlined className="input-prefix" />}
          placeholder="模糊搜索标签名称"
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
              onClick={() => navigate(tagFilterPath([tag.name]))}
            >
              <div className="tag-card-top">
                <span className="tag-card-hash">#</span>
                <span className="tag-card-count">{tag.count}</span>
              </div>
              <div className="tag-card-name" title={tag.name}>
                {tag.name}
              </div>
              <div className="tag-card-foot">
                <span>{tag.count ? `${tag.count} 条记录` : '暂未被使用'}</span>
                <ArrowRightOutlined />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<TagsOutlined />}
          title={query ? '没有匹配的标签' : '标签库还是空的'}
          description={
            query
              ? '换一个关键词试试，或者清空搜索查看全部标签。'
              : '在写记录时为内容添加标签，它们会自动汇总到这里。'
          }
          action={
            query ? (
              <Button onClick={() => setQuery('')}>清空搜索</Button>
            ) : (
              <Space>
                <Button type="primary" onClick={() => navigate('/')}>
                  去写一条记录
                </Button>
              </Space>
            )
          }
        />
      )}
    </div>
  )
}
