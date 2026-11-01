import React, { useEffect, useState } from 'react'
import { App as AntApp, Button, Progress, Skeleton, Space } from 'antd'
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FlagOutlined,
  PlusOutlined,
  ProjectOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { planApi } from '../api'
import { navigate } from '../../../router'
import { formatShortDate } from '../../../utils'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'
import TitleText from '../../../components/TitleText'
import PlanStatusTag from '../components/PlanStatusTag'
import PlanFormDrawer from '../components/PlanFormDrawer'
import PlanDetailDrawer from '../components/PlanDetailDrawer'
import {
  PLAN_STATUS_META,
  PLAN_TYPES,
  formatHours,
  planTypeMeta,
} from '../planMeta'

const EMPTY_STATS = {
  total: 0,
  by_type: { long: 0, mid: 0, short: 0 },
  by_status: {},
  tags: 0,
  overdue: 0,
  completion_avg: 0,
  recent: [],
}

export default function PlanOverviewPage() {
  const { message } = AntApp.useApp()
  const [stats, setStats] = useState(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    planApi
      .stats()
      .then((data) => {
        if (alive) setStats(data)
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
  }, [message, reloadToken])

  const active =
    (stats.by_status?.in_progress || 0) +
    (stats.by_status?.on_hold || 0) +
    (stats.by_status?.overdue || 0)

  return (
    <div className="page plan-overview-page">
      <PageHeader
        eyebrow="PLAN MANAGEMENT"
        title="计划管理"
        description="长远、中期、短期三类计划，共用同一套节点、实际时间点、进度与状态审计。数据独立保存在 plans.db。"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setFormOpen(true)}
          >
            新建计划
          </Button>
        }
      />

      <section className="plan-overview-hero">
        <div className="plan-overview-copy">
          <div className="eyebrow">THREE HORIZONS</div>
          <h2>不同时间尺度，不同的推进方式。</h2>
          <p>
            长远计划看方向，中期计划看阶段交付，短期计划看下一件具体的事。
            每个计划都可以拆节点、记实际时间、留进度与阻塞，所有状态变化都有审计。
          </p>
          <div className="plan-overview-metrics">
            <div>
              <span>全部计划</span>
              <strong>{stats.total}</strong>
            </div>
            <div>
              <span>推进中</span>
              <strong>{active}</strong>
            </div>
            <div>
              <span>平均完成度</span>
              <strong>{stats.completion_avg}%</strong>
            </div>
            <div>
              <span>超时</span>
              <strong className={stats.overdue ? 'is-warning' : ''}>
                {stats.overdue}
              </strong>
            </div>
          </div>
        </div>
        <div className="plan-overview-panel">
          <div className="hero-panel-head">
            <span>PLAN PULSE</span>
            <span className="hero-panel-live">
              <span className="status-dot" /> LIVE
            </span>
          </div>
          <div className="plan-overview-panel-body">
            <div className="plan-overview-ring">
              <Progress
                type="circle"
                percent={stats.completion_avg}
                size={118}
                strokeColor="#4f46e5"
                trailColor="rgba(148, 163, 184, 0.18)"
              />
              <span>平均完成度</span>
            </div>
            <div className="plan-overview-status-bars">
              {Object.entries(PLAN_STATUS_META).map(([key, meta]) => {
                const count = stats.by_status?.[key] || 0
                const percent = stats.total
                  ? Math.round((count / stats.total) * 100)
                  : 0
                return (
                  <div className="plan-status-bar" key={key}>
                    <span>{meta.label}</span>
                    <div className="plan-status-bar-track">
                      <span
                        className={`plan-status-bar-fill plan-fill-${meta.tone}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <strong>{count}</strong>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="plan-overview-panel-foot">
            <span>plans.db</span>
            <span>{stats.tags} 个计划标签</span>
            <span>状态审计</span>
          </div>
        </div>
      </section>

      <section className="plan-type-grid">
        {PLAN_TYPES.map((type) => {
          const count = stats.by_type?.[type.key] || 0
          return (
            <button
              type="button"
              className={`plan-type-card plan-type-${type.tone}`}
              key={type.key}
              onClick={() => navigate(type.path)}
            >
              <div className="plan-type-card-head">
                <span className="plan-type-kicker">{type.kicker}</span>
                <span className="plan-type-arrow">
                  <ArrowRightOutlined />
                </span>
              </div>
              <h3>{type.label}</h3>
              <p>{type.description}</p>
              <div className="plan-type-card-foot">
                <strong>{count}</strong>
                <span>个计划</span>
              </div>
            </button>
          )
        })}
      </section>

      <section className="section-block plan-recent-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">RECENTLY UPDATED</div>
            <h2>最近更新</h2>
            <p>最近有进展或变更的计划。</p>
          </div>
          <Button type="text" onClick={() => navigate('/plans/tags')}>
            <FlagOutlined /> 计划标签
          </Button>
        </div>

        {loading ? (
          <div className="plan-recent-card">
            <Skeleton active paragraph={{ rows: 5 }} />
          </div>
        ) : stats.recent.length ? (
          <div className="plan-recent-card">
            {stats.recent.map((plan) => {
              const type = planTypeMeta(plan.plan_type)
              return (
                <button
                  type="button"
                  className="plan-recent-row"
                  key={plan.id}
                  onClick={() => setDetailId(plan.id)}
                >
                  <span className={`plan-type-dot plan-tone-${type.tone}`} />
                  <span className="plan-recent-main">
                    <span className="plan-recent-title">
                      <TitleText text={plan.title} maxChars={46} />
                    </span>
                    <span className="plan-recent-meta">
                      {type.label} · {formatHours(plan.estimated_hours)} · 更新于{' '}
                      {formatShortDate(plan.updated_at)}
                    </span>
                  </span>
                  <span className="plan-recent-progress">
                    <Progress
                      percent={plan.progress}
                      size="small"
                      showInfo={false}
                      strokeColor="#4f46e5"
                    />
                    <span>{plan.progress}%</span>
                  </span>
                  <PlanStatusTag status={plan.status} size="small" />
                  <ArrowRightOutlined className="plan-recent-arrow" />
                </button>
              )
            })}
          </div>
        ) : (
          <div className="plan-recent-card">
            <EmptyState
              icon={<ProjectOutlined />}
              title="还没有计划"
              description="创建第一条计划，从短期目标开始，再逐步拆成节点。"
              action={
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setFormOpen(true)}
                >
                  创建计划
                </Button>
              }
              compact
            />
          </div>
        )}
      </section>

      <PlanDetailDrawer
        open={Boolean(detailId)}
        planId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={() => setReloadToken((token) => token + 1)}
        onDeleted={() => setReloadToken((token) => token + 1)}
      />
      <PlanFormDrawer
        open={formOpen}
        defaultType="short"
        onClose={() => setFormOpen(false)}
        onSaved={() => setReloadToken((token) => token + 1)}
      />
    </div>
  )
}
