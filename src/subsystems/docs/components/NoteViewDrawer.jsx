import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Descriptions,
  Drawer,
  Popconfirm,
  Skeleton,
  Space,
  Tooltip,
} from 'antd'
import {
  BookOutlined,
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { docApi } from '../api'
import EmptyState from '../../../components/EmptyState'
import Markdown from '../../../components/Markdown'
import TagPill from '../../../components/TagPill'
import DocViewDrawer from './DocViewDrawer'
import { formatDate } from '../../../utils'

export default function NoteViewDrawer({
  open,
  noteId,
  onClose,
  onEdit,
  onDeleted,
}) {
  const { message } = AntApp.useApp()
  const [note, setNote] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [docOpen, setDocOpen] = useState(false)

  useEffect(() => {
    if (!open) setDocOpen(false)
  }, [open, noteId])

  useEffect(() => {
    if (!open || !noteId) return undefined
    let alive = true
    setLoading(true)
    setError('')
    setNote(null)
    docApi
      .getNote(noteId)
      .then((data) => {
        if (alive) setNote(data)
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
  }, [open, noteId, reloadToken, message])

  const remove = async () => {
    try {
      await docApi.removeNote(note.id)
      message.success('笔记已删除')
      onClose()
      onDeleted?.()
    } catch (err) {
      message.error(err.message)
    }
  }

  const edit = () => {
    onClose()
    onEdit?.(note)
  }

  const location = note
    ? [note.chapter, note.section].filter(Boolean).join(' · ')
    : ''

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={820}
      className="note-view-drawer"
      rootClassName="note-view-drawer-root"
      title={
        <div className="drawer-heading">
          <span className="drawer-heading-kicker">BOOK NOTE</span>
          <span className="drawer-heading-title">
            {note?.title || '载入中'}
          </span>
        </div>
      }
      extra={
        note ? (
          <Space>
            <Button icon={<EditOutlined />} onClick={edit}>
              编辑
            </Button>
            <Popconfirm
              title="删除这条笔记？"
              description="原文片段、笔记内容与标签关联会一起删除，且不可恢复。"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={remove}
            >
              <Button danger type="text" icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
            <Tooltip title="刷新">
              <Button
                icon={<ReloadOutlined />}
                onClick={() => setReloadToken((token) => token + 1)}
              />
            </Tooltip>
          </Space>
        ) : null
      }
    >
      {loading ? (
        <div className="drawer-loading">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      ) : error || !note ? (
        <EmptyState
          icon={<LinkOutlined />}
          title="无法载入这条笔记"
          description="它可能已被删除，或后端服务暂时不可用。"
          action={
            <Button
              type="primary"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              重新载入
            </Button>
          }
        />
      ) : (
        <div className="note-view-body">
          <div className="note-view-meta">
            <button
              type="button"
              className="note-view-book is-clickable"
              title="查看书籍详情"
              aria-label={`查看书籍 ${note.doc_title}`}
              onClick={() => setDocOpen(true)}
            >
              <BookOutlined /> {note.doc_title}
              {location ? (
                <span className="note-view-location"> / {location}</span>
              ) : null}
            </button>
            <span className="note-view-type">{note.type_name}</span>
            {note.tags.map((tag) => (
              <TagPill key={tag} name={tag} size="sm" />
            ))}
          </div>

          <Descriptions column={{ xs: 1, sm: 2 }} size="small" colon={false}>
            <Descriptions.Item label="记录时间">
              {formatDate(note.note_time || note.created_at)}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {formatDate(note.updated_at)}
            </Descriptions.Item>
          </Descriptions>

          <section className="note-view-section">
            <div className="note-view-heading">
              <span className="eyebrow">EXCERPT</span>
              <h3>原文片段</h3>
              <span className="muted-text">{note.excerpt_length} 字符</span>
            </div>
            <Markdown
              value={note.excerpt}
              empty="这条笔记还没有填写原文片段。"
            />
          </section>

          <section className="note-view-section">
            <div className="note-view-heading">
              <span className="eyebrow">NOTE</span>
              <h3>笔记内容</h3>
              <span className="muted-text">{note.content_length} 字符</span>
            </div>
            <Markdown
              value={note.content}
              empty="这条笔记还没有填写笔记内容。"
            />
          </section>
        </div>
      )}

      {note ? (
        <DocViewDrawer
          open={docOpen}
          documentId={note.doc_id}
          onClose={() => setDocOpen(false)}
          onDeleted={() => {
            setDocOpen(false)
            onClose()
            onDeleted?.()
          }}
        />
      ) : null}
    </Drawer>
  )
}
