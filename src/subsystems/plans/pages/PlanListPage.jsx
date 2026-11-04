import React, { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  DatePicker,
  Input,
  Progress,
  Select,
  Slider,
  Space,
  Table,
  Tooltip,
} from 'antd'
import {
  ClearOutlined,
  EditOutlined,
  EyeOutlined,
  FilterOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { planApi } from '../api'
import { navigate } from '../../../router'
import { formatShortDate } from '../../../utils'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'
import TagPill from '../../../components/TagPill'
import TitleText from '../../../components/TitleText'
import PlanStatusTag from '../components/PlanStatusTag'
import PlanFormDrawer from '../components/PlanFormDrawer'
import PlanDetailDrawer from '../components/PlanDetailDrawer'
import {
  PLAN_STATUS_OPTIONS,
  formatHours,
  formatRangeCompact,
  planTypeMeta,
} from '../planMeta'

const SORT_OPTIONS = [
  { value: 'updated_desc', label: '最近更新' },
  { value: 'created_desc', label: '最近创建' },
  { value: 'planned_start_asc', label: '计划开始（早→晚）' },
  { value: 'planned_end_asc', label: '计划结束（早→晚）' },
  { value: 'progress_desc', label: '进度（高→低）' },
  { value: 'estimated_desc', label: '预估耗时（高→低）' },
  { value: 'actual_desc', label: '实际耗时（高→低）' },
]

export default function PlanListPage({
  type,
  fixedTags = [],
  headerTitle,
  headerDescription,
}) {
  const { message } = AntApp.useApp()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [statuses, setStatuses] = useState([])
  const [tags, setTags] = useState([])
  const [tagOptions, setTagOptions] = useState([])
  const [progressRange, setProgressRange] = useState([0, 100])
  const [plannedRange, setPlannedRange] = useState(null)
  const [sort, setSort] = useState('updated_desc')
  const [reloadToken, setReloadToken] = useState(0)
  const [detailId, setDetailId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState(null)

  const typeMeta = type ? planTypeMeta(type) : null
  const tagFilter = fixedTags.join(',')
  const effectiveTags = fixedTags.length ? fixedTags : tags
  const tagKey = effectiveTags.join(',')

  useEffect(() => {
    planApi
      .listTags({ sort: 'count', type })
      .then((data) => setTagOptions(data.tags))
      .catch(() => setTagOptions([]))
  }, [type])

  useEffect(() => {
    let alive = true
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const params = {
          type,
          q,
          status: statuses.join(','),
          tags: tagKey,
          sort,
          limit: 500,
        }
        if (progressRange[0] > 0) params.progress_min = progressRange[0]
        if (progressRange[1] < 100) params.progress_max = progressRange[1]
        if (plannedRange?.[0]) {
          params.planned_from = plannedRange[0].format('YYYY-MM-DD HH:mm:ss')
        }
        if (plannedRange?.[1]) {
          params.planned_to = plannedRange[1].format('YYYY-MM-DD HH:mm:ss')
        }
        const data = await planApi.list(params)
        if (alive) setPlans(data.plans)
      } catch (error) {
        if (alive) message.error(error.message)
      } finally {
        if (alive) setLoading(false)
      }
    }, 220)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [
    type,
    q,
    statuses,
    tagKey,
    progressRange,
    plannedRange,
    sort,
    reloadToken,
    message,
  ])

  const resetFilters = () => {
    setQ('')
    setStatuses([])
    setTags([])
    setProgressRange([0, 100])
    setPlannedRange(null)
    setSort('updated_desc')
  }

  const openCreate = () => {
    setEditingPlan(null)
    setFormOpen(true)
  }

  const openEdit = async (plan) => {
    try {
      const detail = await planApi.get(plan.id)
      setEditingPlan(detail)
      setFormOpen(true)
    } catch (error) {
      message.error(error.message)
    }
  }

  const filterCount =
    (q ? 1 : 0) +
    (statuses.length ? 1 : 0) +
    (tags.length ? 1 : 0) +
    (fixedTags.length ? 1 : 0) +
    (progressRange[0] > 0 || progressRange[1] < 100 ? 1 : 0) +
    (plannedRange?.length ? 1 : 0)

  const columns = [
    {
      title: '计划',
      dataIndex: 'title',
      key: 'title',
      width: 300,
      render: (_, record) => (
        <button
          type="button"
          className="plan-title-cell"
          onClick={() => setDetailId(record.id)}
        >
          <span className="plan-title-line">
            <TitleText text={record.title} maxChars={48} />
          </span>
          <span className="plan-title-meta">
            {record.plan_type_label}
            {record.parent_title ? ` · 父：${record.parent_title}` : ''}
            {record.node_count
              ? ` · ${record.completed_node_count}/${record.active_node_count} 节点`
              : ''}
          </span>
          <span className="plan-title-mobile-meta">
            <PlanStatusTag status={record.status} size="small" />
            <span>{record.progress}%</span>
            {record.estimated_hours ? (
              <span className="muted-text">{record.estimated_hours} h</span>
            ) : null}
          </span>
        </button>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => <PlanStatusTag status={status} size="small" />,
    },
    {
      title: '进度 / 完成度',
      dataIndex: 'progress',
      key: 'progress',
      width: 160,
      render: (_, record) => (
        <div className="plan-progress-cell">
          <div className="plan-progress-line">
            <Progress
              percent={record.progress}
              size="small"
              showInfo={false}
              strokeColor="#4f46e5"
            />
            <span>{record.progress}%</span>
          </div>
          <div className="plan-completion-line">
            <span>完成度</span>
            <Progress
              percent={record.completion}
              size="small"
              showInfo={false}
              strokeColor="#0f9f6e"
            />
            <span>{record.completion}%</span>
          </div>
        </div>
      ),
    },
    {
      title: '计划时间线',
      dataIndex: 'planned_start',
      key: 'timeline',
      width: 210,
      responsive: ['md'],
      render: (_, record) => (
        <span className="plan-timeline-cell">
          {formatRangeCompact(record.planned_start, record.planned_end)}
        </span>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'estimated_hours',
      key: 'hours',
      width: 130,
      responsive: ['lg'],
      render: (_, record) => (
        <span className="plan-hours-cell">
          <span>{formatHours(record.estimated_hours)}</span>
          <small>实际 {formatHours(record.actual_hours)}</small>
        </span>
      ),
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 160,
      responsive: ['lg'],
      render: (_, record) =>
        record.tags.length ? (
          <span className="plan-tag-cell">
            {record.tags.slice(0, 2).map((tag) => (
              <TagPill key={tag} name={tag} size="sm" />
            ))}
            {record.tags.length > 2 ? (
              <span className="muted-text">+{record.tags.length - 2}</span>
            ) : null}
          </span>
        ) : (
          <span className="muted-text">—</span>
        ),
    },
    {
      title: '更新',
      dataIndex: 'updated_at',
      key: 'updated',
      width: 110,
      responsive: ['xl'],
      render: (value) => (
        <span className="muted-text">{formatShortDate(value)}</span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 96,
      fixed: 'right',
      render: (_, record) => (
        <Space size={2}>
          <Tooltip title="查看详情">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              aria-label={`查看计划 ${record.title}`}
              onClick={() => setDetailId(record.id)}
            />
          </Tooltip>
          <Tooltip
            title={
              ['completed', 'abandoned'].includes(record.status)
                ? '终态计划请在详情中重新打开后编辑'
                : '编辑计划'
            }
          >
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              disabled={['completed', 'abandoned'].includes(record.status)}
              aria-label={`编辑计划 ${record.title}`}
              onClick={() => openEdit(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <div className="page plan-list-page">
      <PageHeader
        eyebrow={typeMeta ? typeMeta.kicker : 'TAG FILTER'}
        title={headerTitle || typeMeta?.label || '计划'}
        description={
          headerDescription ||
          typeMeta?.description ||
          '按计划标签筛选，多个标签按 AND 匹配。'
        }
        extra={
          <Space wrap>
            {fixedTags.length ? (
              <Button
                icon={<TagsOutlined />}
                onClick={() => navigate('/plans/tags')}
              >
                返回计划标签
              </Button>
            ) : null}
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建计划
            </Button>
          </Space>
        }
      >
        {fixedTags.length ? (
          <div className="fixed-tag-row">
            <span className="muted-text">同时包含：</span>
            {fixedTags.map((tag) => (
              <TagPill key={tag} name={tag} active />
            ))}
          </div>
        ) : null}
      </PageHeader>

      <div className="plan-filter-card">
        <div className="plan-filter-head">
          <div className="plan-filter-title">
            <FilterOutlined />
            <span>筛选</span>
            {filterCount ? (
              <span className="filter-count">{filterCount} 项</span>
            ) : null}
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
        <div className="plan-filter-grid">
          <Input
            allowClear
            value={q}
            onChange={(event) => setQ(event.target.value)}
            prefix={<SearchOutlined className="input-prefix" />}
            placeholder="搜索标题或内容"
            className="plan-filter-search"
          />
          <Select
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            value={statuses}
            onChange={setStatuses}
            options={PLAN_STATUS_OPTIONS}
            placeholder="计划状态"
            className="plan-filter-status"
          />
          {!fixedTags.length ? (
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
              placeholder="计划标签（AND）"
              className="plan-filter-tags"
            />
          ) : null}
          <DatePicker.RangePicker
            value={plannedRange}
            onChange={setPlannedRange}
            format="YYYY-MM-DD"
            className="plan-filter-date"
            placeholder={['时间线覆盖起', '时间线覆盖止']}
          />
          <div className="plan-filter-progress">
            <span>进度 {progressRange[0]}–{progressRange[1]}%</span>
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
            value={sort}
            onChange={setSort}
            options={SORT_OPTIONS}
            className="plan-filter-sort"
          />
        </div>
      </div>

      <div className="plan-list-summary">
        <span>
          共 <strong>{plans.length}</strong> 个计划
        </span>
        <span className="muted-text">
          完成度 = 未放弃节点按权重汇总；没有节点时等于进度。
        </span>
      </div>

      {!loading && !plans.length ? (
        <EmptyState
          icon={<TagsOutlined />}
          title="没有匹配的计划"
          description={
            filterCount
              ? '试试减少筛选条件，或者清空搜索。'
              : '从一个具体目标开始，创建第一条计划。'
          }
          action={
            <Space>
              {filterCount ? (
                <Button onClick={resetFilters}>清空筛选</Button>
              ) : null}
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                新建计划
              </Button>
            </Space>
          }
        />
      ) : (
        <Table
          className="plan-table"
          rowKey="id"
          loading={loading}
          dataSource={plans}
          columns={columns}
          scroll={{ x: 980 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (total) => `共 ${total} 个计划`,
          }}
          rowClassName={(record) =>
            record.status === 'overdue' ? 'plan-row-overdue' : ''
          }
        />
      )}

      <PlanDetailDrawer
        open={Boolean(detailId)}
        planId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={() => setReloadToken((token) => token + 1)}
        onDeleted={() => setReloadToken((token) => token + 1)}
      />

      <PlanFormDrawer
        open={formOpen}
        plan={editingPlan}
        defaultType={type || 'short'}
        onClose={() => {
          setFormOpen(false)
          setEditingPlan(null)
        }}
        onSaved={() => setReloadToken((token) => token + 1)}
      />
    </div>
  )
}
