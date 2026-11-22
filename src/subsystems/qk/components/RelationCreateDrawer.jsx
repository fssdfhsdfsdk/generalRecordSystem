import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Spin,
} from 'antd'
import { qkApi } from '../api'

const EMPTY = {
  relation_type_id: undefined,
  target_id: undefined,
  properties: '{}',
}

export default function RelationCreateDrawer({
  open,
  graph,
  sourceId,
  sourceKind,
  sourceTitle,
  onClose,
  onCreated,
}) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [types, setTypes] = useState([])
  const [targets, setTargets] = useState([])

  const targetKind = graph === 'question_knowledge' ? 'knowledge' : sourceKind

  useEffect(() => {
    if (!open || !graph || !sourceId) return undefined
    let alive = true
    setLoading(true)
    Promise.all([
      qkApi.listRelationTypes(graph),
      targetKind === 'knowledge'
        ? qkApi.listKnowledge({ limit: 1000, sort: 'title_asc' })
        : qkApi.listQuestions({ limit: 1000, sort: 'title_asc' }),
    ])
      .then(([typeData, nodeData]) => {
        if (!alive) return
        setTypes(typeData.types || [])
        setTargets(nodeData.knowledge || nodeData.questions || [])
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
  }, [open, graph, sourceId, targetKind, form, message])

  const submit = async () => {
    try {
      const values = await form.validateFields()
      let properties
      try {
        properties = values.properties ? JSON.parse(values.properties) : {}
      } catch {
        message.error('扩展属性必须是合法的 JSON 对象')
        return
      }
      if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
        message.error('扩展属性必须是 JSON 对象')
        return
      }
      setSaving(true)
      await qkApi.createRelation(graph, {
        source_id: Number(sourceId),
        target_id: Number(values.target_id),
        relation_type_id: Number(values.relation_type_id),
        properties,
      })
      message.success('关系已添加')
      onCreated?.()
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
      width={560}
      destroyOnClose
      title={
        <div className="drawer-heading">
          <span className="drawer-heading-kicker">新增关系</span>
          <span className="drawer-heading-title">
            {sourceKind === 'knowledge' ? '知识关系' : graph === 'question_knowledge' ? '习题知识关系' : '习题关系'}
          </span>
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
      {loading ? (
        <div className="drawer-loading">
          <Spin />
        </div>
      ) : (
        <Form form={form} layout="vertical" initialValues={EMPTY}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="起始节点（自己）">
              #{sourceId} {sourceTitle}
            </Descriptions.Item>
            <Descriptions.Item label="目标类型">
              {targetKind === 'knowledge' ? '知识' : '习题'}
            </Descriptions.Item>
          </Descriptions>

          <div className="qk-create-relation-fields">
            <Form.Item
              name="target_id"
              label={targetKind === 'knowledge' ? '目标知识' : '目标习题'}
              rules={[{ required: true, message: '请选择目标节点' }]}
            >
              <Select
                showSearch
                options={targets.map((item) => ({
                  value: item.id,
                  label: `#${item.id} ${item.title}`,
                }))}
                filterOption={(input, option) =>
                  String(option?.label ?? '')
                    .toLocaleLowerCase()
                    .includes(input.trim().toLocaleLowerCase())
                }
                placeholder="选择目标节点"
              />
            </Form.Item>
            <Form.Item
              name="relation_type_id"
              label="关系类型"
              rules={[{ required: true, message: '请选择关系类型' }]}
            >
              <Select
                options={types.map((item) => ({
                  value: item.id,
                  label: `${item.name}${item.is_directed ? '（有向）' : '（无向）'}`,
                }))}
                placeholder="选择关系类型"
              />
            </Form.Item>
            <Form.Item
              name="properties"
              label="扩展属性（JSON）"
              extra="可填写依赖强度、生效条件等自定义字段。"
            >
              <Input.TextArea rows={4} placeholder='{"strength": 3}' />
            </Form.Item>
          </div>
        </Form>
      )}
    </Drawer>
  )
}
