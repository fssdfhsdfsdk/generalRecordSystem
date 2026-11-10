import React, { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  Input,
  Popconfirm,
  Progress,
  Result,
  Select,
  Slider,
  Space,
  Table,
  Tooltip,
} from 'antd'
import {
  BookOutlined,
  ClearOutlined,
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
import { docApi } from '../api'
import { navigate } from '../../../router'
import { formatShortDate } from '../../../utils'
import { useAppData } from '../../../shell/AppDataContext'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'
import TitleText from '../../../components/TitleText'
import DocTypeIcon from '../components/DocTypeIcon'
import DocStatusTag from '../components/DocStatusTag'
import DocPriorityTag from '../components/DocPriorityTag'
import DocInfoCell from '../components/DocInfoCell'
import DocViewDrawer from '../components/DocViewDrawer'
import {
  DOC_PRIORITY_OPTIONS,
  DOC_STATUS_OPTIONS,
  docTypeMeta,
} from '../docsMeta'

const SORT_OPTIONS = [
  { value: 'updated_desc', label: '最近更新' },
  { value: 'created_desc', label: '最近创建' },
  { value: 'priority_desc', label: '优先级（高→低）' },
  { value: 'progress_desc', label: '阅读进度（高→低）' },
  { value: 'title_asc', label: '名称 A-Z' },
]

export default function DocListPage({
  typeId,
  initialTags = [],
  tagMode = false,
  fuzzyTagMode = false,
  initialTagQ = '',
}) {
  const { message } = AntApp.useApp()
  const { docTypes, docTypesLoading } = useAppData()
  const initialTagKey = initialTags.join('\u0000')
  const type = useMemo(
    () => docTypes.find((item) => String(item.id) === String(typeId)),
    [docTypes, typeId],
  )
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [pageSize, setPageSize] = useState(10)
  const [q, setQ] = useState('')
  const [contentQ, setContentQ] = useState('')
  const [tagQ, setTagQ] = useState(initialTagQ)
  const [statuses, setStatuses] = useState([])
  const [priorities, setPriorities] = useState([])
  const [progressRange, setProgressRange] = useState([0, 100])
  const [infoAuthor, setInfoAuthor] = useState('')
  const [infoTime, setInfoTime] = useState('')
  const [infoVersion, setInfoVersion] = useState('')
  const [infoResource, setInfoResource] = useState('')
  const [infoExtra, setInfoExtra] = useState('')
  const [tags, setTags] = useState(() => initialTags)
  const [tagOptions, setTagOptions] = useState([])
  const [sort, setSort] = useState('updated_desc')
  const [reloadToken, setReloadToken] = useState(0)
  const [detailId, setDetailId] = useState(null)
  const activeTagsText = tags.map((tag) => `#${tag}`).join(' ')

  useEffect(() => {
    setQ('')
    setContentQ('')
    setTagQ(initialTagQ)
    setStatuses([])
    setPriorities([])
    setProgressRange([0, 100])
    setInfoAuthor('')
    setInfoTime('')
    setInfoVersion('')
    setInfoResource('')
    setInfoExtra('')
    setTags(initialTags)
    setSort('updated_desc')
    // The key tracks the route-provided tag filter without re-running on
    // every local tag selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId, initialTagKey, initialTagQ])

  useEffect(() => {
    docApi
      .listTags({ sort: 'count', type_id: tagMode ? undefined : typeId })
      .then((data) => setTagOptions(data.tags))
      .catch(() => setTagOptions([]))
  }, [reloadToken, tagMode, typeId])

  useEffect(() => {
    let alive = true
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await docApi.list({
          type_id: tagMode ? undefined : typeId,
          q,
          content_q: contentQ,
          tag_q: tagQ,
          status: statuses.join(','),
          priority: priorities.join(','),
          tags: tags.join(','),
          progress_min: progressRange[0] > 0 ? progressRange[0] : undefined,
          progress_max: progressRange[1] < 100 ? progressRange[1] : undefined,
          author: infoAuthor,
          doc_time: infoTime,
          version: infoVersion,
          resource_url: infoResource,
          info_extra: infoExtra,
          sort,
          limit: 500,
        })
        if (alive) setDocuments(data.documents)
      } catch (error) {
        if (alive) {
          message.error(error.message)
          setDocuments([])
        }
      } finally {
        if (alive) setLoading(false)
      }
    }, 220)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [
    typeId,
    tagMode,
    q,
    contentQ,
    tagQ,
    statuses,
    priorities,
    progressRange,
    infoAuthor,
    infoTime,
    infoVersion,
    infoResource,
    infoExtra,
    tags,
    sort,
    reloadToken,
    message,
  ])

  const resetFilters = () => {
    setQ('')
    setContentQ('')
    setTagQ('')
    setStatuses([])
    setPriorities([])
    setProgressRange([0, 100])
    setInfoAuthor('')
    setInfoTime('')
    setInfoVersion('')
    setInfoResource('')
    setInfoExtra('')
    setTags([])
    setSort('updated_desc')
  }

  const filterCount =
    (q ? 1 : 0) +
    (contentQ ? 1 : 0) +
    (tagQ ? 1 : 0) +
    (statuses.length ? 1 : 0) +
    (priorities.length ? 1 : 0) +
    (progressRange[0] > 0 || progressRange[1] < 100 ? 1 : 0) +
    (infoAuthor ? 1 : 0) +
    (infoTime ? 1 : 0) +
    (infoVersion ? 1 : 0) +
    (infoResource ? 1 : 0) +
    (infoExtra ? 1 : 0) +
    (tags.length ? 1 : 0) +
    (sort !== 'updated_desc' ? 1 : 0)

  const removeDocument = async (document) => {
    try {
      await docApi.remove(document.id)
      message.success('文档已删除')
      setReloadToken((token) => token + 1)
    } catch (error) {
      message.error(error.message)
    }
  }

  const columns = [
    {
      title: '文档',
      dataIndex: 'title',
      key: 'title',
      width: 270,
      render: (_, record) => (
        <button
          type="button"
          className="doc-title-cell"
          onClick={() => setDetailId(record.id)}
        >
          <span className="doc-title-line">
            <TitleText text={record.title} maxChars={48} />
          </span>
          {record.tags?.length ? (
            <Tooltip
              title={record.tags.map((tag) => `#${tag}`).join('  ')}
              placement="topLeft"
            >
              <span className="doc-title-tags">
                {record.tags.map((tag) => (
                  <span className="doc-title-tag" key={tag}>
                    #{tag}
                  </span>
                ))}
              </span>
            </Tooltip>
          ) : null}
          <span className="doc-title-meta">
            {formatShortDate(record.updated_at)}
            {record.history_count ? ` · ${record.history_count} 次阅读` : ''}
          </span>
          <span className="doc-title-mobile-meta">
            <DocStatusTag status={record.reading_status} size="small" />
            <DocPriorityTag priority={record.priority} />
            <span>{record.reading_progress}%</span>
          </span>
        </button>
      ),
    },
    ...(tagMode
      ? [
          {
            title: '类型',
            dataIndex: 'type_name',
            key: 'type_name',
            width: 130,
            render: (name, record) => (
              <button
                type="button"
                className="type-text-link"
                onClick={() => navigate(`/docs/type/${record.type_id}`)}
              >
                {name}
              </button>
            ),
          },
        ]
      : []),
    {
      title: '文档信息',
      dataIndex: 'document_info',
      key: 'document_info',
      width: 240,
      responsive: ['lg'],
      render: (_, record) => <DocInfoCell doc={record} />,
    },
    {
      title: '状态',
      dataIndex: 'reading_status',
      key: 'reading_status',
      width: 92,
      render: (value) => <DocStatusTag status={value} size="small" />,
    },
    {
      title: '阅读进度',
      dataIndex: 'reading_progress',
      key: 'reading_progress',
      width: 118,
      render: (value) => (
        <div className="doc-progress-cell">
          <Progress
            percent={value}
            size="small"
            showInfo={false}
            strokeColor="#f59e0b"
          />
          <span>{value}%</span>
        </div>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 76,
      responsive: ['md'],
      render: (value) => <DocPriorityTag priority={value} />,
    },
    {
      title: '',
      key: 'actions',
      width: 88,
      render: (_, record) => (
        <Space size={2}>
          <Tooltip title="浏览内容">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              aria-label={`浏览文档 ${record.title}`}
              onClick={() => setDetailId(record.id)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              aria-label={`编辑文档 ${record.title}`}
              onClick={() => navigate(`/docs/${record.id}/edit`)}
            />
          </Tooltip>
          <Popconfirm
            title="删除这篇文档？"
            description="阅读笔记、感想与历史会一起删除，且不可恢复。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => removeDocument(record)}
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              aria-label={`删除文档 ${record.title}`}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  if (!tagMode && !docTypesLoading && !type) {
    return (
      <div className="page">
        <Result
          status="404"
          title="文档类型不存在"
          subTitle="它可能已经被删除，或者地址有误。"
          extra={
            <Space>
              <Button onClick={() => navigate('/docs')}>回到文档总览</Button>
              <Button type="primary" onClick={() => navigate('/docs/types')}>
                前往类型管理
              </Button>
            </Space>
          }
        />
      </div>
    )
  }

  if (!tagMode && !type) {
    return (
      <div className="page">
        <div className="page-loading">
          <span className="loading-bar" />
        </div>
      </div>
    )
  }

  const typeMeta = type ? docTypeMeta(type) : null

  return (
    <div className="page doc-list-page">
      <PageHeader
        eyebrow={
          fuzzyTagMode
            ? 'FUZZY TAG SEARCH'
            : tagMode
              ? 'DOCUMENT TAGS'
              : 'DOCUMENT TYPE'
        }
        title={
          fuzzyTagMode ? (
            <span className="title-with-mode">
              文档标签模糊搜索
              <span className="mode-badge">包含</span>
            </span>
          ) : tagMode ? (
            <span className="title-with-mode">
              文档标签筛选
              <span className="mode-badge">AND</span>
            </span>
          ) : (
            <span className="title-with-icon">
              <DocTypeIcon type={type} size="lg" />
              {type.name}
            </span>
          )
        }
        description={
          fuzzyTagMode
            ? tagQ.trim()
              ? `在所有文档类型中搜索标签名同时包含“${tagQ.trim()}”的文档（多个关键词 AND）。`
              : '在所有文档类型中按标签模糊搜索；输入多个关键词时用空格分隔，结果需要同时命中全部关键词。'
            : tagMode
              ? tags.length
                ? `默认在所有文档类型中筛选同时包含 ${activeTagsText} 的文档（AND）。`
                : '默认筛选所有文档类型；选择标签后，只显示同时包含所选标签的文档。'
              : `${type.count || type.document_count || 0} 篇文档。${type.description || '这一类文档会独立归档。'}`
        }
        extra={
          tagMode ? (
            <Space wrap>
              <Button
                icon={<TagsOutlined />}
                onClick={() => navigate('/docs/tags')}
              >
                返回文档标签
              </Button>
              <Button icon={<BookOutlined />} onClick={() => navigate('/docs')}>
                文档总览
              </Button>
            </Space>
          ) : (
            <Space wrap>
              <Button
                icon={<SettingOutlined />}
                onClick={() => navigate('/docs/types')}
              >
                类型管理
              </Button>
              <Button
                icon={<TagsOutlined />}
                onClick={() => navigate('/docs/tags')}
              >
                标签管理
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate(`/docs/new?type=${type.id}`)}
              >
                新建文档
              </Button>
            </Space>
          )
        }
      >
        {tagMode ? (
          <div className="doc-type-crumb-line">
            <span className="doc-type-kicker doc-text-violet">
              {fuzzyTagMode ? 'FUZZY TAG FILTER' : 'TAG FILTER'}
            </span>
            <span className="muted-text">默认对所有文档类型生效</span>
          </div>
        ) : (
          <div className="doc-type-crumb-line">
            <span className={`doc-type-kicker doc-text-${typeMeta.tone}`}>
              {typeMeta.kicker}
            </span>
            <span className="muted-text">
              {type.slug ? '默认类型' : '自定义类型'}
            </span>
          </div>
        )}
      </PageHeader>

      <div className="doc-filter-card">
        <div className="doc-filter-head">
          <div className="doc-filter-title">
            <FilterOutlined />
            <span>筛选</span>
            {filterCount ? <span className="filter-count">{filterCount} 项</span> : null}
          </div>
          <Button
            type="text"
            size="small"
            icon={<ClearOutlined />}
            onClick={resetFilters}
            disabled={!filterCount}
          >
            重置
          </Button>
        </div>
        <div className="doc-filter-grid">
          <Input
            allowClear
            value={q}
            onChange={(event) => setQ(event.target.value)}
            prefix={<SearchOutlined className="input-prefix" />}
            placeholder="搜索标题"
            className="doc-filter-search"
          />
          <Input
            allowClear
            value={contentQ}
            onChange={(event) => setContentQ(event.target.value)}
            prefix={<SearchOutlined className="input-prefix" />}
            placeholder="搜索信息、笔记或感想"
            className="doc-filter-search"
          />
          <Input
            allowClear
            value={tagQ}
            onChange={(event) => setTagQ(event.target.value)}
            prefix={<SearchOutlined className="input-prefix" />}
            placeholder="标签模糊搜索（空格 AND）"
            className="doc-filter-search"
          />
          <Select
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            value={statuses}
            onChange={setStatuses}
            options={DOC_STATUS_OPTIONS}
            placeholder="阅读状态"
            className="doc-filter-status"
          />
          <Select
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            value={priorities}
            onChange={setPriorities}
            options={DOC_PRIORITY_OPTIONS}
            placeholder="优先级"
            className="doc-filter-priority"
          />
          <div className="doc-filter-progress">
            <div className="doc-filter-progress-head">
              <span>阅读进度</span>
              <strong>
                {progressRange[0]}–{progressRange[1]}%
              </strong>
            </div>
            <Slider
              range
              min={0}
              max={100}
              value={progressRange}
              onChange={setProgressRange}
              tooltip={{ formatter: (value) => `${value}%` }}
            />
          </div>
          <Select
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            value={tags}
            onChange={setTags}
            options={tagOptions.map((tag) => ({
              value: tag.name,
              label: `${tag.name} (${tag.count})`,
            }))}
            placeholder="标签（AND）"
            className="doc-filter-tags"
          />
          <Select
            value={sort}
            onChange={setSort}
            options={SORT_OPTIONS}
            className="doc-filter-sort"
          />
          <Tooltip title="刷新">
            <Button
              icon={<ReloadOutlined spin={loading} />}
              onClick={() => setReloadToken((token) => token + 1)}
            />
          </Tooltip>
        </div>
        <div className="doc-info-filter-row">
          <div className="doc-info-filter-heading">
            <span>文档信息筛选</span>
            <span>作者、时间、版本、资源地址分别筛选；列表仍合并为「文档信息」一列</span>
          </div>
          <div className="doc-info-filter-grid">
            <Input
              allowClear
              value={infoAuthor}
              onChange={(event) => setInfoAuthor(event.target.value)}
              placeholder="作者"
              aria-label="按作者筛选"
            />
            <Input
              allowClear
              value={infoTime}
              onChange={(event) => setInfoTime(event.target.value)}
              placeholder="时间"
              aria-label="按时间筛选"
            />
            <Input
              allowClear
              value={infoVersion}
              onChange={(event) => setInfoVersion(event.target.value)}
              placeholder="版本"
              aria-label="按版本筛选"
            />
            <Input
              allowClear
              value={infoResource}
              onChange={(event) => setInfoResource(event.target.value)}
              placeholder="资源地址"
              aria-label="按资源地址筛选"
            />
            <Input
              allowClear
              value={infoExtra}
              onChange={(event) => setInfoExtra(event.target.value)}
              placeholder="其它信息"
              aria-label="按其它信息筛选"
            />
          </div>
        </div>
      </div>

      <div className="doc-list-summary">
        <span>
          共 <strong>{documents.length}</strong> 篇文档
        </span>
        <span className="muted-text">
          文档信息按字段分行展示，空字段省略；每行超长省略，悬浮查看完整内容。
        </span>
      </div>

      {!loading && !documents.length ? (
        <EmptyState
          icon={<BookOutlined />}
          title={
            filterCount
              ? fuzzyTagMode
                ? '没有文档的标签同时包含这些关键词'
                : '没有匹配的文档'
              : tagMode
                ? '还没有文档'
                : `「${type.name}」还没有文档`
          }
          description={
            filterCount
              ? fuzzyTagMode
                ? '试试减少关键词，或换一组更短的片段再搜索。'
                : '试试减少筛选条件，或者清空搜索。'
              : tagMode
                ? '先在其他页面添加文档和标签，再回来查看关联结果。'
                : '从一篇具体的书、论文或材料开始，后续可以慢慢补充笔记与感想。'
          }
          action={
            <Space>
              {filterCount ? <Button onClick={resetFilters}>清空筛选</Button> : null}
              {tagMode ? (
                <Button
                  icon={<TagsOutlined />}
                  onClick={() => navigate('/docs/tags')}
                >
                  返回文档标签
                </Button>
              ) : (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => navigate(`/docs/new?type=${type.id}`)}
                >
                  新建文档
                </Button>
              )}
            </Space>
          }
        />
      ) : (
        <Table
          className="doc-table"
          rowKey="id"
          loading={loading}
          dataSource={documents}
          columns={columns}
          scroll={{ x: tagMode ? 1020 : 890 }}
          pagination={{
            pageSize,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (total) => `共 ${total} 篇文档`,
            onChange: (_, size) => setPageSize(size),
          }}
        />
      )}

      <DocViewDrawer
        open={Boolean(detailId)}
        documentId={detailId}
        onClose={() => setDetailId(null)}
        onDeleted={() => setReloadToken((token) => token + 1)}
      />
    </div>
  )
}
