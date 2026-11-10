import React, { useEffect, useMemo, useState } from 'react'
import { App as AntApp, Button, Progress, Skeleton, Space } from 'antd'
import {
  ArrowRightOutlined,
  BookOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  ReadOutlined,
  SettingOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { docApi } from '../api'
import { navigate } from '../../../router'
import { formatShortDate } from '../../../utils'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'
import TitleText from '../../../components/TitleText'
import DocTypeIcon from '../components/DocTypeIcon'
import DocStatusTag from '../components/DocStatusTag'
import DocViewDrawer from '../components/DocViewDrawer'
import {
  DOC_STATUS_META,
  docTypeTone,
  formatDocHours,
} from '../docsMeta'

const EMPTY_STATS = {
  total: 0,
  by_type: {},
  by_status: { unread: 0, reading: 0, completed: 0 },
  tags: 0,
  avg_progress: 0,
  history_hours: 0,
  history_count: 0,
  recent: [],
  reading_now: [],
}

function DocRecentRow({ doc, onOpen }) {
  return (
    <button type="button" className="doc-recent-row" onClick={() => onOpen(doc.id)}>
      <DocTypeIcon type={{ slug: doc.type_slug, id: doc.type_id }} size="sm" />
      <span className="doc-recent-main">
        <span className="doc-recent-title">
          <TitleText text={doc.title} maxChars={48} />
        </span>
        <span className="doc-recent-meta">
          {doc.type_name} · {formatShortDate(doc.updated_at)}
          {doc.history_count ? ` · ${doc.history_count} 次阅读` : ''}
        </span>
      </span>
      <span className="doc-recent-progress">
        <Progress
          percent={doc.reading_progress}
          size="small"
          showInfo={false}
          strokeColor="#4f46e5"
        />
        <span>{doc.reading_progress}%</span>
      </span>
      <DocStatusTag status={doc.reading_status} size="small" />
      <ArrowRightOutlined className="doc-recent-arrow" />
    </button>
  )
}

export default function DocsOverviewPage() {
  const { message } = AntApp.useApp()
  const [stats, setStats] = useState(EMPTY_STATS)
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([docApi.stats(), docApi.listTypes()])
      .then(([statsData, typeData]) => {
        if (!alive) return
        setStats({ ...EMPTY_STATS, ...statsData })
        setTypes(typeData.types)
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

  const firstType = types[0]
  const newPath = firstType ? `/docs/new?type=${firstType.id}` : '/docs/types'

  const typeCards = useMemo(
    () =>
      types.map((type, index) => ({
        ...type,
        tone: docTypeTone(type, index),
        count: stats.by_type?.[String(type.id)] || 0,
      })),
    [types, stats.by_type],
  )

  return (
    <div className="page docs-overview-page">
      <PageHeader
        eyebrow="READING LIBRARY"
        title="书籍与文档"
        description="把书、论文、文章、技术规范与办公材料收进同一个阅读工作台。类型、标签、笔记、感想与阅读历史独立保存在 docs.db。"
        extra={
          <Space wrap>
            <Button icon={<SettingOutlined />} onClick={() => navigate('/docs/types')}>
              类型管理
            </Button>
            <Button icon={<TagsOutlined />} onClick={() => navigate('/docs/tags')}>
              标签管理
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(newPath)}>
              新建文档
            </Button>
          </Space>
        }
      />

      <section className="docs-overview-hero">
        <div className="docs-overview-copy">
          <div className="eyebrow">FROM SHELF TO INSIGHT</div>
          <h2>读过的，留下来。</h2>
          <p>
            每篇文档都有状态、进度与优先级；阅读笔记与感想分开记录，阅读历史按时间段回看。
            默认的五个类型覆盖书籍、论文、文章博客日志、技术与规范、商业与办公材料。
          </p>
          <div className="docs-overview-metrics">
            <div>
              <span>全部文档</span>
              <strong>{stats.total}</strong>
            </div>
            <div>
              <span>阅读中</span>
              <strong>{stats.by_status?.reading || 0}</strong>
            </div>
            <div>
              <span>已完成</span>
              <strong>{stats.by_status?.completed || 0}</strong>
            </div>
            <div>
              <span>平均进度</span>
              <strong>{stats.avg_progress}%</strong>
            </div>
          </div>
        </div>
        <div className="docs-overview-panel">
          <div className="hero-panel-head">
            <span>READING PULSE</span>
            <span className="hero-panel-live">
              <span className="status-dot" /> LIVE
            </span>
          </div>
          <div className="docs-overview-panel-body">
            <div className="docs-overview-ring">
              <Progress
                type="circle"
                percent={stats.avg_progress}
                size={116}
                strokeColor="#f59e0b"
                trailColor="rgba(148, 163, 184, 0.18)"
              />
              <span>平均阅读进度</span>
            </div>
            <div className="docs-overview-status-bars">
              {Object.entries(DOC_STATUS_META).map(([key, meta]) => {
                const count = stats.by_status?.[key] || 0
                const percent = stats.total ? Math.round((count / stats.total) * 100) : 0
                return (
                  <div className="docs-status-bar" key={key}>
                    <span>{meta.label}</span>
                    <div className="docs-status-bar-track">
                      <span
                        className={`docs-status-bar-fill doc-fill-${meta.tone}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <strong>{count}</strong>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="docs-overview-panel-foot">
            <span>docs.db</span>
            <span>{stats.tags} 个文档标签</span>
            <span>{stats.history_count} 条阅读历史</span>
          </div>
        </div>
      </section>

      <section className="docs-type-grid">
        {loading
          ? [0, 1, 2, 3, 4].map((item) => (
              <div className="docs-type-card docs-type-card-skeleton" key={item}>
                <Skeleton active paragraph={{ rows: 3 }} />
              </div>
            ))
          : typeCards.map((type, index) => (
              <button
                type="button"
                className={`docs-type-card doc-tone-${type.tone}`}
                key={type.id}
                onClick={() => navigate(`/docs/type/${type.id}`)}
              >
                <div className="docs-type-card-head">
                  <DocTypeIcon type={type} index={index} size="md" />
                  <span className="docs-type-arrow">
                    <ArrowRightOutlined />
                  </span>
                </div>
                <h3>{type.name}</h3>
                <p>{type.description || '这一类文档的说明还没有填写。'}</p>
                <div className="docs-type-card-foot">
                  <strong>{type.count}</strong>
                  <span>篇文档</span>
                </div>
              </button>
            ))}
      </section>

      {!loading && !types.length ? (
        <EmptyState
          icon={<SettingOutlined />}
          title="还没有文档类型"
          description="先创建一种类型，再开始归档文档。"
          action={
            <Button type="primary" onClick={() => navigate('/docs/types')}>
              新建类型
            </Button>
          }
        />
      ) : null}

      <section className="docs-overview-lists">
        <div className="docs-recent-card">
          <div className="section-heading compact">
            <div>
              <div className="eyebrow">READING NOW</div>
              <h2>正在读</h2>
            </div>
            <span className="muted-text">
              {stats.by_status?.reading || 0} 篇进行中 ·{' '}
              {stats.by_status?.unread || 0} 篇未读
            </span>
          </div>
          {loading ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : stats.reading_now.length ? (
            <div className="doc-recent-list">
              {stats.reading_now.map((doc) => (
                <DocRecentRow
                  key={doc.id}
                  doc={doc}
                  onOpen={(id) => setDetailId(id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ReadOutlined />}
              title="暂时没有进行中的阅读"
              description="把文档状态改为「进行中」，它就会出现在这里。"
              action={
                <Button icon={<PlusOutlined />} onClick={() => navigate(newPath)}>
                  添加文档
                </Button>
              }
              compact
            />
          )}
        </div>

        <div className="docs-recent-card">
          <div className="section-heading compact">
            <div>
              <div className="eyebrow">RECENTLY UPDATED</div>
              <h2>最近更新</h2>
            </div>
            <Button type="text" onClick={() => navigate('/docs/tags')}>
              <TagsOutlined /> 标签
            </Button>
          </div>
          {loading ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : stats.recent.length ? (
            <div className="doc-recent-list">
              {stats.recent.map((doc) => (
                <DocRecentRow
                  key={doc.id}
                  doc={doc}
                  onOpen={(id) => setDetailId(id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<BookOutlined />}
              title="还没有文档"
              description="从一本书、一篇论文或一份规范开始。"
              action={
                <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(newPath)}>
                  新建第一篇文档
                </Button>
              }
              compact
            />
          )}
        </div>
      </section>

      <section className="docs-insight-strip">
        <div>
          <ClockCircleOutlined />
          <span>累计阅读历史</span>
          <strong>{formatDocHours(stats.history_hours)}</strong>
        </div>
        <div>
          <CheckCircleOutlined />
          <span>完成阅读</span>
          <strong>{stats.by_status?.completed || 0} 篇</strong>
        </div>
        <div>
          <TagsOutlined />
          <span>使用中的标签</span>
          <strong>{stats.tags} 个</strong>
        </div>
      </section>

      <DocViewDrawer
        open={Boolean(detailId)}
        documentId={detailId}
        onClose={() => setDetailId(null)}
        onDeleted={() => setReloadToken((token) => token + 1)}
      />
    </div>
  )
}
