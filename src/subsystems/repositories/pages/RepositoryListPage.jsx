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
import { repositoryApi } from '../api'
import { navigate } from '../../../router'
import { formatShortDate } from '../../../utils'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'
import TagPill from '../../../components/TagPill'
import TitleText from '../../../components/TitleText'
import RepositoryFormDrawer from '../components/RepositoryFormDrawer'
import RepositoryDetailDrawer from '../components/RepositoryDetailDrawer'

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

export default function RepositoryListPage({
  initialTags = [],
  initialLanguages = [],
}) {
  const { message } = AntApp.useApp()
  const initialKey = `${initialTags.join('\u0000')}::${initialLanguages.join('\u0000')}`
  const [repositories, setRepositories] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [tags, setTags] = useState(initialTags)
  const [languages, setLanguages] = useState(initialLanguages)
  const [tagOptions, setTagOptions] = useState([])
  const [languageOptions, setLanguageOptions] = useState([])
  const [sort, setSort] = useState('updated_desc')
  const [reloadToken, setReloadToken] = useState(0)
  const [detailId, setDetailId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRepository, setEditingRepository] = useState(null)

  useEffect(() => {
    setTags(initialTags)
    setLanguages(initialLanguages)
    setQ('')
    setSort('updated_desc')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey])

  useEffect(() => {
    Promise.all([
      repositoryApi.listTags({ sort: 'count' }),
      repositoryApi.listLanguages({ sort: 'count' }),
    ])
      .then(([tagsData, languagesData]) => {
        setTagOptions(tagsData.tags)
        setLanguageOptions(languagesData.languages)
      })
      .catch((error) => message.error(error.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken])

  useEffect(() => {
    let alive = true
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await repositoryApi.list({
          q,
          tags: tags.join(','),
          languages: languages.join(','),
          sort,
          limit: 500,
        })
        if (alive) setRepositories(data.repositories)
      } catch (error) {
        if (alive) {
          message.error(error.message)
          setRepositories([])
        }
      } finally {
        if (alive) setLoading(false)
      }
    }, 200)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [q, tags, languages, sort, reloadToken, message])

  const filterCount =
    (q ? 1 : 0) + tags.length + languages.length + (sort !== 'updated_desc' ? 1 : 0)

  const resetFilters = () => {
    setQ('')
    setTags([])
    setLanguages([])
    setSort('updated_desc')
  }

  const removeRepository = async (repository) => {
    try {
      await repositoryApi.remove(repository.id)
      message.success('仓库已删除')
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
        width: 360,
        render: (_, record) => (
          <div className="catalog-name-cell">
            <button
              type="button"
              className="table-title-button"
              onClick={() => setDetailId(record.id)}
            >
              <TitleText text={record.name} maxChars={46} />
            </button>
            <div className="catalog-name-tag-row">
              {record.languages.length ? (
                record.languages.map((item) => (
                  <TagPill
                    key={`language-${item}`}
                    name={item}
                    size="sm"
                    active={languages.includes(item)}
                    onClick={(name) =>
                      setLanguages((current) => toggleValue(current, name))
                    }
                  />
                ))
              ) : (
                <span className="muted-text">未添加编程语言</span>
              )}
            </div>
            <div className="catalog-name-tag-row">
              {record.tags.length ? (
                record.tags.map((item) => (
                  <TagPill
                    key={`tag-${item}`}
                    name={item}
                    size="sm"
                    active={tags.includes(item)}
                    onClick={(name) =>
                      setTags((current) => toggleValue(current, name))
                    }
                  />
                ))
              ) : (
                <span className="muted-text">未添加标签</span>
              )}
            </div>
          </div>
        ),
      },
      {
        title: '资源',
        dataIndex: 'resource_count',
        key: 'resource_count',
        width: 82,
        responsive: ['md'],
        render: (value) => <span className="muted-text">{value} 个</span>,
      },
      {
        title: '关联品',
        dataIndex: 'relation_count',
        key: 'relation_count',
        width: 82,
        responsive: ['md'],
        render: (value) => <span className="muted-text">{value} 个</span>,
      },
      {
        title: '更新',
        dataIndex: 'updated_at',
        key: 'updated_at',
        width: 120,
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
                  setEditingRepository(record)
                  setFormOpen(true)
                }}
              />
            </Tooltip>
            <Popconfirm
              title="删除这个仓库？"
              description="资源地址、标签和关联关系会一起删除。"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => removeRepository(record)}
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [languages, tags],
  )

  return (
    <div className="page catalog-page">
      <PageHeader
        eyebrow="REPOSITORIES"
        title="仓库管理"
        description="维护代码仓库、开源项目与技术资源；语言、标签、资源地址和关联品集中管理。"
        extra={
          <Space wrap>
            <Button
              icon={<SettingOutlined />}
              onClick={() => navigate('/repositories/languages')}
            >
              语言管理
            </Button>
            <Button
              icon={<TagsOutlined />}
              onClick={() => navigate('/repositories/tags')}
            >
              标签管理
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingRepository(null)
                setFormOpen(true)
              }}
            >
              新建仓库
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
            placeholder="搜索仓库名称、描述或评价"
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
            placeholder="仓库标签（AND）"
            suffixIcon={<FilterOutlined />}
          />
          <Select
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            value={languages}
            onChange={setLanguages}
            showSearch
            filterOption={(input, option) =>
              String(option?.label ?? '')
                .toLocaleLowerCase()
                .includes(input.trim().toLocaleLowerCase())
            }
            options={languageOptions.map((item) => ({
              value: item.name,
              label: `${item.name} (${item.count})`,
            }))}
            placeholder="编程语言（AND）"
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
          共 <strong>{repositories.length}</strong> 个仓库
        </span>
        <span className="muted-text">
          名称下方依次展示编程语言与仓库标签；点击标签可以继续筛选。
        </span>
      </div>

      {!loading && !repositories.length ? (
        <EmptyState
          icon={<TagsOutlined />}
          title={filterCount ? '没有匹配的仓库' : '还没有仓库'}
          description={
            filterCount
              ? '试试减少筛选条件，或者清空搜索。'
              : '记录第一个代码仓库或开源项目，后续补充资源地址和关联品。'
          }
          action={
            <Space>
              {filterCount ? <Button onClick={resetFilters}>清空筛选</Button> : null}
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingRepository(null)
                  setFormOpen(true)
                }}
              >
                新建仓库
              </Button>
            </Space>
          }
        />
      ) : (
        <Table
          className="catalog-table"
          rowKey="id"
          loading={loading}
          dataSource={repositories}
          columns={columns}
          scroll={{ x: 860 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (total) => `共 ${total} 个仓库`,
          }}
        />
      )}

      <RepositoryDetailDrawer
        open={Boolean(detailId)}
        repositoryId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={() => setReloadToken((token) => token + 1)}
        onEdit={(detail) => {
          setDetailId(null)
          setEditingRepository(detail)
          setFormOpen(true)
        }}
      />

      <RepositoryFormDrawer
        open={formOpen}
        repository={editingRepository}
        onClose={() => {
          setFormOpen(false)
          setEditingRepository(null)
        }}
        onSaved={() => setReloadToken((token) => token + 1)}
      />
    </div>
  )
}
