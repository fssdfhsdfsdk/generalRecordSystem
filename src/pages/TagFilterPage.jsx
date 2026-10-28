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
import { api } from '../api'
import { navigate, parseTags, tagFilterPath } from '../router'
import { formatDate, formatShortDate } from '../utils'
import PageHeader from '../components/PageHeader'
import TagPill from '../components/TagPill'
import TitleText from '../components/TitleText'
import EmptyState from '../components/EmptyState'
import RecordViewDrawer from '../components/RecordViewDrawer'

export default function TagFilterPage({ query }) {
  const { message } = AntApp.useApp()
  const tags = useMemo(() => parseTags(query), [query])
  const tagKey = tags.join('\u0000')
  const [input, setInput] = useState(query)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [allTags, setAllTags] = useState([])
  const [viewId, setViewId] = useState(null)

  useEffect(() => {
    setInput(query)
  }, [query])

  const loadRecords = async () => {
    if (!tags.length) return
    setLoading(true)
    try {
      const data = await api.listRecords({ tags })
      setRecords(data.records)
    } catch (error) {
      message.error(error.message)
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!tags.length) {
      setLoading(false)
      navigate('/tags')
      return
    }
    loadRecords()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagKey])

  useEffect(() => {
    api
      .listTags({ sort: 'count' })
      .then((data) => setAllTags(data.tags.filter((tag) => tag.count > 0)))
      .catch((error) => message.error(error.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyFilter = (value) => {
    const next = parseTags(value)
    if (!next.length) {
      navigate('/tags')
      return
    }
    navigate(tagFilterPath(next))
  }

  const removeTag = (tagToRemove) => {
    const next = tags.filter(
      (tag) => tag.toLocaleLowerCase() !== tagToRemove.toLocaleLowerCase(),
    )
    navigate(tagFilterPath(next))
  }

  const addTag = (tagToAdd) => {
    const exists = tags.some(
      (tag) => tag.toLocaleLowerCase() === tagToAdd.toLocaleLowerCase(),
    )
    if (exists) return
    navigate(tagFilterPath([...tags, tagToAdd]))
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
              active={tags.some(
                (item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase(),
              )}
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
        eyebrow="TAG FILTER"
        title={
          <span className="title-with-mode">
            标签筛选
            <span className="mode-badge">AND</span>
          </span>
        }
        description="同时满足所选标签的记录。点击标签可以继续叠加，或移除不想保留的条件。"
        extra={
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tags')}>
            返回标签库
          </Button>
        }
      />

      <Card className="filter-panel" styles={{ body: { padding: 22 } }}>
        <div className="filter-panel-head">
          <div>
            <div className="filter-label">组合条件</div>
            <div className="filter-sub">用空格或逗号分隔多个标签</div>
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
              <SearchOutlined /> 筛选
            </span>
          }
          placeholder="例如：Python Bug"
          className="filter-search"
        />
        <div className="filter-chip-row">
          {tags.map((tag) => (
            <span className="filter-chip" key={tag}>
              <span className="filter-chip-hash">#</span>
              {tag}
              <button
                type="button"
                className="filter-chip-close"
                aria-label={`移除标签 ${tag}`}
                onClick={() => removeTag(tag)}
              >
                <CloseOutlined />
              </button>
            </span>
          ))}
          {!tags.length ? (
            <span className="muted-text">还没有选择标签</span>
          ) : null}
        </div>
        <div className="filter-tip">
          <InfoCircleOutlined />
          标签之间是 AND 关系：记录必须同时带有全部标签。只选择一个标签时，会展示该标签下的所有记录。
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
              const active = tags.some(
                (item) => item.toLocaleLowerCase() === tag.name.toLocaleLowerCase(),
              )
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
                pageSize: 12,
                hideOnSinglePage: records.length <= 12,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 条`,
              }}
              scroll={{ x: 760 }}
              locale={{
                emptyText: (
                  <EmptyState
                    icon={<TagsOutlined />}
                    title="没有记录同时满足这些标签"
                    description="尝试移除一个标签，或回到标签库换一组条件。"
                    action={
                      <Space wrap>
                        {tags.map((tag) => (
                          <Button key={tag} size="small" onClick={() => removeTag(tag)}>
                            移除 #{tag}
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
