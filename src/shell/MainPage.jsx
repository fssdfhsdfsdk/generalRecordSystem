import React, { useEffect, useState } from 'react'
import { App as AntApp, Button, Progress, Skeleton } from 'antd'
import {
  ArrowRightOutlined,
  BookOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  GithubOutlined,
  PlusOutlined,
  ProjectOutlined,
  ReadOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { api } from '../api'
import { navigate } from '../router'
import { formatShortDate } from '../utils'
import { useAppData } from './AppDataContext'
import TitleText from '../components/TitleText'
import TagPill from '../components/TagPill'
import RecordViewDrawer from '../subsystems/records/components/RecordViewDrawer'
import TypeIcon from '../subsystems/records/components/TypeIcon'
import PlanStatusTag from '../subsystems/plans/components/PlanStatusTag'
import PlanDetailDrawer from '../subsystems/plans/components/PlanDetailDrawer'
import { formatHours, planTypeMeta } from '../subsystems/plans/planMeta'
import DocTypeIcon from '../subsystems/docs/components/DocTypeIcon'
import DocStatusTag from '../subsystems/docs/components/DocStatusTag'
import { formatDocHours } from '../subsystems/docs/docsMeta'

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
  docs: {
    total: 0,
    by_type: {},
    by_status: { unread: 0, reading: 0, completed: 0 },
    tags: 0,
    avg_progress: 0,
    history_hours: 0,
    history_count: 0,
    recent: [],
    reading_now: [],
  },
  repositories: {
    total: 0,
    tags: 0,
    languages: 0,
    resources: 0,
    relations: 0,
    recent: [],
  },
  tools: {
    total: 0,
    tags: 0,
    platforms: 0,
    open_source: 0,
    resources: 0,
    relations: 0,
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
  const docs = data.docs || EMPTY.docs
  const repositories = data.repositories || EMPTY.repositories
  const tools = data.tools || EMPTY.tools
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
            <ThunderboltOutlined /> 本地工作台 · 五库隔离 · 一个入口
          </span>
          <h1>
            把记录收好，
            <br />
            把计划推进，把书读透。
          </h1>
          <p>
            通用记录保存事实、问答与根因；计划管理拆解目标、记录时间与进度；
            书籍与文档管理收拢书、论文、文章、规范与办公材料；仓库管理与工具管理整理技术资源、
            平台、标签和关联品。五个子系统各自拥有独立的数据文件，互不干扰。
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
            <Button
              size="large"
              className="hero-ghost-button hero-ghost-docs"
              icon={<ReadOutlined />}
              onClick={() => navigate('/docs')}
            >
              进入书籍与文档
            </Button>
            <Button
              size="large"
              className="hero-ghost-button hero-ghost-repos"
              icon={<GithubOutlined />}
              onClick={() => navigate('/repositories')}
            >
              进入仓库管理
            </Button>
            <Button
              size="large"
              className="hero-ghost-button hero-ghost-tools"
              icon={<ToolOutlined />}
              onClick={() => navigate('/tools')}
            >
              进入工具管理
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
                  <span>文档</span>
                  <strong>{docs.total}</strong>
                  <small>{docs.by_status?.reading || 0} 篇阅读中</small>
                </div>
                <div className="main-pulse-item">
                  <span>仓库</span>
                  <strong>{repositories.total}</strong>
                  <small>{repositories.languages} 种编程语言</small>
                </div>
                <div className="main-pulse-item">
                  <span>工具</span>
                  <strong>{tools.total}</strong>
                  <small>{tools.open_source} 个开源</small>
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

        <button
          type="button"
          className="subsystem-card subsystem-docs"
          onClick={() => navigate('/docs')}
        >
          <div className="subsystem-card-top">
            <span className="subsystem-icon">
              <ReadOutlined />
            </span>
            <span className="subsystem-arrow">
              <ArrowRightOutlined />
            </span>
          </div>
          <div className="subsystem-kicker">READING LIBRARY</div>
          <h2>书籍与文档</h2>
          <p>
            书籍、论文、文章博客、技术规范与商业材料；阅读笔记、感想、历史、标签和进度一起归档。
          </p>
          <div className="subsystem-stats">
            <span>
              <strong>{docs.total}</strong> 篇文档
            </span>
            <span>
              <strong>{docs.by_status?.reading || 0}</strong> 篇阅读中
            </span>
            <span>
              <strong>{docs.by_status?.completed || 0}</strong> 篇完成
            </span>
          </div>
          <div className="subsystem-chips">
            <span>阅读历史</span>
            <span>独立标签</span>
            <span>笔记 / 感想</span>
          </div>
        </button>

        <button
          type="button"
          className="subsystem-card subsystem-repositories"
          onClick={() => navigate('/repositories')}
        >
          <div className="subsystem-card-top">
            <span className="subsystem-icon">
              <GithubOutlined />
            </span>
            <span className="subsystem-arrow">
              <ArrowRightOutlined />
            </span>
          </div>
          <div className="subsystem-kicker">REPOSITORY CATALOG</div>
          <h2>仓库管理</h2>
          <p>
            收集代码仓库、开源项目与技术资源；编程语言、标签、资源地址和关联品一起维护。
          </p>
          <div className="subsystem-stats">
            <span>
              <strong>{repositories.total}</strong> 个仓库
            </span>
            <span>
              <strong>{repositories.languages}</strong> 种语言
            </span>
            <span>
              <strong>{repositories.tags}</strong> 个标签
            </span>
          </div>
          <div className="subsystem-chips">
            <span>资源地址</span>
            <span>关联品</span>
            <span>标签筛选</span>
          </div>
        </button>

        <button
          type="button"
          className="subsystem-card subsystem-tools"
          onClick={() => navigate('/tools')}
        >
          <div className="subsystem-card-top">
            <span className="subsystem-icon">
              <ToolOutlined />
            </span>
            <span className="subsystem-arrow">
              <ArrowRightOutlined />
            </span>
          </div>
          <div className="subsystem-kicker">TOOL CATALOG</div>
          <h2>工具管理</h2>
          <p>
            管理开发与效率工具；开源状态、支持平台、标签、资源地址和关联品集中归档。
          </p>
          <div className="subsystem-stats">
            <span>
              <strong>{tools.total}</strong> 个工具
            </span>
            <span>
              <strong>{tools.open_source}</strong> 个开源
            </span>
            <span>
              <strong>{tools.platforms}</strong> 个平台
            </span>
          </div>
          <div className="subsystem-chips">
            <span>支持平台</span>
            <span>开源标记</span>
            <span>标签筛选</span>
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
          <ReadOutlined />
          <div>
            <span>文档总量</span>
            <strong>{docs.total}</strong>
          </div>
        </div>
        <div className="main-stat">
          <CheckCircleOutlined />
          <div>
            <span>完成阅读</span>
            <strong>{docs.by_status?.completed || 0}</strong>
          </div>
        </div>
        <div className="main-stat">
          <GithubOutlined />
          <div>
            <span>仓库总量</span>
            <strong>{repositories.total}</strong>
          </div>
        </div>
        <div className="main-stat">
          <ToolOutlined />
          <div>
            <span>工具总量</span>
            <strong>{tools.total}</strong>
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

        <div className="main-recent-card">
          <div className="section-heading compact">
            <div>
              <div className="eyebrow">RECENT DOCUMENTS</div>
              <h2>最近文档</h2>
            </div>
            <Button type="text" onClick={() => navigate('/docs')}>
              全部 <ArrowRightOutlined />
            </Button>
          </div>
          {loading ? (
            <Skeleton active paragraph={{ rows: 3 }} />
          ) : docs.recent.length ? (
            <div className="main-recent-list">
              {docs.recent.map((doc) => (
                <button
                  type="button"
                  className="main-recent-row"
                  key={doc.id}
                  onClick={() => navigate(`/docs/${doc.id}`)}
                >
                  <DocTypeIcon
                    type={{ id: doc.type_id, slug: doc.type_slug }}
                    size="sm"
                  />
                  <span className="main-recent-main">
                    <span className="main-recent-title">
                      <TitleText text={doc.title} maxChars={38} />
                    </span>
                    <span className="main-recent-meta">
                      {doc.type_name} · {formatDocHours(doc.total_hours)} ·{' '}
                      {formatShortDate(doc.updated_at)}
                    </span>
                  </span>
                  <span className="main-recent-progress">
                    <Progress
                      percent={doc.reading_progress}
                      size="small"
                      showInfo={false}
                      strokeColor="#f59e0b"
                    />
                    <span>{doc.reading_progress}%</span>
                  </span>
                  <DocStatusTag status={doc.reading_status} size="small" />
                </button>
              ))}
            </div>
          ) : (
            <div className="main-empty">
              <p>还没有文档。</p>
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() => navigate('/docs')}
              >
                添加第一篇
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
