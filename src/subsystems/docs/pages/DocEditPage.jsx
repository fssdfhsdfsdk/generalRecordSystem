import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Result,
  Select,
  Slider,
  Skeleton,
  Space,
} from 'antd'
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  HistoryOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { docApi } from '../api'
import { navigate } from '../../../router'
import { useAppData } from '../../../shell/AppDataContext'
import PageHeader from '../../../components/PageHeader'
import MarkdownEditor from '../../../components/MarkdownEditor'
import TagSelect from '../../../components/TagSelect'
import {
  DOC_PRIORITY_OPTIONS,
  DOC_STATUS_OPTIONS,
} from '../docsMeta'

const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss'

function toDayjs(value) {
  if (!value) return null
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed : null
}

function ProgressInput({ value = 0, onChange }) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0
  return (
    <div className="doc-progress-input">
      <Slider
        min={0}
        max={100}
        value={safe}
        onChange={(next) => onChange?.(next)}
        tooltip={{ formatter: (next) => `${next}%` }}
      />
      <InputNumber
        min={0}
        max={100}
        value={safe}
        onChange={(next) => onChange?.(next ?? 0)}
        addonAfter="%"
        className="doc-progress-number"
      />
    </div>
  )
}

export default function DocEditPage({ documentId, defaultTypeId }) {
  const { message } = AntApp.useApp()
  const { docTypes, docTypesLoading, reloadDocTypes } = useAppData()
  const [form] = Form.useForm()
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(Boolean(documentId))
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = Boolean(documentId)

  useEffect(() => {
    let alive = true
    if (!documentId) {
      setDoc(null)
      setLoading(false)
      setLoadError('')
      return () => {
        alive = false
      }
    }
    setLoading(true)
    setLoadError('')
    docApi
      .get(documentId)
      .then((data) => {
        if (alive) setDoc(data)
      })
      .catch((error) => {
        if (alive) setLoadError(error.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [documentId])

  useEffect(() => {
    if (loading || loadError) return
    const fallbackType = doc?.type_id || defaultTypeId || docTypes[0]?.id
    form.resetFields()
    form.setFieldsValue({
      title: doc?.title || '',
      type_id: fallbackType ? Number(fallbackType) : undefined,
      author: doc?.author || '',
      doc_time: doc?.doc_time || '',
      version: doc?.version || '',
      resource_url: doc?.resource_url || '',
      info_extra: doc?.info_extra || '',
      reading_status: doc?.reading_status || 'unread',
      reading_progress: doc?.reading_progress ?? 0,
      priority: doc?.priority ?? 3,
      tags: doc?.tags || [],
      reading_notes: doc?.reading_notes || '',
      reading_reflections: doc?.reading_reflections || '',
      histories: (doc?.histories || []).map((item) => ({
        ...item,
        start_at: toDayjs(item.start_at),
        end_at: toDayjs(item.end_at),
      })),
    })
  }, [doc, loading, loadError, defaultTypeId, docTypes, form])

  const handleStatusChange = (next) => {
    if (next === 'completed') form.setFieldValue('reading_progress', 100)
    if (next === 'unread') form.setFieldValue('reading_progress', 0)
  }

  const submit = async () => {
    const values = await form.validateFields()
    const payload = {
      type_id: values.type_id,
      title: values.title,
      author: values.author || '',
      doc_time: values.doc_time || '',
      version: values.version || '',
      resource_url: values.resource_url || '',
      info_extra: values.info_extra || '',
      reading_status: values.reading_status || 'unread',
      reading_progress: values.reading_progress ?? 0,
      priority: values.priority ?? 3,
      tags: values.tags || [],
      reading_notes: values.reading_notes || '',
      reading_reflections: values.reading_reflections || '',
      histories: (values.histories || []).map((item) => ({
        id: item.id,
        start_at: item.start_at ? item.start_at.format(DATE_FORMAT) : null,
        end_at: item.end_at ? item.end_at.format(DATE_FORMAT) : null,
        duration_hours:
          item.duration_hours === undefined || item.duration_hours === null
            ? null
            : item.duration_hours,
        description: item.description || '',
      })),
    }
    setSaving(true)
    try {
      const saved = editing
        ? await docApi.update(doc.id, payload)
        : await docApi.create(payload)
      message.success(editing ? '文档已更新' : '文档已创建')
      await reloadDocTypes()
      navigate(`/docs/${saved.id}`)
    } catch (error) {
      message.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    try {
      await docApi.remove(doc.id)
      message.success('文档已删除')
      await reloadDocTypes()
      navigate(`/docs/type/${doc.type_id}`)
    } catch (error) {
      message.error(error.message)
    }
  }

  const goBack = () => {
    if (doc) {
      navigate(`/docs/${doc.id}`)
      return
    }
    if (defaultTypeId) {
      navigate(`/docs/type/${defaultTypeId}`)
      return
    }
    navigate('/docs')
  }

  if (loading || docTypesLoading) {
    return (
      <div className="page doc-edit-page">
        <div className="doc-content-loading">
          <Skeleton active paragraph={{ rows: 3 }} />
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="page">
        <Result
          status="404"
          title="无法载入这篇文档"
          subTitle={loadError}
          extra={
            <Space>
              <Button onClick={() => navigate('/docs')}>回到文档总览</Button>
              <Button type="primary" onClick={() => window.location.reload()}>
                重新载入
              </Button>
            </Space>
          }
        />
      </div>
    )
  }

  if (!docTypes.length) {
    return (
      <div className="page">
        <Result
          status="warning"
          title="还没有可用的文档类型"
          subTitle="一篇文档必须先归入一个类型。请先创建文档类型。"
          extra={
            <Button type="primary" onClick={() => navigate('/docs/types')}>
              前往类型管理
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="page doc-edit-page">
      <PageHeader
        eyebrow={editing ? 'EDIT DOCUMENT' : 'NEW DOCUMENT'}
        title={editing ? '编辑文档' : '新建文档'}
        description={
          editing
            ? '修改会写入 docs.db；阅读历史可在这里一次保存。'
            : '先把文档归档到类型，再逐步补充阅读笔记、感想与历史。'
        }
        extra={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={goBack}>
              返回
            </Button>
            {editing ? (
              <Popconfirm
                title="删除这篇文档？"
                description="笔记、感想与阅读历史会一起删除，且不可恢复。"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={remove}
              >
                <Button danger type="text" icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            ) : null}
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={submit}
            >
              {editing ? '保存修改' : '创建文档'}
            </Button>
          </Space>
        }
      />

      <Form form={form} layout="vertical" requiredMark="optional">
        <Card className="doc-form-card" title="基本信息">
          <Form.Item
            name="title"
            label="文档名称"
            rules={[
              { required: true, message: '请输入文档名称' },
              { max: 255, message: '文档名称不能超过 255 个字符' },
            ]}
          >
            <Input
              size="large"
              maxLength={255}
              showCount
              placeholder="例如：深入理解计算机系统（第 3 版）"
              className="title-input"
            />
          </Form.Item>

          <div className="form-grid-3">
            <Form.Item
              name="type_id"
              label="文档类型"
              rules={[{ required: true, message: '请选择文档类型' }]}
            >
              <Select
                placeholder="选择类型"
                options={docTypes.map((type) => ({
                  value: type.id,
                  label: type.name,
                }))}
              />
            </Form.Item>
            <Form.Item name="reading_status" label="阅读状态">
              <Select
                options={DOC_STATUS_OPTIONS}
                onChange={handleStatusChange}
              />
            </Form.Item>
            <Form.Item name="priority" label="优先级">
              <Select options={DOC_PRIORITY_OPTIONS} />
            </Form.Item>
          </div>

          <Form.Item
            name="reading_progress"
            label="阅读进度"
            extra="拖动或输入 0–100；状态改为「完成」会填充 100%，改为「未阅读」会归零。"
          >
            <ProgressInput />
          </Form.Item>

          <div className="doc-info-form-section">
            <div className="doc-info-form-heading">
              <span>文档信息</span>
              <span className="muted-text">
                分别保存，可分别筛选；列表合并为一个「文档信息」列
              </span>
            </div>
            <div className="form-grid-2">
              <Form.Item
                name="author"
                label="作者"
                rules={[{ max: 1000, message: '作者不能超过 1000 个字符' }]}
              >
                <Input maxLength={1000} placeholder="例如：Randal E. Bryant" />
              </Form.Item>
              <Form.Item
                name="doc_time"
                label="时间"
                rules={[{ max: 1000, message: '时间不能超过 1000 个字符' }]}
              >
                <Input
                  maxLength={1000}
                  placeholder="例如：2016-08 / 2026-10-30 / 第三季度"
                />
              </Form.Item>
            </div>
            <div className="form-grid-2">
              <Form.Item
                name="version"
                label="版本"
                rules={[{ max: 1000, message: '版本不能超过 1000 个字符' }]}
              >
                <Input maxLength={1000} placeholder="例如：第 3 版 / v0.9" />
              </Form.Item>
              <Form.Item
                name="resource_url"
                label="资源地址"
                rules={[{ max: 1000, message: '资源地址不能超过 1000 个字符' }]}
              >
                <Input
                  maxLength={1000}
                  placeholder="例如：https://example.com/resource"
                />
              </Form.Item>
            </div>
            <Form.Item
              name="info_extra"
              label="其它信息"
              rules={[{ max: 1000, message: '其它信息不能超过 1000 个字符' }]}
            >
              <Input
                maxLength={1000}
                placeholder="例如：课程配套材料 / 收藏于某处 / 备注"
              />
            </Form.Item>
          </div>

          <Form.Item name="tags" label="文档标签">
            <TagSelect placeholder="输入标签，按回车确认（文档独立词库）" />
          </Form.Item>
        </Card>

        <Card className="doc-form-card" title="阅读笔记">
          <Form.Item name="reading_notes" className="doc-editor-item">
            <MarkdownEditor
              minRows={8}
              placeholder="记录摘录、关键概念、线索与待查问题，支持 Markdown 与表格。"
            />
          </Form.Item>
        </Card>

        <Card className="doc-form-card" title="阅读感想">
          <Form.Item name="reading_reflections" className="doc-editor-item">
            <MarkdownEditor
              minRows={7}
              placeholder="读完之后，它改变了什么？写下判断、联想或行动。"
            />
          </Form.Item>
        </Card>

        <Card
          className="doc-form-card doc-history-form-card"
          title={
            <span>
              <HistoryOutlined /> 阅读历史
            </span>
          }
          extra={
            <span className="muted-text">开始/结束/耗时/描述均为可选，默认折叠展示</span>
          }
        >
          <Alert
            type="info"
            showIcon
            className="doc-history-alert"
            message="一次阅读可以只填描述，也可以只记耗时；结束时间不能早于开始时间。"
          />
          <Form.List name="histories">
            {(fields, { add, remove: removeHistory }) => (
              <div className="doc-history-editor-list">
                {fields.map((field, index) => (
                  <div className="doc-history-editor-row" key={field.key}>
                    <div className="doc-history-editor-head">
                      <span>第 {String(index + 1).padStart(2, '0')} 次阅读</span>
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => removeHistory(field.name)}
                      >
                        移除
                      </Button>
                    </div>
                    <div className="doc-history-editor-grid">
                      <Form.Item name={[field.name, 'start_at']} label="开始时间">
                        <DatePicker
                          showTime
                          format="YYYY-MM-DD HH:mm"
                          className="full-width"
                          placeholder="可选"
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'end_at']}
                        label="结束时间"
                        dependencies={[['histories', field.name, 'start_at']]}
                        rules={[
                          {
                            validator: (_, value) => {
                              const start = form.getFieldValue([
                                'histories',
                                field.name,
                                'start_at',
                              ])
                              if (start && value && value.isBefore(start)) {
                                return Promise.reject(
                                  new Error('结束时间不能早于开始时间'),
                                )
                              }
                              return Promise.resolve()
                            },
                          },
                        ]}
                      >
                        <DatePicker
                          showTime
                          format="YYYY-MM-DD HH:mm"
                          className="full-width"
                          placeholder="可选"
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'duration_hours']}
                        label="耗时"
                      >
                        <InputNumber
                          min={0}
                          max={100000}
                          step={0.25}
                          precision={2}
                          className="full-width"
                          addonAfter="小时"
                          placeholder="可选"
                        />
                      </Form.Item>
                    </div>
                    <Form.Item
                      name={[field.name, 'description']}
                      label="描述"
                      rules={[{ max: 2000, message: '描述不能超过 2000 个字符' }]}
                    >
                      <Input.TextArea
                        autoSize={{ minRows: 2, maxRows: 4 }}
                        maxLength={2000}
                        showCount
                        placeholder="这次读了什么、读到哪、有什么问题（可选）"
                      />
                    </Form.Item>
                  </div>
                ))}
                <Button
                  block
                  icon={<PlusOutlined />}
                  onClick={() =>
                    add({
                      start_at: null,
                      end_at: null,
                      duration_hours: null,
                      description: '',
                    })
                  }
                >
                  添加一次阅读
                </Button>
              </div>
            )}
          </Form.List>
        </Card>
      </Form>
    </div>
  )
}
