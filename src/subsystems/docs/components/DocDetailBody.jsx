import React, { useMemo, useState } from 'react'
import { Button, Collapse, Descriptions, Progress, Tooltip } from 'antd'
import {
  BookOutlined,
  ClockCircleOutlined,
  EditOutlined,
  FileTextOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReadOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { formatDate } from '../../../utils'
import EmptyState from '../../../components/EmptyState'
import Markdown from '../../../components/Markdown'
import TagPill from '../../../components/TagPill'
import DocTypeIcon from './DocTypeIcon'
import DocStatusTag from './DocStatusTag'
import DocPriorityTag from './DocPriorityTag'
import DocNotesDrawer from './DocNotesDrawer'
import { httpLink } from '../docInfo'
import {
  docStatusMeta,
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

export default function DocDetailBody({ doc, onTagClick, onEdit }) {
  const [notesOpen, setNotesOpen] = useState(false)
  const type = {
    id: doc.type_id,
    name: doc.type_name,
    slug: doc.type_slug,
  }
  const statusMeta = docStatusMeta(doc.reading_status)
  const infoEntries = [
    ['作者', doc.author],
    ['时间', doc.doc_time],
    ['版本', doc.version],
    ['资源地址', doc.resource_url],
    ['其它信息', doc.info_extra],
  ].filter(([, value]) => String(value || '').trim())

  const historyItems = useMemo(
    () => [
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
    ],
    [doc],
  )

  return (
    <div className="doc-detail-body">
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
          <section className="doc-paper-section doc-notes-entry">
            <div className="doc-paper-heading">
              <div>
                <div className="eyebrow">BOOK NOTES</div>
                <h2>
                  <FileTextOutlined /> 阅读笔记列表
                </h2>
              </div>
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setNotesOpen(true)}
              >
                打开笔记列表
              </Button>
            </div>
            <button
              type="button"
              className="doc-notes-entry-card"
              onClick={() => setNotesOpen(true)}
            >
              <span className="doc-notes-entry-count">
                <strong>{doc.note_count || 0}</strong>
                <span>条独立笔记</span>
              </span>
              <span className="doc-notes-entry-copy">
                把原文片段、注释、想法与疑问拆成一条条笔记，按标签和类型重新找回。
                点击打开抽屉式列表，展开可预览前 200 字。
              </span>
              <span className="doc-notes-entry-action">查看笔记 →</span>
            </button>
          </section>

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
                onClick={onEdit}
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
                    onClick={() => onTagClick?.(tag)}
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

      <DocNotesDrawer
        open={notesOpen}
        documentId={doc.id}
        documentTitle={doc.title}
        onClose={() => setNotesOpen(false)}
      />
    </div>
  )
}
