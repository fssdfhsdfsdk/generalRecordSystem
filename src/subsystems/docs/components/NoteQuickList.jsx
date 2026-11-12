import React, { useMemo, useState } from 'react'
import { Button, Popconfirm, Space, Spin, Tooltip } from 'antd'
import {
  BookOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { formatShortDate } from '../../../utils'
import EmptyState from '../../../components/EmptyState'
import TagPill from '../../../components/TagPill'

function previewText(text, fallback) {
  const value = String(text || '').trim()
  return value || fallback
}

export default function NoteQuickList({
  notes = [],
  loading = false,
  emptyTitle = '还没有笔记',
  emptyDescription = '在书籍或文档里记录原文片段、注释、想法与疑问。',
  emptyAction = null,
  onView,
  onEdit,
  onDelete,
  onTagClick,
  onAdd,
  onDocClick,
}) {
  const [expanded, setExpanded] = useState(() => new Set())
  const ids = useMemo(() => new Set(notes.map((note) => note.id)), [notes])
  const visibleExpanded = useMemo(
    () => new Set([...expanded].filter((id) => ids.has(id))),
    [expanded, ids],
  )

  const toggle = (noteId) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
  }

  if (loading) {
    return (
      <div className="note-quick-loading">
        <Spin />
      </div>
    )
  }

  if (!notes.length) {
    return (
      <EmptyState
        icon={<FileTextOutlined />}
        title={emptyTitle}
        description={emptyDescription}
        action={
          emptyAction || (onAdd ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
              新建第一条笔记
            </Button>
          ) : null)
        }
      />
    )
  }

  return (
    <div className="note-quick-list">
      {notes.map((note) => {
        const isOpen = visibleExpanded.has(note.id)
        const location = [note.chapter, note.section].filter(Boolean).join(' · ')
        return (
          <article
            className={`note-quick-item ${isOpen ? 'is-open' : ''}`}
            key={note.id}
          >
            <div className="note-quick-head">
              <button
                type="button"
                className="note-quick-toggle"
                aria-expanded={isOpen}
                aria-label={isOpen ? '收起笔记预览' : '展开笔记预览'}
                onClick={() => toggle(note.id)}
              >
                <DownOutlined
                  className={`note-quick-arrow ${isOpen ? 'is-open' : ''}`}
                />
              </button>
              <div className="note-quick-title-wrap">
                <button
                  type="button"
                  className="note-quick-title"
                  onClick={() => onView?.(note)}
                >
                  {note.title}
                </button>
                <div className="note-quick-meta">
                  {onDocClick ? (
                    <button
                      type="button"
                      className="note-quick-book is-clickable"
                      title="查看书籍详情"
                      aria-label={`查看书籍 ${note.doc_title}`}
                      onClick={() => onDocClick(note)}
                    >
                      <BookOutlined /> {note.doc_title}
                      {location ? (
                        <span className="note-quick-location"> / {location}</span>
                      ) : null}
                    </button>
                  ) : (
                    <span className="note-quick-book">
                      <BookOutlined /> {note.doc_title}
                      {location ? (
                        <span className="note-quick-location"> / {location}</span>
                      ) : null}
                    </span>
                  )}
                  <span className="note-quick-type">{note.type_name}</span>
                  <span className="note-quick-time">
                    {formatShortDate(note.note_time || note.created_at)}
                  </span>
                </div>
              </div>
              <Space size={2} className="note-quick-actions">
                <Tooltip title="查看完整笔记">
                  <Button
                    type="text"
                    size="small"
                    icon={<EyeOutlined />}
                    aria-label={`查看笔记 ${note.title}`}
                    onClick={() => onView?.(note)}
                  />
                </Tooltip>
                <Tooltip title="编辑">
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    aria-label={`编辑笔记 ${note.title}`}
                    onClick={() => onEdit?.(note)}
                  />
                </Tooltip>
                <Popconfirm
                  title="删除这条笔记？"
                  description="原文片段、笔记内容与标签关联会一起删除，且不可恢复。"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => onDelete?.(note)}
                >
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`删除笔记 ${note.title}`}
                  />
                </Popconfirm>
              </Space>
            </div>

            {note.tags?.length ? (
              <div className="note-quick-tags">
                <TagsOutlined />
                {note.tags.map((tag) => (
                  <TagPill
                    key={tag}
                    name={tag}
                    size="sm"
                    onClick={onTagClick ? () => onTagClick(tag) : undefined}
                  />
                ))}
              </div>
            ) : null}

            {isOpen ? (
              <div className="note-quick-preview">
                <section className="note-preview-block">
                  <div className="note-preview-head">
                    <span className="eyebrow">EXCERPT</span>
                    <span>原文片段</span>
                    {note.excerpt_truncated ? (
                      <span className="note-preview-hint">仅显示前 200 字</span>
                    ) : null}
                  </div>
                  <p className="note-preview-text">
                    {previewText(note.excerpt_preview, '这条笔记还没有填写原文片段。')}
                    {note.excerpt_truncated ? <span className="note-preview-more"> …</span> : null}
                  </p>
                </section>
                <section className="note-preview-block">
                  <div className="note-preview-head">
                    <span className="eyebrow">NOTE</span>
                    <span>笔记内容</span>
                    {note.content_truncated ? (
                      <span className="note-preview-hint">仅显示前 200 字</span>
                    ) : null}
                  </div>
                  <p className="note-preview-text">
                    {previewText(note.content_preview, '这条笔记还没有填写笔记内容。')}
                    {note.content_truncated ? <span className="note-preview-more"> …</span> : null}
                  </p>
                </section>
                <div className="note-preview-foot">
                  <Button
                    size="small"
                    type="link"
                    icon={<EyeOutlined />}
                    onClick={() => onView?.(note)}
                  >
                    查看完整笔记
                  </Button>
                </div>
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
