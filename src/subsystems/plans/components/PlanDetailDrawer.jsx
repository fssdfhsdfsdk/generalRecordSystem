import React, { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Popconfirm,
  Progress,
  Skeleton,
  Space,
  Tabs,
  Tag,
  Tooltip,
} from 'antd'
import {
  CalendarOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FlagOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { planApi } from '../api'
import { formatDate } from '../../../utils'
import Markdown from '../../../components/Markdown'
import TagPill from '../../../components/TagPill'
import TitleText from '../../../components/TitleText'
import EmptyState from '../../../components/EmptyState'
import PlanStatusTag from './PlanStatusTag'
import PlanFormDrawer from './PlanFormDrawer'
import PlanStatusModal from './PlanStatusModal'
import PlanProgressModal from './PlanProgressModal'
import PlanNodeModal from './PlanNodeModal'
import PlanActualModal from './PlanActualModal'
import {
  NODE_STATUS_META,
  PROGRESS_TYPE_META,
  formatHours,
  formatRange,
  planTypeMeta,
} from '../planMeta'

function DeltaBadge({ value }) {
  const positive = value > 0
  const negative = value < 0
  return (
    <span
      className={`delta-badge ${
        positive ? 'is-positive' : negative ? 'is-negative' : 'is-zero'
      }`}
    >
      {positive ? '+' : ''}
      {value}%
    </span>
  )
}

export default function PlanDetailDrawer({
  open,
  planId,
  onClose,
  onChanged,
  onDeleted,
}) {
  const { message } = AntApp.useApp()
  const [currentId, setCurrentId] = useState(planId)
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [activeTab, setActiveTab] = useState('overview')
  const [formOpen, setFormOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [nodeModal, setNodeModal] = useState({ open: false, node: null })
  const [actualModal, setActualModal] = useState({ open: false, actual: null })

  useEffect(() => {
    if (open) setCurrentId(planId)
  }, [open, planId])

  useEffect(() => {
    if (open) setActiveTab('overview')
  }, [open, currentId])

  useEffect(() => {
    if (!open || !currentId) return undefined
    let alive = true
    setLoading(true)
    setPlan(null)
    planApi
      .get(currentId)
      .then((data) => {
        if (alive) setPlan(data)
      })
      .catch((error) => {
        if (alive) message.error(error.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open, currentId, reloadToken, message])

  const locked = plan ? ['completed', 'abandoned'].includes(plan.status) : false
  const type = plan ? planTypeMeta(plan.plan_type) : null

  const applyUpdated = (updated) => {
    setPlan(updated)
    onChanged?.(updated)
  }

  const reload = () => setReloadToken((token) => token + 1)

  const handleDelete = async () => {
    if (!plan) return
    try {
      await planApi.remove(plan.id)
      message.success('计划已删除')
      onDeleted?.(plan)
      onChanged?.()
      onClose?.()
    } catch (error) {
      message.error(error.message)
    }
  }

  const deleteNode = async (node) => {
    try {
      const updated = await planApi.removeNode(plan.id, node.id)
      message.success('节点已删除')
      applyUpdated(updated)
    } catch (error) {
      message.error(error.message)
    }
  }

  const deleteActual = async (actual) => {
    try {
      const updated = await planApi.removeActual(plan.id, actual.id)
      message.success('实际时间点已删除')
      applyUpdated(updated)
    } catch (error) {
      message.error(error.message)
    }
  }

  const deleteProgress = async (log) => {
    try {
      const updated = await planApi.removeProgress(plan.id, log.id)
      message.success('进度记录已删除，进度已重新计算')
      applyUpdated(updated)
    } catch (error) {
      message.error(error.message)
    }
  }

  const tabs = useMemo(() => {
    if (!plan) return []
    return [
      {
        key: 'overview',
        label: '概览',
        children: (
          <div className="plan-tab-body">
            {plan.content ? (
              <Markdown value={plan.content} />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="还没有填写计划内容"
              />
            )}

            <div className="plan-subsection">
              <h3>计划信息</h3>
              <Descriptions column={2} size="small" colon={false}>
                <Descriptions.Item label="计划类型">
                  {type?.label}
                </Descriptions.Item>
                <Descriptions.Item label="父计划">
                  {plan.parent ? (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setCurrentId(plan.parent.id)}
                    >
                      {plan.parent.title}
                    </button>
                  ) : (
                    '—'
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">
                  {formatDate(plan.created_at)}
                </Descriptions.Item>
                <Descriptions.Item label="更新时间">
                  {formatDate(plan.updated_at)}
                </Descriptions.Item>
                <Descriptions.Item label="计划开始">
                  {formatDate(plan.planned_start)}
                </Descriptions.Item>
                <Descriptions.Item label="计划结束">
                  {formatDate(plan.planned_end)}
                </Descriptions.Item>
              </Descriptions>
            </div>

            <div className="plan-subsection">
              <div className="plan-subsection-head">
                <h3>子计划</h3>
                <span className="muted-text">{plan.children.length} 个</span>
              </div>
              {plan.children.length ? (
                <div className="child-plan-list">
                  {plan.children.map((child) => (
                    <button
                      type="button"
                      className="child-plan-row"
                      key={child.id}
                      onClick={() => setCurrentId(child.id)}
                    >
                      <span className={`plan-type-dot plan-tone-${planTypeMeta(child.plan_type).tone}`} />
                      <span className="child-plan-main">
                        <span className="child-plan-title">
                          <TitleText text={child.title} maxChars={48} />
                        </span>
                        <span className="child-plan-meta">
                          {child.plan_type_label} · {child.progress}% ·{' '}
                          {child.updated_at}
                        </span>
                      </span>
                      <PlanStatusTag status={child.status} size="small" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted-text">还没有子计划。可在编辑时把其他计划挂到本计划下。</p>
              )}
            </div>
          </div>
        ),
      },
      {
        key: 'nodes',
        label: `节点 ${plan.nodes.length}`,
        children: (
          <div className="plan-tab-body">
            <div className="tab-toolbar">
              <span className="muted-text">
                未放弃节点的权重合计决定完成度。
              </span>
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                disabled={locked}
                onClick={() => setNodeModal({ open: true, node: null })}
              >
                添加节点
              </Button>
            </div>
            {plan.nodes.length ? (
              <div className="node-list">
                {plan.nodes.map((node) => {
                  const meta = NODE_STATUS_META[node.status]
                  return (
                    <div className={`node-row node-${meta.tone}`} key={node.id}>
                      <div className="node-row-main">
                        <div className="node-row-title">
                          <span className={`node-status-dot node-dot-${meta.tone}`} />
                          <strong>{node.name}</strong>
                          <Tag bordered={false} className="soft-tag">
                            {meta.label}
                          </Tag>
                          <span className="node-weight">权重 {node.weight}</span>
                        </div>
                        <div className="node-row-meta">
                          <span>
                            <CalendarOutlined /> {formatRange(node.planned_start, node.planned_end)}
                          </span>
                          {node.depends_on_name ? (
                            <span className="node-dependency">
                              <LinkOutlined /> 依赖：{node.depends_on_name}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {!locked ? (
                        <Space size={2}>
                          <Tooltip title="编辑节点">
                            <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() =>
                                setNodeModal({ open: true, node })
                              }
                            />
                          </Tooltip>
                          <Popconfirm
                            title="删除这个节点？"
                            description="关联的实际时间点与进度记录会保留，但不再关联节点。"
                            okText="删除"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => deleteNode(node)}
                          >
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                            />
                          </Popconfirm>
                        </Space>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                title="还没有时间节点"
                description="把计划拆成里程碑，设置权重后可以自动汇总完成度。"
                action={
                  !locked ? (
                    <Button
                      icon={<PlusOutlined />}
                      onClick={() => setNodeModal({ open: true, node: null })}
                    >
                      添加第一个节点
                    </Button>
                  ) : null
                }
                compact
              />
            )}
          </div>
        ),
      },
      {
        key: 'actuals',
        label: `实际 ${plan.actuals.length}`,
        children: (
          <div className="plan-tab-body">
            <div className="tab-toolbar">
              <span className="muted-text">
                记录实际发生的时间段、描述和证据，不改变进度。
              </span>
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => setActualModal({ open: true, actual: null })}
              >
                添加实际时间点
              </Button>
            </div>
            {plan.actuals.length ? (
              <div className="actual-list">
                {plan.actuals.map((actual) => (
                  <div className="actual-row" key={actual.id}>
                    <div className="actual-time">
                      <span>{actual.actual_start?.slice(0, 16)}</span>
                      <span className="actual-time-sep">→</span>
                      <span>{actual.actual_end?.slice(0, 16) || '进行中'}</span>
                      {actual.duration_hours != null ? (
                        <Tag bordered={false} className="soft-tag">
                          {actual.duration_hours} 小时
                        </Tag>
                      ) : null}
                    </div>
                    <div className="actual-body">
                      {actual.node_name ? (
                        <div className="actual-node">
                          <LinkOutlined /> {actual.node_name}
                        </div>
                      ) : null}
                      <p>{actual.description}</p>
                      {actual.evidence ? (
                        <div className="actual-evidence">
                          <FlagOutlined /> {actual.evidence}
                        </div>
                      ) : null}
                    </div>
                    <Space size={2}>
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() =>
                          setActualModal({ open: true, actual })
                        }
                      />
                      <Popconfirm
                        title="删除这条实际记录？"
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => deleteActual(actual)}
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                        />
                      </Popconfirm>
                    </Space>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="还没有实际时间点"
              />
            )}
          </div>
        ),
      },
      {
        key: 'progress',
        label: `进度 ${plan.progress_logs.length}`,
        children: (
          <div className="plan-tab-body">
            <div className="tab-toolbar">
              <span className="muted-text">
                进度是历史增减的累计；记录阻塞/困难时变化度可以为 0。
              </span>
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                disabled={locked}
                onClick={() => setProgressOpen(true)}
              >
                记录进度
              </Button>
            </div>
            {plan.progress_logs.length ? (
              <div className="progress-log-list">
                {plan.progress_logs.map((log) => {
                  const meta = PROGRESS_TYPE_META[log.log_type]
                  return (
                    <div
                      className={`progress-log-row log-${meta.tone}`}
                      key={log.id}
                    >
                      <div className="progress-log-delta">
                        <DeltaBadge value={log.delta} />
                        <span className="progress-log-after">
                          累计 {log.progress_after}%
                        </span>
                      </div>
                      <div className="progress-log-main">
                        <div className="progress-log-head">
                          <Tag bordered={false} className={`soft-tag tag-${meta.tone}`}>
                            {meta.label}
                          </Tag>
                          <span>{formatDate(log.changed_at)}</span>
                          {log.node_name ? (
                            <span className="muted-text">· {log.node_name}</span>
                          ) : null}
                        </div>
                        <p>{log.description}</p>
                        {log.evidence ? (
                          <div className="actual-evidence">
                            <FlagOutlined /> {log.evidence}
                          </div>
                        ) : null}
                      </div>
                      {!locked ? (
                        <Popconfirm
                          title="删除这条进度记录？"
                          description="删除后会重新计算当前进度。"
                          okText="删除"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                          onConfirm={() => deleteProgress(log)}
                        >
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                          />
                        </Popconfirm>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="还没有进度记录"
              />
            )}
          </div>
        ),
      },
      {
        key: 'status',
        label: `状态 ${plan.status_logs.length}`,
        children: (
          <div className="plan-tab-body">
            <div className="status-log-list">
              {plan.status_logs.map((log) => (
                <div className="status-log-row" key={log.id}>
                  <div className="status-log-line">
                    <span className="status-log-from">
                      {log.from_status_label || '创建'}
                    </span>
                    <SwapOutlined />
                    <strong>{log.to_status_label}</strong>
                    <span className="muted-text">
                      {formatDate(log.changed_at)}
                    </span>
                  </div>
                  {log.reason ? (
                    <p className="status-log-reason">{log.reason}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ),
      },
    ]
  }, [plan, locked, type])

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width={920}
        className="plan-detail-drawer"
        rootClassName="plan-detail-root"
        destroyOnHidden
        title={
          <div className="drawer-heading">
            <span className="drawer-heading-kicker">PLAN DETAIL</span>
            <span className="drawer-heading-title">
              {plan ? type?.label : '计划详情'}
            </span>
          </div>
        }
        extra={
          plan ? (
            <Space size={8} wrap>
              <Button
                icon={<EditOutlined />}
                disabled={locked}
                onClick={() => setFormOpen(true)}
              >
                编辑
              </Button>
              <Button
                type="primary"
                ghost
                icon={<SwapOutlined />}
                onClick={() => setStatusOpen(true)}
              >
                变更状态
              </Button>
              <Popconfirm
                title="删除这个计划？"
                description="会级联删除节点、实际时间点、进度与状态历史；子计划会变成根计划。"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={handleDelete}
              >
                <Button danger type="text" icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          ) : null
        }
      >
        {loading ? (
          <div className="drawer-loading">
            <Skeleton active paragraph={{ rows: 3 }} />
            <Skeleton active paragraph={{ rows: 8 }} />
          </div>
        ) : plan ? (
          <div className="plan-detail">
            <div className="plan-detail-hero">
              <div className="plan-detail-kicker">
                <span className={`plan-type-pill plan-tone-${type.tone}`}>
                  {type.label}
                </span>
                <PlanStatusTag status={plan.status} />
                {locked ? (
                  <span className="locked-hint">终态 · 可重新打开后编辑</span>
                ) : null}
              </div>
              <TitleText
                as="h2"
                className="plan-detail-title"
                text={plan.title}
                maxChars={100}
              />
              <div className="plan-detail-tags">
                {plan.tags.length ? (
                  plan.tags.map((tag) => <TagPill key={tag} name={tag} />)
                ) : (
                  <span className="muted-text">未添加标签</span>
                )}
              </div>
            </div>

            <div className="plan-kpi-grid">
              <div className="plan-kpi">
                <span>进度</span>
                <strong>{plan.progress}%</strong>
                <Progress
                  percent={plan.progress}
                  size="small"
                  showInfo={false}
                  strokeColor="#4f46e5"
                />
              </div>
              <div className="plan-kpi">
                <span>完成度</span>
                <strong>{plan.completion}%</strong>
                <Progress
                  percent={plan.completion}
                  size="small"
                  showInfo={false}
                  strokeColor="#0f9f6e"
                />
              </div>
              <div className="plan-kpi">
                <span>预估 / 实际</span>
                <strong className="plan-kpi-hours">
                  {formatHours(plan.estimated_hours)}
                  <span> / </span>
                  {formatHours(plan.actual_hours)}
                </strong>
                <small>
                  {plan.active_node_count
                    ? `${plan.completed_node_count}/${plan.active_node_count} 个节点完成`
                    : '没有节点'}
                </small>
              </div>
              <div className="plan-kpi">
                <span>计划时间线</span>
                <strong className="plan-kpi-timeline">
                  {formatRange(plan.planned_start, plan.planned_end)}
                </strong>
                <small>创建于 {formatDate(plan.created_at)}</small>
              </div>
            </div>

            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={tabs}
              className="plan-detail-tabs"
            />

            <div className="plan-detail-footer">
              <span>计划 #{plan.id}</span>
              <span>最后更新 {formatDate(plan.updated_at)}</span>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                onClick={reload}
              >
                刷新
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<LinkOutlined />}
            title="无法载入这个计划"
            description="它可能已被删除，或后端服务暂时不可用。"
            action={
              <Button icon={<ReloadOutlined />} onClick={reload}>
                重新载入
              </Button>
            }
          />
        )}
      </Drawer>

      <PlanFormDrawer
        open={formOpen}
        plan={plan}
        onClose={() => setFormOpen(false)}
        onSaved={(updated) => {
          applyUpdated(updated)
          reload()
        }}
      />
      <PlanStatusModal
        open={statusOpen}
        plan={plan}
        onClose={() => setStatusOpen(false)}
        onChanged={(updated) => {
          applyUpdated(updated)
          reload()
        }}
      />
      <PlanProgressModal
        open={progressOpen}
        plan={plan}
        onClose={() => setProgressOpen(false)}
        onChanged={(updated) => {
          applyUpdated(updated)
          reload()
        }}
      />
      <PlanNodeModal
        open={nodeModal.open}
        plan={plan}
        node={nodeModal.node}
        onClose={() => setNodeModal({ open: false, node: null })}
        onChanged={(updated) => {
          applyUpdated(updated)
          reload()
        }}
      />
      <PlanActualModal
        open={actualModal.open}
        plan={plan}
        actual={actualModal.actual}
        onClose={() => setActualModal({ open: false, actual: null })}
        onChanged={(updated) => {
          applyUpdated(updated)
          reload()
        }}
      />
    </>
  )
}
