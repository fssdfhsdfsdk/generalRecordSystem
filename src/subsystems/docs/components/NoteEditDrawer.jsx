import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App as AntApp,
  Button,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  Row,
  Select,
  Skeleton,
  Space,
} from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { docApi } from '../api'
import MarkdownEditor from '../../../components/MarkdownEditor'
import FuzzyTagSelect from '../../../components/FuzzyTagSelect'

const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss'

function toDayjs(value) {
  if (!value) return null
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed : null
}

export default function NoteEditDrawer({
  open,
  noteId = null,
  defaultDocId,
  onClose,
  onSaved,
}) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState(null)
  const [noteTypes, setNoteTypes] = useState([])
  const [documents, setDocuments] = useState([])
  const [tagOptions, setTagOptions] = useState([])
  const editing = Boolean(noteId)

  useEffect(() => {
    if (!open) return undefined
    let alive = true
    setLoading(Boolean(noteId))
    setNote(null)
    Promise.all([
      docApi.listNoteTypes(),
      docApi.list({ limit: 500, sort: 'title_asc' }),
      docApi.listNoteTags({ sort: 'name' }),
      noteId ? docApi.getNote(noteId) : Promise.resolve(null),
    ])
      .then(([typeData, docData, tagData, noteData]) => {
        if (!alive) return
        setNoteTypes(typeData.types)
        setDocuments(docData.documents)
        setTagOptions(tagData.tags)
        setNote(noteData)
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
  }, [open, noteId, message])

  const fallbackTypeId = useMemo(
    () => note?.type_id || noteTypes[0]?.id,
    [note, noteTypes],
  )

  useEffect(() => {
    if (!open || loading) return
    form.resetFields()
    form.setFieldsValue({
      doc_id: note?.doc_id ?? (defaultDocId ? Number(defaultDocId) : undefined),
      type_id: fallbackTypeId ? Number(fallbackTypeId) : undefined,
      title: note?.title || '',
      chapter: note?.chapter || '',
      section: note?.section || '',
      note_time: toDayjs(note?.note_time),
      excerpt: note?.excerpt || '',
      content: note?.content || '',
      tags: note?.tags || [],
    })
  }, [open, loading, note, fallbackTypeId, defaultDocId, form])

  const submit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const payload = {
        doc_id: values.doc_id,
        type_id: values.type_id,
        title: values.title,
        chapter: values.chapter || '',
        section: values.section || '',
        note_time: values.note_time ? values.note_time.format(DATE_FORMAT) : '',
        excerpt: values.excerpt || '',
        content: values.content || '',
        tags: values.tags || [],
      }
      const saved = editing
        ? await docApi.updateNote(noteId, payload)
        : await docApi.createNote(payload)
      message.success(editing ? '笔记已更新' : '笔记已创建')
      onSaved?.(saved)
      onClose?.()
    } catch (error) {
      if (!error?.errorFields) message.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const noTypes = !loading && !noteTypes.length

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={860}
      className="note-edit-drawer"
      rootClassName="note-edit-drawer-root"
      title={
        <div className="drawer-heading">
          <span className="drawer-heading-kicker">BOOK NOTE</span>
          <span className="drawer-heading-title">
            {editing ? note?.title || '编辑笔记' : '新建笔记'}
          </span>
        </div>
      }
      footer={
        <div className="note-drawer-footer">
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              disabled={noTypes}
              onClick={submit}
            >
              {editing ? '保存笔记' : '创建笔记'}
            </Button>
          </Space>
        </div>
      }
      destroyOnClose
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <>
          {noTypes ? (
            <Alert
              type="warning"
              showIcon
              className="note-form-alert"
              message="还没有笔记类型"
              description="先到「笔记管理 / 类型管理」创建至少一个类型，再回来记录笔记。"
            />
          ) : null}
          <Form form={form} layout="vertical" requiredMark="optional">
            <Form.Item
              name="title"
              label="标题"
              rules={[
                { required: true, message: '请输入笔记标题' },
                { max: 255, message: '标题不能超过 255 个字符' },
              ]}
            >
              <Input
                maxLength={255}
                showCount
                placeholder="例如：第一章对「注意力」的定义"
              />
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="doc_id"
                  label="所属书籍 / 文档"
                  rules={[{ required: true, message: '请选择所属书籍或文档' }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="搜索并选择书籍或文档"
                    options={documents.map((doc) => ({
                      value: doc.id,
                      label: `${doc.title} · ${doc.type_name}`,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="type_id"
                  label="笔记类型"
                  rules={[{ required: true, message: '请选择笔记类型' }]}
                >
                  <Select
                    placeholder="选择类型"
                    options={noteTypes.map((type) => ({
                      value: type.id,
                      label: type.name,
                    }))}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="chapter" label="章">
                  <Input maxLength={255} placeholder="例如：第三章" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="section" label="小节">
                  <Input maxLength={255} placeholder="例如：3.2 工作记忆" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="note_time" label="记录时间">
                  <DatePicker
                    showTime
                    allowClear
                    className="note-time-picker"
                    placeholder="可选，默认按创建时间"
                    format="YYYY-MM-DD HH:mm"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="excerpt" label="原文片段" className="doc-editor-item">
              <MarkdownEditor
                minRows={5}
                placeholder="粘贴书中的原文片段、关键句或段落，支持 Markdown。"
              />
            </Form.Item>

            <Form.Item name="content" label="笔记内容" className="doc-editor-item">
              <MarkdownEditor
                minRows={7}
                placeholder="写下注释、理解、联想或尚未解决的问题，支持 Markdown。"
              />
            </Form.Item>

            <Form.Item name="tags" label="笔记标签">
              <FuzzyTagSelect
                options={tagOptions}
                placeholder="输入或选择笔记标签，空格 / 逗号分隔"
              />
            </Form.Item>
          </Form>
        </>
      )}
    </Drawer>
  )
}
