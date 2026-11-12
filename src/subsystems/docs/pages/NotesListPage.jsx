import React, { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  Input,
  Select,
  Space,
  Tooltip,
} from 'antd'
import {
  BookOutlined,
  ClearOutlined,
  EditOutlined,
  FileTextOutlined,
  FilterOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { docApi } from '../api'
import { navigate } from '../../../router'
import PageHeader from '../../../components/PageHeader'
import NoteQuickList from '../components/NoteQuickList'
import NoteEditDrawer from '../components/NoteEditDrawer'
import NoteViewDrawer from '../components/NoteViewDrawer'

const SORT_OPTIONS = [
  { value: 'updated_desc', label: '最近更新' },
  { value: 'created_desc', label: '最近创建' },
  { value: 'time_desc', label: '记录时间（新→旧）' },
  { value: 'title_asc', label: '标题 A-Z' },
]

export default function NotesListPage({
  initialTags = [],
  tagMode = false,
  fuzzyTagMode = false,
  initialTagQ = '',
  initialDocId = '',
}) {
  const { message } = AntApp.useApp()
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [noteTypes, setNoteTypes] = useState([])
  const [documents, setDocuments] = useState([])
  const [tagOptions, setTagOptions] = useState([])
  const [q, setQ] = useState('')
  const [tagQ, setTagQ] = useState(initialTagQ)
  const [typeIds, setTypeIds] = useState([])
  const [docId, setDocId] = useState(initialDocId || undefined)
  const [tags, setTags] = useState(() => initialTags)
  const [sort, setSort] = useState('updated_desc')
  const [reloadToken, setReloadToken] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [viewNoteId, setViewNoteId] = useState(null)

  const initialTagKey = initialTags.join('\u0000')

  useEffect(() => {
    setTagQ(initialTagQ)
    setTags(initialTags)
    setDocId(initialDocId || undefined)
    // The route supplies the initial tag/document filter; local changes should
    // not be overwritten afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTagKey, initialTagQ, initialDocId])

  useEffect(() => {
    Promise.all([
      docApi.listNoteTypes(),
      docApi.list({ limit: 500, sort: 'title_asc' }),
      docApi.listNoteTags({ sort: 'count' }),
    ])
      .then(([typeData, docData, tagData]) => {
        setNoteTypes(typeData.types)
        setDocuments(docData.documents)
        setTagOptions(tagData.tags)
      })
      .catch((error) => message.error(error.message))
  }, [reloadToken, message])

  useEffect(() => {
    let alive = true
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await docApi.listNotes({
          q,
          tag_q: tagQ,
          type_id: typeIds.join(','),
          doc_id: docId,
          tags: tags.join(','),
          sort,
          limit: 500,
        })
        if (alive) setNotes(data.notes)
      } catch (error) {
        if (alive) {
          message.error(error.message)
          setNotes([])
        }
      } finally {
        if (alive) setLoading(false)
      }
    }, 220)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [q, tagQ, typeIds, docId, tags, sort, reloadToken, message])

  const filterCount = useMemo(
    () =>
      (q ? 1 : 0) +
      (tagQ ? 1 : 0) +
      (typeIds.length ? 1 : 0) +
      (docId ? 1 : 0) +
      (tags.length ? 1 : 0) +
      (sort !== 'updated_desc' ? 1 : 0),
    [q, tagQ, typeIds, docId, tags, sort],
  )

  const resetFilters = () => {
    setQ('')
    setTagQ('')
    setTypeIds([])
    setDocId(undefined)
    setTags([])
    setSort('updated_desc')
  }

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

  const filterByTag = (tag) => {
    navigate(`/docs/notes/tags/${encodeURIComponent(tag)}`)
  }

  const title = fuzzyTagMode ? (
    <span className="title-with-mode">
      笔记标签模糊搜索
      <span className="mode-badge">包含</span>
    </span>
  ) : tagMode ? (
    <span className="title-with-mode">
      笔记标签筛选
      <span className="mode-badge">AND</span>
    </span>
  ) : (
    '笔记列表'
  )

  return (
    <div className="page notes-list-page">
      <PageHeader
        eyebrow={
          fuzzyTagMode
            ? 'FUZZY NOTE TAG SEARCH'
            : tagMode
              ? 'NOTE TAGS'
              : 'BOOK NOTES'
        }
        title={title}
        description={
          fuzzyTagMode
            ? tagQ.trim()
              ? `搜索标签名同时包含“${tagQ.trim()}”的笔记（多个关键词 AND）。`
              : '按标签名模糊搜索笔记；多个关键词用空格分隔，结果需要同时命中。'
            : tagMode
              ? tags.length
                ? `筛选同时包含 ${tags.map((tag) => `#${tag}`).join(' ')} 的笔记（AND）。`
                : '选择标签后，只显示同时包含所选标签的笔记。'
              : '把书中的原文片段、注释、想法与疑问拆成一条条独立笔记，再按书籍、类型和标签重新找回它们。'
        }
        extra={
          <Space wrap>
            <Button
              icon={<TagsOutlined />}
              onClick={() => navigate('/docs/notes/tags')}
            >
              笔记标签
            </Button>
            <Button
              icon={<SettingOutlined />}
              onClick={() => navigate('/docs/notes/types')}
            >
              类型管理
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建笔记
            </Button>
          </Space>
        }
      >
        <div className="note-list-crumb-line">
          <span className="doc-type-kicker doc-text-violet">
            {tagMode || fuzzyTagMode ? 'TAG FILTER' : 'READING FRAGMENTS'}
          </span>
          <span className="muted-text">
            列表项可展开预览前 200 字，完整内容进入笔记查看
          </span>
        </div>
      </PageHeader>

      <div className="doc-filter-card note-filter-card">
        <div className="doc-filter-head">
          <div className="doc-filter-title">
            <FilterOutlined />
            <span>筛选</span>
            {filterCount ? (
              <span className="filter-count">{filterCount} 项</span>
            ) : null}
          </div>
          <Button
            type="text"
            size="small"
            icon={<ClearOutlined />}
            onClick={resetFilters}
            disabled={!filterCount}
          >
            重置
          </Button>
        </div>
        <div className="note-filter-grid">
          <Input
            allowClear
            value={q}
            onChange={(event) => setQ(event.target.value)}
            prefix={<SearchOutlined className="input-prefix" />}
            placeholder="搜索笔记标题"
          />
          <Input
            allowClear
            value={tagQ}
            onChange={(event) => setTagQ(event.target.value)}
            prefix={<SearchOutlined className="input-prefix" />}
            placeholder="标签模糊搜索（空格 AND）"
          />
          <Select
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            value={typeIds}
            onChange={setTypeIds}
            options={noteTypes.map((type) => ({
              value: type.id,
              label: `${type.name} (${type.note_count})`,
            }))}
            placeholder="笔记类型"
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            value={docId}
            onChange={setDocId}
            options={documents.map((doc) => ({
              value: doc.id,
              label: `${doc.title} · ${doc.type_name}`,
            }))}
            placeholder="全部书籍 / 文档"
          />
          <Select
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            value={tags}
            onChange={setTags}
            options={tagOptions.map((tag) => ({
              value: tag.name,
              label: `${tag.name} (${tag.count})`,
            }))}
            placeholder="标签（AND）"
          />
          <Select value={sort} onChange={setSort} options={SORT_OPTIONS} />
          <Tooltip title="刷新">
            <Button
              icon={<ReloadOutlined spin={loading} />}
              onClick={refresh}
            />
          </Tooltip>
        </div>
      </div>

      <div className="doc-list-summary">
        <span>
          共 <strong>{notes.length}</strong> 条笔记
        </span>
        <span className="muted-text">
          笔记标签与文档标签完全独立；删除文档会同时删除它的笔记。
        </span>
      </div>

      <NoteQuickList
        notes={notes}
        loading={loading}
        emptyTitle={
          filterCount
            ? fuzzyTagMode
              ? '没有笔记的标签同时包含这些关键词'
              : '没有匹配的笔记'
            : '还没有笔记'
        }
        emptyDescription={
          filterCount
            ? '试试减少筛选条件，或者清空搜索。'
            : '从一本书的某一段原文开始，记录注释、想法或疑问。'
        }
        onView={(note) => setViewNoteId(note.id)}
        onEdit={openEdit}
        onDelete={removeNote}
        onTagClick={filterByTag}
        onAdd={openCreate}
      />

      <NoteEditDrawer
        open={editOpen}
        noteId={editingNoteId}
        defaultDocId={docId}
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
    </div>
  )
}
