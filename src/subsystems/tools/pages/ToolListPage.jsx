import React, { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  Card,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
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
  TagsOutlined,
} from '@ant-design/icons'
import { toolApi } from '../api'
import { navigate } from '../../../router'
import { formatShortDate } from '../../../utils'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'
import TagPill from '../../../components/TagPill'
import TitleText from '../../../components/TitleText'
import ToolFormDrawer from '../components/ToolFormDrawer'
import ToolDetailDrawer from '../components/ToolDetailDrawer'

const SORT_OPTIONS = [
  { value: 'updated_desc', label: '最近更新' },
  { value: 'created_desc', label: '最近创建' },
  { value: 'name_asc', label: '名称 A-Z' },
]

function toggleValue(list, value) {
  const key = String(value).toLocaleLowerCase()
  return list.some((item) => String(item).toLocaleLowerCase() === key)
    ? list.filter((item) => String(item).toLocaleLowerCase() !== key)
    : [...list, value]
}

export default function ToolListPage({
  initialTags = [],
  initialPlatforms = [],
}) {
  const { message } = AntApp.useApp()
  const initialKey = `${initialTags.join('\u0000')}::${initialPlatforms.join('\u0000')}`
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [tags, setTags] = useState(initialTags)
  const [platforms, setPlatforms] = useState(initialPlatforms)
  const [tagOptions, setTagOptions] = useState([])
  const [platformOptions, setPlatformOptions] = useState([])
  const [sort, setSort] = useState('updated_desc')
  const [reloadToken, setReloadToken] = useState(0)
  const [detailId, setDetailId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingTool, setEditingTool] = useState(null)

  useEffect(() => {
    setTags(initialTags)
    setPlatforms(initialPlatforms)
    setQ('')
    setSort('updated_desc')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey])

  useEffect(() => {
    Promise.all([
      toolApi.listTags({ sort: 'count' }),
      toolApi.listPlatforms({ sort: 'count' }),
    ])
      .then(([tagsData, platformsData]) => {
        setTagOptions(tagsData.tags)
        setPlatformOptions(platformsData.platforms)
      })
      .catch((error) => message.error(error.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken])

  useEffect(() => {
    let alive = true
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await toolApi.list({
          q,
          tags: tags.join(','),
          platforms: platforms.join(','),
          sort,
          limit: 500,
        })
        if (alive) setTools(data.tools)
      } catch (error) {
        if (alive) {
          message.error(error.message)
          setTools([])
        }
      } finally {
        if (alive) setLoading(false)
      }
    }, 200)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [q, tags, platforms, sort, reloadToken, message])

  const filterCount =
    (q ? 1 : 0) +
    tags.length +
    platforms.length +
    (sort !== 'updated_desc' ? 1 : 0)

  const resetFilters = () => {
    setQ('')
    setTags([])
    setPlatforms([])
    setSort('updated_desc')
  }

  const removeTool = async (tool) => {
    try {
      await toolApi.remove(tool.id)
      message.success('工具已删除')
      setDetailId(null)
      setReloadToken((token) => token + 1)
    } catch (error) {
      message.error(error.message)
    }
  }

  const columns = useMemo(
    () => [
      {
        title: '名称',
        dataIndex: 'name',
        key: 'name',
        width: 380,
        render: (_, record) => (
          <div className="catalog-name-cell">
            <button
              type="button"
              className="table-title-button"
              onClick={() => setDetailId(record.id)}
            >
              <TitleText text={record.name} maxChars={44} />
            </button>
            <div className="catalog-name-tag-row">
              {record.platforms.length ? (
                record.platforms.map((item) => (
                  <TagPill
                    key={`platform-${item}`}
                    name={item}
                    size="sm"
                    active={platforms.includes(item)}
                    onClick={(name) =>
                      setPlatforms((current) => toggleValue(current, name))
                    }
                  />
                ))
              ) : (
                <span className="muted-text">未填写支持平台</span>
              )}
              {record.tags.map((item) => (
                <TagPill
                  key={`tag-${item}`}
                  name={item}
                  size="sm"
                  active={tags.includes(item)}
                  onClick={(name) =>
                    setTags((current) => toggleValue(current, name))
                  }
                />
              ))}
            </div>
          </div>
        ),
      },
      {
        title: '开源',
        dataIndex: 'is_open_source',
        key: 'is_open_source',
        width: 80,
        responsive: ['md'],
        render: (value) => (
          <Tag color={value ? 'green' : 'default'}>{value ? '开源' : '闭源'}</Tag>
        ),
      },
      {
        title: '资源',
        dataIndex: 'resource_count',
        key: 'resource_count',
        width: 78,
        responsive: ['md'],
        render: (value) => <span className="muted-text">{value} 个</span>,
      },
      {
        title: '关联品',
        dataIndex: 'relation_count',
        key: 'relation_count',
        width: 78,
        responsive: ['lg'],
        render: (value) => <span className="muted-text">{value} 个</span>,
      },
      {
        title: '更新',
        dataIndex: 'updated_at',
        key: 'updated_at',
        width: 116,
        responsive: ['lg'],
        render: (value) => (
          <span className="muted-text">{formatShortDate(value)}</span>
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 112,
        render: (_, record) => (
          <Space size={2}>
            <Tooltip title="查看">
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => setDetailId(record.id)}
              />
            </Tooltip>
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setEditingTool(record)
                  setFormOpen(true)
                }}
              />
            </Tooltip>
            <Popconfirm
              title="删除这个工具？"
              description="资源地址、平台、标签和关联关系会一起删除。"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => removeTool(record)}
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [platforms, tags],
  )

  return (
    <div className="page catalog-page">
      <PageHeader
        eyebrow="TOOLS"
        title="工具管理"
        description="维护开发工具、效率软件与在线服务；支持平台、标签、资源地址和关联品集中管理。"
        extra={
          <Space wrap>
            <Button
              icon={<SettingOutlined />}
              onClick={() => navigate('/tools/platforms')}
            >
              平台管理
            </Button>
            <Button
              icon={<TagsOutlined />}
              onClick={() => navigate('/tools/tags')}
            >
              标签管理
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingTool(null)
                setFormOpen(true)
              }}
            >
              新建工具
            </Button>
          </Space>
        }
      />

      <Card className="toolbar-card catalog-filter-card" styles={{ body: { padding: 16 } }}>
        <div className="catalog-filter-grid">
          <Input
            allowClear
            value={q}
            onChange={(event) => setQ(event.target.value)}
            prefix={<SearchOutlined className="input-prefix" />}
            placeholder="搜索工具名称、描述或评价"
          />
          <Select
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            value={tags}
            onChange={setTags}
            showSearch
            filterOption={(input, option) =>
              String(option?.label ?? '')
                .toLocaleLowerCase()
                .includes(input.trim().toLocaleLowerCase())
            }
            options={tagOptions.map((tag) => ({
              value: tag.name,
              label: `#${tag.name} (${tag.count})`,
            }))}
            placeholder="工具标签（AND）"
            suffixIcon={<FilterOutlined />}
          />
          <Select
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            value={platforms}
            onChange={setPlatforms}
            showSearch
            filterOption={(input, option) =>
              String(option?.label ?? '')
                .toLocaleLowerCase()
                .includes(input.trim().toLocaleLowerCase())
            }
            options={platformOptions.map((item) => ({
              value: item.name,
              label: `${item.name} (${item.count})`,
            }))}
            placeholder="支持平台（AND）"
          />
          <Select
            value={sort}
            onChange={setSort}
            options={SORT_OPTIONS}
            className="catalog-filter-sort"
          />
          <Tooltip title="刷新">
            <Button
              icon={<ReloadOutlined spin={loading} />}
              onClick={() => setReloadToken((token) => token + 1)}
            />
          </Tooltip>
        </div>
      </Card>

      <div className="catalog-list-summary">
        <span>
          共 <strong>{tools.length}</strong> 个工具
        </span>
        <span className="muted-text">
          名称下方展示支持平台与工具标签；点击标签可以继续筛选。
        </span>
      </div>

      {!loading && !tools.length ? (
        <EmptyState
          icon={<TagsOutlined />}
          title={filterCount ? '没有匹配的工具' : '还没有工具'}
          description={
            filterCount
              ? '试试减少筛选条件，或者清空搜索。'
              : '记录第一个工具，后续补充资源地址、支持平台和关联品。'
          }
          action={
            <Space>
              {filterCount ? <Button onClick={resetFilters}>清空筛选</Button> : null}
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingTool(null)
                  setFormOpen(true)
                }}
              >
                新建工具
              </Button>
            </Space>
          }
        />
      ) : (
        <Table
          className="catalog-table"
          rowKey="id"
          loading={loading}
          dataSource={tools}
          columns={columns}
          scroll={{ x: 900 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (total) => `共 ${total} 个工具`,
          }}
        />
      )}

      <ToolDetailDrawer
        open={Boolean(detailId)}
        toolId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={() => setReloadToken((token) => token + 1)}
        onEdit={(detail) => {
          setDetailId(null)
          setEditingTool(detail)
          setFormOpen(true)
        }}
      />

      <ToolFormDrawer
        open={formOpen}
        tool={editingTool}
        onClose={() => {
          setFormOpen(false)
          setEditingTool(null)
        }}
        onSaved={() => setReloadToken((token) => token + 1)}
      />
    </div>
  )
}
