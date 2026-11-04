import React, { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  Collapse,
  Descriptions,
  Popconfirm,
  Progress,
  Skeleton,
  Space,
  Tooltip,
} from 'antd'
import {
  ArrowLeftOutlined,
  BookOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  LinkOutlined,
  ReadOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { docApi } from '../api'
import { navigate } from '../../../router'
import { formatDate } from '../../../utils'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'
import Markdown from '../../../components/Markdown'
import TagPill from '../../../components/TagPill'
import DocTypeIcon from '../components/DocTypeIcon'
import DocStatusTag from '../components/DocStatusTag'
import DocPriorityTag from '../components/DocPriorityTag'
import { httpLink } from '../docInfo'
import {
  docStatusMeta,
  docTypeMeta,
  formatDocHours,
  formatHistoryRange,
} from '../docsMeta'

function HistoryList({ histories }) {
  if (!histories.length) {
    return (
      <EmptyState
        icon={<HistoryOutlined />}
        title="还没有阅读历史"
        description="在编辑页添加一次阅读的开始、结束、耗时与描述。"
        compact
      />
    )
  }
  return (
    <div className="doc-history-list">
      {histories.map((item) => (
        <div className="doc-history-row" key={item.id}>
          <div className="doc-history-time">
            <ClockCircleOutlined />
            <span>{formatHistoryRange(item.start_at, item.end_at)}</span>
          </div>
          <div className="doc-history-main">
            <div className="doc-history-head">
              <strong>{formatDocHours(item.duration_hours)}</strong>
              <span className="muted-text">记录于 {formatDate(item.created_at)}</span>
            </div>
            {item.description ? <p>{item.description}</p> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function DocContentPage({ documentId }) {
  const { message } = AntApp.useApp()
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    docApi
      .get(documentId)
      .then((data) => {
        if (alive) setDoc(data)
      })
      .catch((err) => {
        if (alive) {
          setError(err.message)
          message.error(err.message)
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [documentId, message])

  const type = doc
    ? {
        id: doc.type_id,
        name: doc.type_name,
        slug: doc.type_slug,
      }
    : null
  const typeMeta = doc ? docTypeMeta(type) : null
  const statusMeta = doc ? docStatusMeta(doc.reading_status) : null
  const infoEntries = doc
    ? [
        ['作者', doc.author],
        ['时间', doc.doc_time],
        ['版本', doc.version],
        ['资源地址', doc.resource_url],
        ['其它信息', doc.info_extra],
      ].filter(([, value]) => String(value || '').trim())
    : []

  const historyItems = useMemo(() => {
    if (!doc) return []
    return [
      {
        key: 'history',
        label: (
          <span className="doc-history-collapse-label">
            <HistoryOutlined />
            <span>阅读历史</span>
            <span className="doc-history-count">
              {doc.history_count} 条 · {formatDocHours(doc.total_hours)}
            </span>
          </span>
        ),
        children: <HistoryList histories={doc.histories} />,
      },
    ]
  }, [doc])

  const filterByTag = (tag) => {
    navigate(`/docs/tags/${encodeURIComponent(tag)}`)
  }

  const remove = async () => {
    try {
      await docApi.remove(doc.id)
      message.success('文档已删除')
      navigate(`/docs/type/${doc.type_id}`)
    } catch (err) {
      message.error(err.message)
    }
  }

  if (loading) {
    return (
      <div className="page doc-content-page">
        <div className="doc-content-loading">
          <Skeleton active paragraph={{ rows: 3 }} />
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    )
  }

  if (error || !doc) {
    return (
      <div className="page">
        <EmptyState
          icon={<LinkOutlined />}
          title="无法载入这篇文档"
          description="它可能已被删除，或后端服务暂时不可用。"
          action={
            <Space>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/docs')}
              >
                回到文档总览
              </Button>
              <Button type="primary" onClick={() => window.location.reload()}>
                重新载入
              </Button>
            </Space>
          }
        />
      </div>
    )
  }

  return (
    <div className="page doc-content-page">
      <PageHeader
        eyebrow={typeMeta.kicker}
        title={doc.title}
        description={
          doc.document_info
            ? doc.document_info
            : '这篇文档还没有填写作者、时间、版本或资源地址。'
        }
        extra={
          <Space wrap>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/docs/type/${doc.type_id}`)}
            >
              返回{type.name}
            </Button>
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => navigate(`/docs/${doc.id}/edit`)}
            >
              编辑文档
            </Button>
            <Popconfirm
              title="删除这篇文档？"
              description="阅读笔记、感想与历史会一起删除，且不可恢复。"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={remove}
            >
              <Button danger type="text" icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        <div className="doc-content-title-meta">
          <span className="doc-type-inline">
            <DocTypeIcon type={type} size="sm" />
            {type.name}
          </span>
          <DocStatusTag status={doc.reading_status} />
          <DocPriorityTag priority={doc.priority} />
          <span className="muted-text">
            <HistoryOutlined /> {doc.history_count} 条阅读历史
          </span>
        </div>
        {doc.tags.length ? (
          <div className="doc-content-tags">
            {doc.tags.map((tag) => (
              <TagPill key={tag} name={tag} onClick={filterByTag} />
            ))}
          </div>
        ) : (
          <div className="muted-text doc-content-no-tags">未添加标签</div>
        )}
      </PageHeader>

      <section className="doc-reading-strip">
        <div className="doc-reading-progress-card">
          <div className="doc-reading-strip-head">
            <span>阅读进度</span>
            <strong>{doc.reading_progress}%</strong>
          </div>
          <Progress
            percent={doc.reading_progress}
            showInfo={false}
            strokeColor="#f59e0b"
            trailColor="#f1f5f9"
          />
          <div className="doc-reading-strip-foot">
            <span className={`doc-status-note doc-text-${statusMeta.tone}`}>
              {statusMeta.label}
            </span>
            <span>{statusMeta.description}</span>
          </div>
        </div>
        <div className="doc-reading-stat">
          <span>累计阅读</span>
          <strong>{formatDocHours(doc.total_hours)}</strong>
          <small>{doc.history_count} 次记录</small>
        </div>
        <div className="doc-reading-stat">
          <span>优先级</span>
          <strong>P{doc.priority}</strong>
          <small>数字越大越优先</small>
        </div>
        <div className="doc-reading-stat">
          <span>最后更新</span>
          <strong className="doc-reading-date">{formatDate(doc.updated_at)}</strong>
          <small>创建于 {formatDate(doc.created_at)}</small>
        </div>
      </section>

      <div className="doc-content-layout">
        <main className="doc-content-main">
          <section className="doc-paper-section">
            <div className="doc-paper-heading">
              <div>
                <div className="eyebrow">READING NOTES</div>
                <h2>
                  <BookOutlined /> 阅读笔记
                </h2>
              </div>
            </div>
            <Markdown
              value={doc.reading_notes}
              empty="还没有阅读笔记。编辑文档，把摘录、线索和问题记下来。"
            />
          </section>

          <section className="doc-paper-section">
            <div className="doc-paper-heading">
              <div>
                <div className="eyebrow">REFLECTIONS</div>
                <h2>
                  <ReadOutlined /> 阅读感想
                </h2>
              </div>
            </div>
            <Markdown
              value={doc.reading_reflections}
              empty="还没有阅读感想。读完之后，写下它改变了什么。"
            />
          </section>

          <section className="doc-paper-section doc-history-section">
            <div className="doc-paper-heading">
              <div>
                <div className="eyebrow">READING LOG</div>
                <h2>
                  <HistoryOutlined /> 阅读历史
                </h2>
              </div>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => navigate(`/docs/${doc.id}/edit`)}
              >
                管理历史
              </Button>
            </div>
            <Collapse
              ghost
              defaultActiveKey={[]}
              className="doc-history-collapse"
              items={historyItems}
            />
          </section>
        </main>

        <aside className="doc-content-aside">
          <section className="doc-side-card doc-info-card">
            <div className="doc-side-card-head">
              <span>文档信息</span>
              <Tooltip title="作者、时间、版本、资源地址分别保存并可筛选；列表合并为一列">
                <span className="doc-side-hint">独立字段</span>
              </Tooltip>
            </div>
            {infoEntries.length ? (
              <dl className="doc-info-list">
                {infoEntries.map(([label, value]) => {
                  const href = label === '资源地址' ? httpLink(value) : ''
                  return (
                    <div className="doc-info-row" key={label}>
                      <dt>{label}</dt>
                      <dd>
                        {href ? (
                          <Tooltip title={value}>
                            <a
                              className="doc-info-link"
                              href={href}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              资源地址
                            </a>
                          </Tooltip>
                        ) : (
                          value
                        )}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            ) : (
              <p className="muted-text">未填写。可在编辑页补充作者、时间、版本或资源地址。</p>
            )}
          </section>

          <section className="doc-side-card">
            <div className="doc-side-card-head">
              <span>基本信息</span>
            </div>
            <Descriptions column={1} size="small" colon={false}>
              <Descriptions.Item label="文档类型">
                <span className="doc-type-inline">
                  <DocTypeIcon type={type} size="sm" />
                  {type.name}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="阅读状态">
                <DocStatusTag status={doc.reading_status} size="small" />
              </Descriptions.Item>
              <Descriptions.Item label="阅读进度">
                {doc.reading_progress}%
              </Descriptions.Item>
              <Descriptions.Item label="优先级">
                <DocPriorityTag priority={doc.priority} />
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {formatDate(doc.created_at)}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {formatDate(doc.updated_at)}
              </Descriptions.Item>
            </Descriptions>
          </section>

          <section className="doc-side-card">
            <div className="doc-side-card-head">
              <span>
                <TagsOutlined /> 标签
              </span>
            </div>
            {doc.tags.length ? (
              <div className="doc-side-tags">
                {doc.tags.map((tag) => (
                  <TagPill
                    key={tag}
                    name={tag}
                    size="sm"
                    onClick={filterByTag}
                  />
                ))}
              </div>
            ) : (
              <p className="muted-text">未添加标签。</p>
            )}
          </section>

          <section className="doc-side-card doc-side-quote">
            <BookOutlined />
            <p>读过的内容会留下痕迹，笔记与感想是下一次打开的入口。</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
