import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  Card,
  Input,
  Popconfirm,
  Result,
  Select,
  Space,
  Table,
  Tooltip,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FilterOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { api } from '../api'
import { useAppData } from '../App'
import { navigate } from '../router'
import { formatDate, formatShortDate } from '../utils'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import TagPill from '../components/TagPill'
import TitleText from '../components/TitleText'
import RecordViewDrawer from '../components/RecordViewDrawer'
import RecordFormDrawer from '../components/RecordFormDrawer'
import TypeIcon from '../components/TypeIcon'

export default function RecordsPage({ typeId }) {
  const { message } = AntApp.useApp()
  const { types, typesLoading, reloadTypes } = useAppData()
  const type = useMemo(
    () => types.find((item) => String(item.id) === String(typeId)),
    [types, typeId],
  )

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState([])
  const [tagOptions, setTagOptions] = useState([])
  const [viewId, setViewId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)

  const loadRecords = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.listRecords({
        typeId,
        q: searchQuery,
        tags: selectedTags,
      })
      setRecords(data.records)
    } catch (error) {
      message.error(error.message)
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [typeId, searchQuery, selectedTags, message])

  const loadTags = useCallback(async () => {
    try {
      const data = await api.listTags({ sort: 'count' })
      setTagOptions(data.tags)
    } catch (error) {
      message.error(error.message)
    }
  }, [message])

  useEffect(() => {
    setSearchInput('')
    setSearchQuery('')
    setSelectedTags([])
    setViewId(null)
  }, [typeId])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  useEffect(() => {
    loadTags()
  }, [loadTags])

  const refreshAll = async () => {
    await Promise.all([loadRecords(), loadTags(), reloadTypes()])
  }

  const openEditor = async (recordId) => {
    try {
      const record = await api.getRecord(recordId)
      setEditingRecord(record)
      setViewId(null)
      setFormOpen(true)
    } catch (error) {
      message.error(error.message)
    }
  }

  const deleteRecord = async (record) => {
    try {
      await api.deleteRecord(record.id)
      message.success('记录已删除')
      setViewId(null)
      refreshAll()
    } catch (error) {
      message.error(error.message)
    }
  }

  const clearFilters = () => {
    setSearchInput('')
    setSearchQuery('')
    setSelectedTags([])
  }

  const filtersActive = Boolean(searchQuery || selectedTags.length)

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
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 260,
      responsive: ['md'],
      render: (tags) => (
        <div className="table-tag-list">
          {tags.slice(0, 4).map((tag) => (
            <TagPill
              key={tag}
              name={tag}
              size="sm"
              onClick={() => navigate(`/tags/${encodeURIComponent(tag)}`)}
            />
          ))}
          {tags.length > 4 ? (
            <span className="more-tag">+{tags.length - 4}</span>
          ) : null}
          {!tags.length ? <span className="muted-text">—</span> : null}
        </div>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 150,
      responsive: ['md'],
      render: (value) => (
        <Tooltip title={formatDate(value)}>
          <span className="table-date">{formatShortDate(value)}</span>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 132,
      align: 'right',
      render: (_, record) => (
        <Space size={0} className="table-actions">
          <Tooltip title="查看">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setViewId(record.id)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditor(record.id)}
            />
          </Tooltip>
          <Popconfirm
            title="删除这条记录？"
            description="删除后不可恢复，标签本身会保留。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteRecord(record)}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  if (!typesLoading && !type) {
    return (
      <div className="page">
        <Result
          status="404"
          title="记录类型不存在"
          subTitle="它可能已经被删除，或者地址有误。"
          extra={
            <Space>
              <Button onClick={() => navigate('/')}>回到总览</Button>
              <Button type="primary" onClick={() => navigate('/manage')}>
                前往类型管理
              </Button>
            </Space>
          }
        />
      </div>
    )
  }

  if (!type) {
    return (
      <div className="page">
        <div className="page-loading">
          <span className="loading-bar" />
        </div>
      </div>
    )
  }

  return (
    <div className="page records-page">
      <PageHeader
        eyebrow="RECORD TYPE"
        title={
          <span className="title-with-icon">
            <TypeIcon name={type.name} size="lg" />
            {type.name}
          </span>
        }
        description={`${type.fields.length} 个字段 · ${type.record_count} 条记录。内容支持 Markdown 渲染。`}
        extra={
          <Space wrap>
            <Button icon={<SettingOutlined />} onClick={() => navigate('/manage')}>
              结构设置
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingRecord(null)
                setFormOpen(true)
              }}
            >
              新建记录
            </Button>
          </Space>
        }
      >
        <div className="field-legend">
          {type.fields.map((field, index) => (
            <span className="field-legend-item" key={field.id}>
              <span className="field-index">{String(index + 1).padStart(2, '0')}</span>
              {field.field_name}
            </span>
          ))}
        </div>
      </PageHeader>

      <Card className="toolbar-card" styles={{ body: { padding: 16 } }}>
        <div className="record-toolbar">
          <Input.Search
            allowClear
            value={searchInput}
            prefix={<SearchOutlined className="input-prefix" />}
            placeholder={`在「${type.name}」中搜索标题`}
            onChange={(event) => {
              setSearchInput(event.target.value)
              if (!event.target.value) setSearchQuery('')
            }}
            onSearch={(value) => setSearchQuery(value.trim())}
            className="toolbar-search"
          />
          <Select
            mode="multiple"
            allowClear
            value={selectedTags}
            onChange={(values) => setSelectedTags(values)}
            placeholder="按标签过滤 · 多标签为 AND"
            options={tagOptions.map((tag) => ({
              value: tag.name,
              label: `#${tag.name} (${tag.count})`,
            }))}
            className="toolbar-tags"
            maxTagCount="responsive"
            suffixIcon={<FilterOutlined />}
          />
          <div className="toolbar-tail">
            <span className="result-count">
              {loading ? '载入中…' : `${records.length} 条`}
            </span>
            {filtersActive ? (
              <Button type="link" size="small" onClick={clearFilters}>
                清除筛选
              </Button>
            ) : null}
            <Tooltip title="刷新">
              <Button
                type="text"
                icon={<ReloadOutlined spin={loading} />}
                onClick={() => refreshAll()}
              />
            </Tooltip>
          </div>
        </div>
      </Card>

      <Card className="table-card" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={records}
          loading={loading}
          pagination={{
            pageSize: 10,
            hideOnSinglePage: records.length <= 10,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
          }}
          locale={{
            emptyText: filtersActive ? (
              <EmptyState
                icon={<SearchOutlined />}
                title="没有匹配的记录"
                description="试试减少标签，或换一个标题关键词。"
                action={<Button onClick={clearFilters}>清除筛选</Button>}
                compact
              />
            ) : (
              <EmptyState
                icon={<PlusOutlined />}
                title={`「${type.name}」还没有记录`}
                description="这个类型下的内容会独立归档，不会和其它主题混在一起。"
                action={
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setEditingRecord(null)
                      setFormOpen(true)
                    }}
                  >
                    写第一条记录
                  </Button>
                }
                compact
              />
            ),
          }}
        />
      </Card>

      <RecordViewDrawer
        open={Boolean(viewId)}
        recordId={viewId}
        onClose={() => setViewId(null)}
        onEdit={(record) => {
          setEditingRecord(record)
          setViewId(null)
          setFormOpen(true)
        }}
        onDeleted={() => refreshAll()}
      />

      <RecordFormDrawer
        open={formOpen}
        typeId={type.id}
        typeName={type.name}
        fields={type.fields}
        record={editingRecord}
        onClose={() => {
          setFormOpen(false)
          setEditingRecord(null)
        }}
        onSaved={() => refreshAll()}
      />
    </div>
  )
}
