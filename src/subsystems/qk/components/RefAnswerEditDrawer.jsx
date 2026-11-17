import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Drawer,
  Form,
  Input,
  Space,
} from 'antd'
import MarkdownEditor from '../../../components/MarkdownEditor'

const EMPTY = { title: '', content: '', idea: '' }

export default function RefAnswerEditDrawer({ open, value, onClose, onSave }) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue(value || EMPTY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value])

  const submit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      onSave?.({
        ...value,
        title: values.title || '',
        content: values.content || '',
        idea: values.idea || '',
      })
      onClose?.()
    } catch (error) {
      if (!error?.errorFields) message.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={680}
      destroyOnClose
      title={
        <div className="drawer-heading">
          <span className="drawer-heading-kicker">参考答案</span>
          <span className="drawer-heading-title">编辑参考答案</span>
        </div>
      }
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={submit}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" initialValues={EMPTY}>
        <Form.Item
          name="title"
          label="参考答案标题"
          rules={[{ required: true, message: '请输入参考答案标题' }]}
        >
          <Input maxLength={255} placeholder="例如：标准答案" />
        </Form.Item>
        <Form.Item name="content" label="参考答案">
          <MarkdownEditor minRows={6} placeholder="标准解法或参考思路。" />
        </Form.Item>
        <Form.Item name="idea" label="我的想法">
          <MarkdownEditor minRows={4} placeholder="对照参考答案后的想法与复盘。" />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
