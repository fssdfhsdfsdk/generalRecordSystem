import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Skeleton,
  Space,
  Tooltip,
} from 'antd'
import {
  ArrowRightOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { docApi } from '../api'
import { navigate } from '../../../router'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'
import NoteTypeFormModal from '../components/NoteTypeFormModal'

export default function NoteTypesPage() {
  const { message, modal } = AntApp.useApp()
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingType, setEditingType] = useState(null)

  const loadTypes = async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const data = await docApi.listNoteTypes()
      setTypes(data.types)
    } catch (error) {
      message.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTypes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalNotes = useMemo(
    () => types.reduce((sum, type) => sum + type.note_count, 0),
    [types],
  )

  const openCreate = () => {
    setEditingType(null)
    setModalOpen(true)
  }

  const openEdit = (type) => {
    setEditingType(type)
    setModalOpen(true)
  }

  const handleDelete = (type) => {
    modal.confirm({
      title: `删除笔记类型「${type.name}」？`,
      content:
        type.note_count > 0
          ? `该类型下还有 ${type.note_count} 条笔记。为保证数据安全，类型管理会拒绝删除；请先把这些笔记移到其他类型或删除。`
          : '类型本身会被删除；已经存在的笔记标签不会受影响。',
      okText: type.note_count > 0 ? '我知道了' : '永久删除',
      cancelText: '取消',
      okButtonProps: type.note_count > 0 ? {} : { danger: true },
      onOk: async () => {
        if (type.note_count > 0) return
        try {
          await docApi.removeNoteType(type.id)
          message.success('笔记类型已删除')
          await loadTypes(false)
        } catch (error) {
          message.error(error.message)
        }
      },
    })
  }

  return (
    <div className="page doc-types-page note-types-page">
      <PageHeader
        eyebrow="NOTE TAXONOMY"
        title="笔记类型管理"
        description="默认提供摘录、注释、想法、疑问四类；可以改名、改描述或新增自己的分类。类型只决定笔记的组织方式，不影响原文片段与笔记内容。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建类型
          </Button>
        }
      />

      <div className="doc-manage-summary">
        <div>
          <span>笔记类型</span>
          <strong>{types.length}</strong>
        </div>
        <div>
          <span>归入笔记</span>
          <strong>{totalNotes}</strong>
        </div>
        <div className="doc-manage-copy">
          <SettingOutlined />
          笔记类型与文档类型相互独立；每条笔记仍拥有自己的书籍、章节、标签与 Markdown 内容。
        </div>
      </div>

      <Alert
        type="warning"
        showIcon
        className="doc-manage-alert"
        message="类型名称与描述可以随时修改"
        description="改名不会移动笔记。为了不误删内容，类型下还有笔记时系统会拒绝删除类型；请先移动或删除笔记。"
      />

      {loading ? (
        <div className="doc-type-manage-grid">
          {[0, 1, 2, 3].map((item) => (
            <Card className="doc-type-manage-card" key={item}>
              <Skeleton active paragraph={{ rows: 3 }} />
            </Card>
          ))}
        </div>
      ) : types.length ? (
        <div className="doc-type-manage-grid">
          {types.map((type) => (
            <Card className="doc-type-manage-card" key={type.id}>
              <div className="doc-type-manage-head">
                <div className="doc-type-manage-title">
                  <span className="note-type-mark">#</span>
                  <div>
                    <h3>{type.name}</h3>
                    <p>{type.note_count} 条笔记</p>
                  </div>
                </div>
                <Tooltip title="打开笔记列表">
                  <Button
                    type="text"
                    icon={<ArrowRightOutlined />}
                    onClick={() => navigate('/docs/notes')}
                  />
                </Tooltip>
              </div>

              <p className="doc-type-description">
                {type.description || '还没有填写类型描述。'}
              </p>

              <div className="doc-type-manage-actions">
                <Space wrap>
                  <Button
                    size="small"
                    icon={<ArrowRightOutlined />}
                    onClick={() => navigate('/docs/notes')}
                  >
                    打开笔记
                  </Button>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openEdit(type)}
                  >
                    编辑
                  </Button>
                </Space>
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(type)}
                >
                  删除
                </Button>
              </div>
            </Card>
          ))}
          <button
            type="button"
            className="doc-type-create-card"
            onClick={openCreate}
          >
            <PlusOutlined />
            <span>新建笔记类型</span>
            <small>为一类笔记建立组织入口</small>
          </button>
        </div>
      ) : (
        <EmptyState
          icon={<SettingOutlined />}
          title="还没有笔记类型"
          description="先建立一种类型，再开始记录书籍笔记。"
          action={
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建第一个类型
            </Button>
          }
        />
      )}

      <NoteTypeFormModal
        open={modalOpen}
        type={editingType}
        onClose={() => {
          setModalOpen(false)
          setEditingType(null)
        }}
        onSaved={() => loadTypes(false)}
      />
    </div>
  )
}
