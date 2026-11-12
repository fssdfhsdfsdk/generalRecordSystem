import React, { useEffect, useState } from 'react'
import { App as AntApp, Button, Drawer, Space } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { docApi } from '../api'
import NoteQuickList from './NoteQuickList'
import NoteEditDrawer from './NoteEditDrawer'
import NoteViewDrawer from './NoteViewDrawer'

export default function DocNotesDrawer({
  open,
  documentId,
  documentTitle,
  onClose,
}) {
  const { message } = AntApp.useApp()
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [viewNoteId, setViewNoteId] = useState(null)

  useEffect(() => {
    if (!open || !documentId) return undefined
    let alive = true
    setLoading(true)
    docApi
      .listNotes({ doc_id: documentId, limit: 500, sort: 'updated_desc' })
      .then((data) => {
        if (alive) setNotes(data.notes)
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
  }, [open, documentId, reloadToken, message])

  const refresh = () => setReloadToken((token) => token + 1)

  const openCreate = () => {
    setEditingNoteId(null)
    setEditOpen(true)
  }

  const openEdit = (note) => {
    setEditingNoteId(note.id)
    setEditOpen(true)
  }

  const removeNote = async (note) => {
    try {
      await docApi.removeNote(note.id)
      message.success('笔记已删除')
      refresh()
    } catch (error) {
      message.error(error.message)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={860}
      className="doc-notes-drawer"
      rootClassName="doc-notes-drawer-root"
      title={
        <div className="drawer-heading">
          <span className="drawer-heading-kicker">READING NOTES LIST</span>
          <span className="drawer-heading-title">
            {documentTitle || '当前文档'} · 阅读笔记列表
          </span>
        </div>
      }
      extra={
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建笔记
          </Button>
        </Space>
      }
    >
      <div className="doc-notes-drawer-body">
        <p className="muted-text doc-notes-drawer-hint">
          这里展示当前书籍 / 文档的全部笔记。展开列表项可预览前 200 字，
          完整内容进入笔记查看。
        </p>
        <NoteQuickList
          notes={notes}
          loading={loading}
          emptyTitle="这本书还没有笔记"
          emptyDescription="把原文片段、注释、想法或疑问记成独立笔记，之后可以按标签和类型重新找到它们。"
          onView={(note) => setViewNoteId(note.id)}
          onEdit={openEdit}
          onDelete={removeNote}
          onAdd={openCreate}
        />
      </div>

      <NoteEditDrawer
        open={editOpen}
        noteId={editingNoteId}
        defaultDocId={documentId}
        onClose={() => setEditOpen(false)}
        onSaved={() => refresh()}
      />

      <NoteViewDrawer
        open={Boolean(viewNoteId)}
        noteId={viewNoteId}
        onClose={() => setViewNoteId(null)}
        onEdit={(note) => openEdit(note)}
        onDeleted={() => refresh()}
      />
    </Drawer>
  )
}
