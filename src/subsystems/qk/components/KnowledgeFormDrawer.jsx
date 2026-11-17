import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Spin,
} from 'antd'
import { qkApi } from '../api'
import { DIFFICULTY_OPTIONS } from '../qkMeta'
import FuzzyTagSelect from '../../../components/FuzzyTagSelect'
import MarkdownEditor from '../../../components/MarkdownEditor'

const EMPTY = {
  title: '',
  summary: '',
  content: '',
  understanding: '',
  references: '',
  difficulty: 3,
  node_type_id: undefined,
  domain_type_id: undefined,
  tags: [],
}

const typeOptions = (list = []) =>
  list.map((item) => ({ value: item.id, label: item.name }))

export default function KnowledgeFormDrawer({ open, knowledge, onClose, onSaved }) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tagOptions, setTagOptions] = useState([])
  const [nodeTypes, setNodeTypes] = useState([])
  const [domainTypes, setDomainTypes] = useState([])

  useEffect(() => {
    if (!open) return undefined
    let alive = true
    setLoading(true)
    Promise.all([
      qkApi.listTags({ sort: 'name' }),
      qkApi.listTypes('knowledge_node'),
      qkApi.listTypes('knowledge_domain'),
    ])
      .then(([tagsData, nodeData, domainData]) => {
        if (!alive) return
        setTagOptions(tagsData.tags.map((tag) => tag.name))
        setNodeTypes(nodeData.types)
        setDomainTypes(domainData.types)
        if (knowledge?.id) {
          return qkApi.getKnowledge(knowledge.id).then((detail) => {
            if (!alive) return
            form.setFieldsValue({
              title: detail.title,
              summary: detail.summary,
              content: detail.content,
              understanding: detail.understanding,
              references: detail.references,
              difficulty: detail.difficulty,
              node_type_id: detail.node_type_id || undefined,
              domain_type_id: detail.domain_type_id || undefined,
              tags: detail.tags,
            })
          })
        }
        form.resetFields()
        form.setFieldsValue(EMPTY)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, knowledge?.id])

  const submit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const payload = {
        title: values.title,
        summary: values.summary || '',
        content: values.content || '',
        understanding: values.understanding || '',
        references: values.references || '',
        difficulty: Number(values.difficulty || 3),
        node_type_id: values.node_type_id || null,
        domain_type_id: values.domain_type_id || null,
        tags: values.tags || [],
      }
      if (knowledge?.id) {
        await qkApi.updateKnowledge(knowledge.id, payload)
        message.success('知识已更新')
      } else {
        await qkApi.createKnowledge(payload)
        message.success('知识已创建')
      }
      onSaved?.()
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
      width={780}
      destroyOnClose
      title={knowledge?.id ? '编辑知识' : '新建知识'}
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={submit}>
            保存
          </Button>
        </Space>
      }
    >
      {loading ? (
        <div className="drawer-loading">
          <Spin />
        </div>
      ) : (
        <Form form={form} layout="vertical" initialValues={EMPTY}>
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入知识标题' }]}
          >
            <Input maxLength={255} placeholder="例如：勾股定理" />
          </Form.Item>
          <Form.Item
            name="summary"
            label="一句话核心摘要"
            extra="用于悬浮预览与列表展示。"
          >
            <Input maxLength={500} placeholder="用一句话说清这条知识的核心" />
          </Form.Item>
          <div className="qk-form-two-col">
            <Form.Item name="node_type_id" label="知识节点类型">
              <Select allowClear options={typeOptions(nodeTypes)} placeholder="选择粒度" />
            </Form.Item>
            <Form.Item name="domain_type_id" label="知识领域类型">
              <Select allowClear options={typeOptions(domainTypes)} placeholder="选择领域" />
            </Form.Item>
          </div>
          <Form.Item name="difficulty" label="难度系数">
            <Select options={DIFFICULTY_OPTIONS} />
          </Form.Item>
          <Form.Item name="content" label="知识">
            <MarkdownEditor minRows={6} placeholder="知识的正式描述，支持 Markdown 与 LaTeX。" />
          </Form.Item>
          <Form.Item name="understanding" label="我的理解">
            <MarkdownEditor minRows={4} placeholder="用自己的话复述、补充例子与直觉。" />
          </Form.Item>
          <Form.Item name="references" label="参考来源">
            <MarkdownEditor minRows={3} placeholder="书籍、论文、链接或出处。" />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <FuzzyTagSelect
              options={tagOptions}
              maxOptions={10}
              placeholder="输入时最多提示 10 个已有标签，回车可新建"
            />
          </Form.Item>
        </Form>
      )}
    </Drawer>
  )
}
