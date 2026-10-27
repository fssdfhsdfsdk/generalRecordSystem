import React, { useEffect, useState } from 'react'
import { App as AntApp, Button, Skeleton, Space } from 'antd'
import {
  ArrowRightOutlined,
  BookOutlined,
  PlusOutlined,
  TagsOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { api } from '../api'
import { useAppData } from '../App'
import { navigate, tagFilterPath } from '../router'
import { formatShortDate } from '../utils'
import EmptyState from '../components/EmptyState'
import RecordViewDrawer from '../components/RecordViewDrawer'
import TagPill from '../components/TagPill'
import TypeIcon, { typeVisual } from '../components/TypeIcon'

export default function HomePage() {
  const { message } = AntApp.useApp()
  const { types, typesLoading } = useAppData()
  const [stats, setStats] = useState({ types: 0, records: 0, tags: 0, recent: [] })
  const [statsLoading, setStatsLoading] = useState(true)
  const [viewId, setViewId] = useState(null)

  const loadStats = async () => {
    try {
      const data = await api.stats()
      setStats(data)
    } catch (error) {
      message.error(error.message)
    } finally {
      setStatsLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const firstType = types[0]
  const openTag = (tag) => navigate(tagFilterPath([tag]))

  return (
    <div className="page home-page">
      <section className="hero">
        <div className="hero-glow hero-glow-a" />
        <div className="hero-glow hero-glow-b" />
        <div className="hero-copy">
          <span className="hero-kicker">
            <ThunderboltOutlined /> 自定义类型 · 自由字段 · 标签串联
          </span>
          <h1>
            让每一类记录，
            <br />
            有自己的形状。
          </h1>
          <p>
            把散落在文档、笔记和聊天里的内容收回来。为 Q&amp;A、问题根因、需求记录，或者任何你需要的主题，
            建一套真正顺手的信息结构。
          </p>
          <Space size={10} wrap>
            <Button
              type="primary"
              size="large"
              icon={<BookOutlined />}
              onClick={() => navigate(firstType ? `/type/${firstType.id}` : '/manage')}
            >
              {firstType ? '开始记录' : '创建第一个类型'}
            </Button>
            <Button
              size="large"
              className="hero-ghost-button"
              icon={<PlusOutlined />}
              onClick={() => navigate('/manage')}
            >
              管理类型
            </Button>
          </Space>
        </div>

        <div className="hero-panel">
          <div className="hero-panel-head">
            <span>LOCAL LEDGER</span>
            <span className="hero-panel-live">
              <span className="status-dot" /> LIVE
            </span>
          </div>
          <div className="hero-stat-grid">
            <div className="hero-stat">
              <span className="hero-stat-label">记录</span>
              <strong>{stats.records}</strong>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-label">类型</span>
              <strong>{stats.types}</strong>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-label">标签</span>
              <strong>{stats.tags}</strong>
            </div>
          </div>
          <div className="hero-panel-foot">
            <span>SQLite · 单文件</span>
            <span>Markdown · GFM</span>
            <span>本地优先</span>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <div className="eyebrow">COLLECTIONS</div>
            <h2>记录类型</h2>
            <p>每种类型有自己的字段结构，互不干扰。</p>
          </div>
          <Button type="text" onClick={() => navigate('/manage')}>
            全部类型 <ArrowRightOutlined />
          </Button>
        </div>

        {typesLoading ? (
          <div className="type-grid">
            {[0, 1, 2].map((item) => (
              <div className="type-card type-card-skeleton" key={item}>
                <Skeleton active paragraph={{ rows: 2 }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="type-grid">
            {types.map((type) => {
              const visual = typeVisual(type.name)
              return (
                <button
                  type="button"
                  className="type-card"
                  key={type.id}
                  onClick={() => navigate(`/type/${type.id}`)}
                >
                  <div className="type-card-head">
                    <TypeIcon name={type.name} />
                    <span className={`type-card-arrow type-tone-${visual.tone}`}>
                      <ArrowRightOutlined />
                    </span>
                  </div>
                  <div className="type-card-name">{type.name}</div>
                  <div className="type-card-meta">
                    {type.record_count} 条记录 · {type.fields.length} 个字段
                  </div>
                  <div className="type-card-fields">
                    {type.fields.slice(0, 3).map((field) => (
                      <span className="field-chip" key={field.id}>
                        {field.field_name}
                      </span>
                    ))}
                    {type.fields.length > 3 ? (
                      <span className="field-chip field-chip-more">
                        +{type.fields.length - 3}
                      </span>
                    ) : null}
                  </div>
                </button>
              )
            })}
            <button
              type="button"
              className="type-card type-card-create"
              onClick={() => navigate('/manage')}
            >
              <span className="create-card-icon">
                <PlusOutlined />
              </span>
              <span className="create-card-title">新建记录类型</span>
              <span className="create-card-desc">定义字段，开始收集新的主题</span>
            </button>
          </div>
        )}
      </section>

      <section className="section-block recent-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">RECENTLY UPDATED</div>
            <h2>最近更新</h2>
            <p>刚写下的内容，回到现场只需要一步。</p>
          </div>
          {firstType ? (
            <Button type="text" onClick={() => navigate(`/type/${firstType.id}`)}>
              查看记录 <ArrowRightOutlined />
            </Button>
          ) : null}
        </div>

        {statsLoading ? (
          <div className="recent-card">
            <Skeleton active paragraph={{ rows: 4 }} />
          </div>
        ) : stats.recent.length ? (
          <div className="recent-card">
            {stats.recent.map((record) => (
              <div
                className="recent-row"
                key={record.id}
                role="button"
                tabIndex={0}
                onClick={() => setViewId(record.id)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setViewId(record.id)
                  }
                }}
              >
                <TypeIcon name={record.type_name} size="sm" />
                <span className="recent-main">
                  <span className="recent-title">{record.title}</span>
                  <span className="recent-meta">
                    {record.type_name} · {formatShortDate(record.updated_at)}
                  </span>
                </span>
                <span className="recent-tags">
                  {record.tags.slice(0, 2).map((tag) => (
                    <TagPill key={tag} name={tag} size="sm" onClick={openTag} />
                  ))}
                </span>
                <span className="recent-arrow">
                  <ArrowRightOutlined />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="recent-card">
            <EmptyState
              icon={<TagsOutlined />}
              title="还没有记录"
              description="从一个熟悉的主题开始，写下第一条内容。"
              action={
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => navigate(firstType ? `/type/${firstType.id}` : '/manage')}
                >
                  写第一条记录
                </Button>
              }
              compact
            />
          </div>
        )}
      </section>

      <RecordViewDrawer
        open={Boolean(viewId)}
        recordId={viewId}
        onClose={() => setViewId(null)}
      />
    </div>
  )
}
