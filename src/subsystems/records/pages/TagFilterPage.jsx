import React, { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  Card,
  Input,
  Space,
  Table,
  Tooltip,
} from 'antd'
import {
  ArrowLeftOutlined,
  CloseOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  SearchOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { api } from '../../../api'
import {
  fuzzyTagPath,
  navigate,
  parseTags,
  tagFilterPath,
} from '../../../router'
import { formatDate, formatShortDate } from '../../../utils'
import PageHeader from '../../../components/PageHeader'
import TagPill from '../../../components/TagPill'
import TitleText from '../../../components/TitleText'
import EmptyState from '../../../components/EmptyState'
import RecordViewDrawer from '../components/RecordViewDrawer'

export default function TagFilterPage({ query, fuzzy = false }) {
  const { message } = AntApp.useApp()
  const tags = useMemo(() => parseTags(query), [query])
  const tagKey = tags.join('\u0000')
  const pageBase = fuzzy ? '/tag-search' : '/tags'
  const [input, setInput] = useState(query)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [pageSize, setPageSize] = useState(10)
  const [allTags, setAllTags] = useState([])
  const [viewId, setViewId] = useState(null)

  useEffect(() => {
    setInput(query)
  }, [query])

  const loadRecords = async () => {
    if (!fuzzy && !tags.length) return
    setLoading(true)
    try {
      const data = await api.listRecords(
        fuzzy ? { tagQ: tags.join(' ') } : { tags },
      )
      setRecords(data.records)
    } catch (error) {
      message.error(error.message)
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!fuzzy && !tags.length) {
      setLoading(false)
      navigate('/tags')
      return
    }
    loadRecords()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagKey, fuzzy])

  useEffect(() => {
    api
      .listTags({ sort: 'count' })
      .then((data) => setAllTags(data.tags.filter((tag) => tag.count > 0)))
      .catch((error) => message.error(error.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goToKeywords = (next) => {
    if (fuzzy) {
      navigate(fuzzyTagPath(next, pageBase))
      return
    }
    if (!next.length) {
      navigate('/tags')
      return
    }
    navigate(tagFilterPath(next))
  }

  const applyFilter = (value) => {
    goToKeywords(parseTags(value))
  }

  const removeTag = (tagToRemove) => {
    const next = tags.filter(
      (tag) => tag.toLocaleLowerCase() !== tagToRemove.toLocaleLowerCase(),
    )
    goToKeywords(next)
  }

  const addTag = (tagToAdd) => {
    const exists = tags.some(
      (tag) => tag.toLocaleLowerCase() === tagToAdd.toLocaleLowerCase(),
    )
    if (exists) return
    goToKeywords([...tags, tagToAdd])
  }

  const tagMatches = (name) => {
    if (!fuzzy) {
      return tags.some(
        (item) => item.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    }
    return tags.some((item) =>
      name.toLocaleLowerCase().includes(item.toLocaleLowerCase()),
    )
  }

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (_, record) => (
        <button
          type="button"
          className="table-title-button"
          aria-label={`查看记录：${record.title}`}
          onClick={() => setViewId(record.id)}
        >
          <TitleText text={record.title} maxChars={48} />
        </button>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type_name',
      key: 'type_name',
      width: 150,
      render: (name, record) => (
        <button
          type="button"
          className="type-text-link"
          onClick={() => navigate(`/type/${record.type_id}`)}
        >
          {name}
        </button>
      ),
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 280,
      render: (recordTags) => (
        <div className="table-tag-list">
          {recordTags.map((tag) => (
            <TagPill
              key={tag}
              name={tag}
              size="sm"
              active={tagMatches(tag)}
              onClick={(name) => applyFilter(tags.concat(name).join(' '))}
            />
          ))}
        </div>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 150,
      render: (value) => (
        <Tooltip title={formatDate(value)}>
          <span className="table-date">{formatShortDate(value)}</span>
        </Tooltip>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 56,
      align: 'right',
      render: (_, record) => (
        <Tooltip title="查看">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setViewId(record.id)}
          />
        </Tooltip>
      ),
    },
  ]

  return (
    <div className="page tag-filter-page">
      <PageHeader
        eyebrow={fuzzy ? 'FUZZY TAG SEARCH' : 'TAG FILTER'}
        title={
          <span className="title-with-mode">
            {fuzzy ? '标签模糊搜索' : '标签筛选'}
            <span className="mode-badge">{fuzzy ? '包含' : 'AND'}</span>
          </span>
        }
        description={
          fuzzy
            ? '在所有记录类型中搜索标签名包含关键词的记录。多个关键词用空格分隔，需要同时命中（AND）。'
            : '同时满足所选标签的记录。点击标签可以继续叠加，或移除不想保留的条件。'
        }
        extra={
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tags')}>
            返回标签库
          </Button>
        }
      />

      <Card className="filter-panel" styles={{ body: { padding: 22 } }}>
        <div className="filter-panel-head">
          <div>
            <div className="filter-label">
              {fuzzy ? '模糊关键词' : '组合条件'}
            </div>
            <div className="filter-sub">
              {fuzzy
                ? '用空格或逗号分隔多个关键词，标签名包含即可命中'
                : '用空格或逗号分隔多个标签'}
            </div>
          </div>
          <span className="filter-result">{loading ? '查询中…' : `${records.length} 条结果`}</span>
        </div>
        <Input.Search
          size="large"
          allowClear
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onSearch={applyFilter}
          enterButton={
            <span>
              <SearchOutlined /> 搜索
            </span>
          }
          placeholder={fuzzy ? '例如：py 并发' : '例如：Python Bug'}
          className="filter-search"
        />
        <div className="filter-chip-row">
          {tags.map((tag) => (
            <span className="filter-chip" key={tag}>
              <span className="filter-chip-hash">{fuzzy ? '含' : '#'}</span>
              {tag}
              <button
                type="button"
                className="filter-chip-close"
                aria-label={`移除${fuzzy ? '关键词' : '标签'} ${tag}`}
                onClick={() => removeTag(tag)}
              >
                <CloseOutlined />
              </button>
            </span>
          ))}
          {!tags.length ? (
            <span className="muted-text">
              {fuzzy ? '还没有输入关键词，当前显示全部记录' : '还没有选择标签'}
            </span>
          ) : null}
        </div>
        <div className="filter-tip">
          <InfoCircleOutlined />
          {fuzzy
            ? '关键词之间是 AND 关系：每条记录的标签需要同时包含全部关键词；单个关键词会匹配标签名中包含该词的记录。'
            : '标签之间是 AND 关系：记录必须同时带有全部标签。只选择一个标签时，会展示该标签下的所有记录。'}
        </div>
      </Card>

      <div className="tag-filter-layout">
        <aside className="tag-suggestion-panel">
          <div className="suggestion-head">
            <span>全部标签</span>
            <span className="suggestion-count">{allTags.length}</span>
          </div>
          <div className="suggestion-list">
            {allTags.slice(0, 36).map((tag) => {
              const active = tagMatches(tag.name)
              return (
                <TagPill
                  key={tag.id}
                  name={tag.name}
                  count={tag.count}
                  size="sm"
                  active={active}
                  onClick={active ? undefined : addTag}
                />
              )
            })}
            {!allTags.length ? (
              <div className="muted-text">还没有已使用的标签。</div>
            ) : null}
          </div>
        </aside>

        <div className="tag-result-panel">
          <Card className="table-card" styles={{ body: { padding: 0 } }}>
            <Table
              rowKey="id"
              columns={columns}
              dataSource={records}
              loading={loading}
              pagination={{
                pageSize,
                showSizeChanger: true,
                pageSizeOptions: [10, 20, 50],
                showTotal: (total) => `共 ${total} 条`,
                onChange: (_, size) => setPageSize(size),
              }}
              scroll={{ x: 760 }}
              locale={{
                emptyText: (
                  <EmptyState
                    icon={<TagsOutlined />}
                    title={
                      fuzzy
                        ? '没有记录的标签同时包含这些关键词'
                        : '没有记录同时满足这些标签'
                    }
                    description={
                      fuzzy
                        ? '尝试减少关键词，或换一组更短的片段再搜索。'
                        : '尝试移除一个标签，或回到标签库换一组条件。'
                    }
                    action={
                      <Space wrap>
                        {tags.map((tag) => (
                          <Button key={tag} size="small" onClick={() => removeTag(tag)}>
                            移除 {fuzzy ? '“' : '#'}
                            {tag}
                            {fuzzy ? '”' : ''}
                          </Button>
                        ))}
                      </Space>
                    }
                    compact
                  />
                ),
              }}
            />
          </Card>
        </div>
      </div>

      <RecordViewDrawer
        open={Boolean(viewId)}
        recordId={viewId}
        onClose={() => setViewId(null)}
        onDeleted={() => {
          loadRecords()
          api
            .listTags({ sort: 'count' })
            .then((data) => setAllTags(data.tags.filter((tag) => tag.count > 0)))
            .catch(() => {})
        }}
      />
    </div>
  )
}
