import React, { useEffect, useState } from 'react'
import { App as AntApp, Form, Input, Modal } from 'antd'
import { docApi } from '../api'

export default function DocTypeFormModal({ open, type, onClose, onSaved }) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const editing = Boolean(type?.id)

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({
      name: type?.name || '',
      description: type?.description || '',
    })
  }, [open, type, form])

  const submit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const saved = editing
        ? await docApi.updateType(type.id, values)
        : await docApi.createType(values)
      message.success(editing ? '文档类型已更新' : '文档类型已创建')
      onSaved?.(saved)
      onClose?.()
    } catch (error) {
      if (!error?.errorFields) message.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={editing ? `编辑类型「${type.name}」` : '新建文档类型'}
      okText={editing ? '保存' : '创建'}
      cancelText="取消"
      confirmLoading={saving}
      onOk={submit}
      onCancel={onClose}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item
          name="name"
          label="类型名称"
          rules={[
            { required: true, message: '请输入类型名称' },
            { max: 100, message: '类型名称不能超过 100 个字符' },
          ]}
        >
          <Input maxLength={100} showCount placeholder="例如：行业报告" />
        </Form.Item>
        <Form.Item
          name="description"
          label="类型描述"
          rules={[{ max: 500, message: '描述不能超过 500 个字符' }]}
        >
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 6 }}
            maxLength={500}
            showCount
            placeholder="说明这一类文档包含什么，方便以后归类。"
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
