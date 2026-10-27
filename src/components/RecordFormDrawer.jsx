import React, { useEffect, useRef, useState } from 'react'
import { App as AntApp, Button, Drawer, Form, Input, Space } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { api } from '../api'
import MarkdownEditor from './MarkdownEditor'
import TagSelect from './TagSelect'

export default function RecordFormDrawer({
  open,
  typeId,
  typeName,
  fields,
  record,
  onClose,
  onSaved,
}) {
  const { message, modal } = AntApp.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const dirtyRef = useRef(false)
  const fieldKey = (fields || []).map((field) => field.id).join('-')

  useEffect(() => {
    if (!open) return
    const values = {
      title: record?.title || '',
      tags: record?.tags || [],
    }
    ;(fields || []).forEach((field) => {
      const existing = record?.fields?.find((item) => item.field_id === field.id)
      values[`field_${field.id}`] = existing?.value || ''
    })
    form.resetFields()
    form.setFieldsValue(values)
    dirtyRef.current = false
  }, [open, record?.id, fieldKey, form])

  const handleClose = () => {
    if (saving) return
    if (!dirtyRef.current) {
      onClose?.()
      return
    }
    modal.confirm({
      title: '放弃未保存的修改？',
      content: '关闭后，本次填写的内容不会被保留。',
      okText: '放弃修改',
      cancelText: '继续编辑',
      okButtonProps: { danger: true },
      onOk: () => onClose?.(),
    })
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const payload = {
        type_id: Number(typeId),
        title: values.title.trim(),
        tags: values.tags || [],
        fields: (fields || []).map((field) => ({
          field_id: field.id,
          value: values[`field_${field.id}`] || '',
        })),
      }
      const saved = record
        ? await api.updateRecord(record.id, payload)
        : await api.createRecord(payload)
      dirtyRef.current = false
      message.success(record ? '记录已更新' : '记录已创建')
      onSaved?.(saved)
      onClose?.()
    } catch (error) {
      if (error?.errorFields) return
      message.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      width={860}
      maskClosable={false}
      className="record-form-drawer"
      title={
        <div className="drawer-heading">
          <span className="drawer-heading-kicker">
            {record ? '编辑记录' : '新建记录'}
          </span>
          <span className="drawer-heading-title">{typeName}</span>
        </div>
      }
      footer={
        <div className="drawer-footer">
          <span className="muted-text">
            {record ? '修改会立即写入本地 SQLite' : '保存后会写入本地 SQLite'}
          </span>
          <Space>
            <Button onClick={handleClose} disabled={saving}>
              取消
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
            >
              保存记录
            </Button>
          </Space>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onValuesChange={() => {
          dirtyRef.current = true
        }}
      >
        <div className="form-card">
          <Form.Item
            name="title"
            label="标题"
            rules={[
              { required: true, message: '请填写标题' },
              { max: 255, message: '标题不能超过 255 个字符' },
            ]}
          >
            <Input
              size="large"
              maxLength={255}
              placeholder="用一句话说明这条记录"
              className="title-input"
            />
          </Form.Item>
          <Form.Item
            name="tags"
            label="标签"
            extra="空格、逗号或回车分隔；标签名中不能包含空格。"
          >
            <TagSelect />
          </Form.Item>
        </div>

        <div className="form-section-label">
          <span>内容</span>
          <span className="form-section-hint">除标题外均支持 Markdown 渲染</span>
        </div>

        <div className="form-card field-form-card">
          {(fields || []).map((field, index) => (
            <Form.Item
              key={field.id}
              name={`field_${field.id}`}
              className="field-form-item"
              label={
                <span className="field-form-label">
                  <span className="field-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {field.field_name}
                </span>
              }
            >
              <MarkdownEditor />
            </Form.Item>
          ))}
        </div>
      </Form>
    </Drawer>
  )
}
