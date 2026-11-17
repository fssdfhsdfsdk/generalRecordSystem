import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Drawer,
  Form,
  Input,
  Space,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import MarkdownEditor from '../../../components/MarkdownEditor'

const EMPTY = { title: '', content: '', thoughts: [] }

export default function AnswerEditDrawer({ open, value, onClose, onSave }) {
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
        thoughts: (values.thoughts || []).map((item) => ({
          ...item,
          title: item.title || '',
          content: item.content || '',
        })),
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
          <span className="drawer-heading-kicker">我的答案</span>
          <span className="drawer-heading-title">编辑答案与思维链</span>
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
          label="答案标题"
          rules={[{ required: true, message: '请输入答案标题' }]}
        >
          <Input maxLength={255} placeholder="例如：面积法证明" />
        </Form.Item>
        <Form.Item name="content" label="我的答案">
          <MarkdownEditor minRows={5} placeholder="答案正文，支持 Markdown 与 LaTeX。" />
        </Form.Item>

        <Form.List name="thoughts">
          {(thoughts, { add, remove }) => (
            <div className="qk-dynamic-list">
              <div className="qk-dynamic-head">
                <span>思维链</span>
                <Button
                  type="dashed"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => add({ title: '', content: '' })}
                >
                  添加思考
                </Button>
              </div>
              {thoughts.map((thought) => (
                <div className="qk-dynamic-card" key={thought.key}>
                  <div className="qk-dynamic-card-head">
                    <span>思考 {thought.name + 1}</span>
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(thought.name)}
                    />
                  </div>
                  <Form.Item
                    name={[thought.name, 'title']}
                    label="思考标题"
                    rules={[{ required: true, message: '请输入思考标题' }]}
                  >
                    <Input maxLength={255} placeholder="例如：先作辅助线" />
                  </Form.Item>
                  <Form.Item name={[thought.name, 'content']} label="我的思考">
                    <MarkdownEditor minRows={3} placeholder="这一步是怎么想到的？" />
                  </Form.Item>
                </div>
              ))}
            </div>
          )}
        </Form.List>
      </Form>
    </Drawer>
  )
}
