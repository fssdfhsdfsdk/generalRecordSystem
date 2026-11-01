import React, { useEffect, useState } from 'react'
import { App as AntApp, Button, Progress, Skeleton } from 'antd'
import {
  ArrowRightOutlined,
  BookOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FlagOutlined,
  PlusOutlined,
  ProjectOutlined,
  TagsOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { api } from '../api'
import { navigate, tagFilterPath } from '../router'
import { formatShortDate } from '../utils'
import { useAppData } from './AppDataContext'
import TitleText from '../components/TitleText'
import TagPill from '../components/TagPill'
import RecordViewDrawer from '../subsystems/records/components/RecordViewDrawer'
import TypeIcon from '../subsystems/records/components/TypeIcon'
import PlanStatusTag from '../subsystems/plans/components/PlanStatusTag'
import PlanDetailDrawer from '../subsystems/plans/components/PlanDetailDrawer'
import { formatHours, planTypeMeta } from '../subsystems/plans/planMeta'

const EMPTY = {
  records: { records: 0, types: 0, tags: 0, recent: [] },
  plans: {
    total: 0,
    by_type: { long: 0, mid: 0, short: 0 },
    by_status: {},
    tags: 0,
    overdue: 0,
    completion_avg: 0,
    recent: [],
  },
}

export default function MainPage() {
  const { message } = AntApp.useApp()
  const { types } = useAppData()
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [recordId, setRecordId] = useState(null)
  const [planId, setPlanId] = useState(null)

  const load = async () => {
    try {
      const result = await api.overview()
      setData(result)
    } catch (error) {
      message.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const records = data.records || EMPTY.records
  const plans = data.plans || EMPTY.plans
  const activePlans =
    (plans.by_status?.in_progress || 0) +
    (plans.by_status?.overdue || 0) +
    (plans.by_status?.on_hold || 0)

  return (
    <div className="page main-page">
      <section className="main-hero">
        <div className="main-hero-glow main-hero-glow-a" />
        <div className="main-hero-glow main-hero-glow-b" />
        <div className="main-hero-copy">
          <span className="hero-kicker">
            <ThunderboltOutlined /> 本地工作台 · 双库隔离 · 一个入口
          </span>
          <h1>
            把记录收好，
            <br />
            把计划推进。
          </h1>
          <p>
            通用记录负责保存事实、问答与根因；计划管理负责把目标拆成节点、记录实际时间与进度变化。
            两个子系统各自拥有独立的数据文件，互不干扰。
          </p>
          <div className="main-hero-actions">
            <Button
              type="primary"
              size="large"
              icon={<BookOutlined />}
              onClick={() => navigate('/records')}
            >
              进入通用记录
            </Button>
            <Button
              size="large"
              className="hero-ghost-button"
              icon={<ProjectOutlined />}
              onClick={() => navigate('/plans')}
            >
              进入计划管理
            </Button>
          </div>
        </div>

        <div className="main-hero-panel">
          <div className="hero-panel-head">
            <span>WORKSPACE PULSE</span>
            <span className="hero-panel-live">
              <span className="status-dot" /> LIVE
            </span>
          </div>
          {loading ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : (
            <>
              <div className="main-pulse-grid">
                <div className="main-pulse-item">
                  <span>记录</span>
                  <strong>{records.records}</strong>
                  <small>{records.types} 个类型</small>
                </div>
                <div className="main-pulse-item">
                  <span>计划</span>
                  <strong>{plans.total}</strong>
                  <small>{activePlans} 个在推进</small>
                </div>
                <div className="main-pulse-item">
                  <span>完成度</span>
                  <strong>{plans.completion_avg}%</strong>
                  <small>计划平均</small>
                </div>
              </div>
              <div className="main-pulse-foot">
                <ClockCircleOutlined /> 最后刷新：{formatShortDate(new Date().toISOString())}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="subsystem-grid">
        <button
          type="button"
          className="subsystem-card subsystem-records"
          onClick={() => navigate('/records')}
        >
          <div className="subsystem-card-top">
            <span className="subsystem-icon">
              <BookOutlined />
            </span>
            <span className="subsystem-arrow">
              <ArrowRightOutlined />
            </span>
          </div>
          <div className="subsystem-kicker">GENERAL RECORDS</div>
          <h2>通用记录</h2>
          <p>
            自定义类型与字段，用标签把散落的事实、问答和根因串起来。
          </p>
          <div className="subsystem-stats">
            <span>
              <strong>{records.records}</strong> 条记录
            </span>
            <span>
              <strong>{records.types}</strong> 个类型
            </span>
            <span>
              <strong>{records.tags}</strong> 个标签
            </span>
          </div>
          <div className="subsystem-chips">
            <span>动态字段</span>
            <span>Markdown</span>
            <span>标签 AND</span>
          </div>
        </button>

        <button
          type="button"
          className="subsystem-card subsystem-plans"
          onClick={() => navigate('/plans')}
        >
          <div className="subsystem-card-top">
            <span className="subsystem-icon">
              <CalendarOutlined />
            </span>
            <span className="subsystem-arrow">
              <ArrowRightOutlined />
            </span>
          </div>
          <div className="subsystem-kicker">PLAN MANAGEMENT</div>
          <h2>计划管理</h2>
          <p>
            长远、中期、短期三类计划；节点、实际时间点、进度与状态流转都可追溯。
          </p>
          <div className="subsystem-stats">
            <span>
              <strong>{plans.total}</strong> 个计划
            </span>
            <span>
              <strong>{activePlans}</strong> 个进行中
            </span>
            <span>
              <strong>{plans.overdue}</strong> 个超时
            </span>
          </div>
          <div className="subsystem-chips">
            <span>状态审计</span>
            <span>节点权重</span>
            <span>进度历史</span>
          </div>
        </button>
      </section>

      <section className="main-stat-strip">
        <div className="main-stat">
          <BookOutlined />
          <div>
            <span>记录总量</span>
            <strong>{records.records}</strong>
          </div>
        </div>
        <div className="main-stat">
          <ProjectOutlined />
          <div>
            <span>计划总量</span>
            <strong>{plans.total}</strong>
          </div>
        </div>
        <div className="main-stat">
          <CheckCircleOutlined />
          <div>
            <span>已完成计划</span>
            <strong>{plans.by_status?.completed || 0}</strong>
          </div>
        </div>
        <div className="main-stat">
          <FlagOutlined />
          <div>
            <span>计划标签</span>
            <strong>{plans.tags}</strong>
          </div>
        </div>
      </section>

      <section className="main-recent-grid">
        <div className="main-recent-card">
          <div className="section-heading compact">
            <div>
              <div className="eyebrow">RECENT RECORDS</div>
              <h2>最近记录</h2>
            </div>
            <Button type="text" onClick={() => navigate('/records')}>
              全部 <ArrowRightOutlined />
            </Button>
          </div>
          {loading ? (
            <Skeleton active paragraph={{ rows: 3 }} />
          ) : records.recent.length ? (
            <div className="main-recent-list">
              {records.recent.map((record) => (
                <button
                  type="button"
                  className="main-recent-row"
                  key={record.id}
                  onClick={() => setRecordId(record.id)}
                >
                  <TypeIcon name={record.type_name} size="sm" />
                  <span className="main-recent-main">
                    <span className="main-recent-title">
                      <TitleText text={record.title} maxChars={40} />
                    </span>
                    <span className="main-recent-meta">
                      {record.type_name} · {formatShortDate(record.updated_at)}
                    </span>
                  </span>
                  <span className="main-recent-tags">
                    {record.tags.slice(0, 1).map((tag) => (
                      <TagPill key={tag} name={tag} size="sm" />
                    ))}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="main-empty">
              <p>还没有记录。</p>
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() =>
                  navigate(types[0] ? `/type/${types[0].id}` : '/records')
                }
              >
                写第一条
              </Button>
            </div>
          )}
        </div>

        <div className="main-recent-card">
          <div className="section-heading compact">
            <div>
              <div className="eyebrow">RECENT PLANS</div>
              <h2>最近计划</h2>
            </div>
            <Button type="text" onClick={() => navigate('/plans')}>
              全部 <ArrowRightOutlined />
            </Button>
          </div>
          {loading ? (
            <Skeleton active paragraph={{ rows: 3 }} />
          ) : plans.recent.length ? (
            <div className="main-recent-list">
              {plans.recent.map((plan) => {
                const type = planTypeMeta(plan.plan_type)
                return (
                  <button
                    type="button"
                    className="main-recent-row"
                    key={plan.id}
                    onClick={() => setPlanId(plan.id)}
                  >
                    <span className={`plan-type-dot plan-tone-${type.tone}`} />
                    <span className="main-recent-main">
                      <span className="main-recent-title">
                        <TitleText text={plan.title} maxChars={40} />
                      </span>
                      <span className="main-recent-meta">
                        {type.label} · {formatHours(plan.estimated_hours)}
                      </span>
                    </span>
                    <span className="main-recent-progress">
                      <Progress
                        percent={plan.progress}
                        size="small"
                        showInfo={false}
                        strokeColor="#4f46e5"
                      />
                      <span>{plan.progress}%</span>
                    </span>
                    <PlanStatusTag status={plan.status} size="small" />
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="main-empty">
              <p>还没有计划。</p>
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() => navigate('/plans/short')}
              >
                创建计划
              </Button>
            </div>
          )}
        </div>
      </section>

      <RecordViewDrawer
        open={Boolean(recordId)}
        recordId={recordId}
        onClose={() => setRecordId(null)}
      />
      <PlanDetailDrawer
        open={Boolean(planId)}
        planId={planId}
        onClose={() => {
          setPlanId(null)
          load()
        }}
        onChanged={() => load()}
      />
    </div>
  )
}
