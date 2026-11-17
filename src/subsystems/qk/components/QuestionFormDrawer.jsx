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
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { qkApi } from '../api'
import FuzzyTagSelect from '../../../components/FuzzyTagSelect'
import MarkdownEditor from '../../../components/MarkdownEditor'

const EMPTY = {
  title: '',
  content: '',
  node_type_id: undefined,
  domain_type_id: undefined,
  tags: [],
  answers: [],
  ref_answers: [],
}

const typeOptions = (list = []) =>
  list.map((item) => ({ value: item.id, label: item.name }))

export default function QuestionFormDrawer({ open, question, onClose, onSaved }) {
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
      qkApi.listTypes('question_node'),
      qkApi.listTypes('question_domain'),
    ])
      .then(([tagsData, nodeData, domainData]) => {
        if (!alive) return
        setTagOptions(tagsData.tags.map((tag) => tag.name))
        setNodeTypes(nodeData.types)
        setDomainTypes(domainData.types)
        if (question?.id) {
          return qkApi.getQuestion(question.id).then((detail) => {
            if (!alive) return
            form.setFieldsValue({
              title: detail.title,
              content: detail.content,
              node_type_id: detail.node_type_id || undefined,
              domain_type_id: detail.domain_type_id || undefined,
              tags: detail.tags,
              answers: detail.answers.map((item) => ({
                answer_id: item.answer_id,
                title: item.title,
                content: item.content,
                thoughts: item.thoughts.map((thought) => ({
                  think_id: thought.think_id,
                  title: thought.title,
                  content: thought.content,
                })),
              })),
              ref_answers: detail.ref_answers.map((item) => ({
                ref_answer_id: item.ref_answer_id,
                title: item.title,
                content: item.content,
                idea: item.idea,
              })),
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
  }, [open, question?.id])

  const submit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const payload = {
        title: values.title,
        content: values.content || '',
        node_type_id: values.node_type_id || null,
        domain_type_id: values.domain_type_id || null,
        tags: values.tags || [],
        answers: (values.answers || []).map((item) => ({
          ...(item.answer_id ? { answer_id: item.answer_id } : {}),
          title: item.title || '',
          content: item.content || '',
          thoughts: (item.thoughts || []).map((thought) => ({
            ...(thought.think_id ? { think_id: thought.think_id } : {}),
            title: thought.title || '',
            content: thought.content || '',
          })),
        })),
        ref_answers: (values.ref_answers || []).map((item) => ({
          ...(item.ref_answer_id ? { ref_answer_id: item.ref_answer_id } : {}),
          title: item.title || '',
          content: item.content || '',
          idea: item.idea || '',
        })),
      }
      if (question?.id) {
        await qkApi.updateQuestion(question.id, payload)
        message.success('习题已更新')
      } else {
        await qkApi.createQuestion(payload)
        message.success('习题已创建')
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
      title={question?.id ? '编辑习题' : '新建习题'}
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
            label="习题标题"
            rules={[{ required: true, message: '请输入习题标题' }]}
          >
            <Input maxLength={255} placeholder="例如：如何证明勾股定理？" />
          </Form.Item>
          <Form.Item name="content" label="问题">
            <MarkdownEditor minRows={5} placeholder="题目内容，支持 Markdown 与 LaTeX。" />
          </Form.Item>
          <div className="qk-form-two-col">
            <Form.Item name="node_type_id" label="习题节点类型">
              <Select
                allowClear
                options={typeOptions(nodeTypes)}
                placeholder="选择解题形式"
              />
            </Form.Item>
            <Form.Item name="domain_type_id" label="习题领域类型">
              <Select
                allowClear
                options={typeOptions(domainTypes)}
                placeholder="选择所属领域"
              />
            </Form.Item>
          </div>
          <Form.Item name="tags" label="标签">
            <FuzzyTagSelect
              options={tagOptions}
              maxOptions={10}
              placeholder="输入时最多提示 10 个已有标签，回车可新建"
            />
          </Form.Item>

          <Form.List name="answers">
            {(answers, { add, remove }) => (
              <div className="qk-dynamic-list">
                <div className="qk-dynamic-head">
                  <span>我的答案（保留历史）</span>
                  <Button
                    type="dashed"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => add({ title: '', content: '', thoughts: [] })}
                  >
                    添加答案
                  </Button>
                </div>
                {answers.map((answer) => (
                  <div className="qk-dynamic-card" key={answer.key}>
                    <div className="qk-dynamic-card-head">
                      <span>答案 {answer.name + 1}</span>
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(answer.name)}
                      />
                    </div>
                    <Form.Item
                      name={[answer.name, 'title']}
                      label="答案标题"
                      rules={[{ required: true, message: '请输入答案标题' }]}
                    >
                      <Input maxLength={255} placeholder="例如：面积法证明" />
                    </Form.Item>
                    <Form.Item name={[answer.name, 'content']} label="我的答案">
                      <MarkdownEditor minRows={3} placeholder="写下你的答案。" />
                    </Form.Item>
                    <Form.List name={[answer.name, 'thoughts']}>
                      {(thoughts, { add: addThought, remove: removeThought }) => (
                        <div className="qk-thought-list">
                          <div className="qk-dynamic-head compact">
                            <span>思维链</span>
                            <Button
                              type="link"
                              size="small"
                              icon={<PlusOutlined />}
                              onClick={() => addThought({ title: '', content: '' })}
                            >
                              添加思考
                            </Button>
                          </div>
                          {thoughts.map((thought) => (
                            <div className="qk-thought-item" key={thought.key}>
                              <Form.Item name={[thought.name, 'title']} label={`思考 ${thought.name + 1} 标题`}>
                                <Input maxLength={255} placeholder="例如：先作辅助线" />
                              </Form.Item>
                              <Form.Item name={[thought.name, 'content']} label={`思考 ${thought.name + 1}`}>
                                <MarkdownEditor minRows={2} placeholder="这一步是怎么想到的？" />
                              </Form.Item>
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => removeThought(thought.name)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </Form.List>
                  </div>
                ))}
              </div>
            )}
          </Form.List>

          <Form.List name="ref_answers">
            {(refs, { add, remove }) => (
              <div className="qk-dynamic-list">
                <div className="qk-dynamic-head">
                  <span>参考答案</span>
                  <Button
                    type="dashed"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => add({ title: '', content: '', idea: '' })}
                  >
                    添加参考答案
                  </Button>
                </div>
                {refs.map((item) => (
                  <div className="qk-dynamic-card" key={item.key}>
                    <div className="qk-dynamic-card-head">
                      <span>参考答案 {item.name + 1}</span>
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(item.name)}
                      />
                    </div>
                    <Form.Item
                      name={[item.name, 'title']}
                      label="参考答案标题"
                      rules={[{ required: true, message: '请输入参考答案标题' }]}
                    >
                      <Input maxLength={255} placeholder="例如：标准答案" />
                    </Form.Item>
                    <Form.Item name={[item.name, 'content']} label="参考答案">
                      <MarkdownEditor minRows={3} placeholder="标准解法或参考思路。" />
                    </Form.Item>
                    <Form.Item name={[item.name, 'idea']} label="我的想法">
                      <MarkdownEditor minRows={2} placeholder="对照标准答案后的想法与复盘。" />
                    </Form.Item>
                  </div>
                ))}
              </div>
            )}
          </Form.List>
        </Form>
      )}
    </Drawer>
  )
}
