import React, { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import {
  BranchesOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { qkApi } from '../api'
import { GRAPHS } from '../qkMeta'
import PageHeader from '../../../components/PageHeader'

const EMPTY_TYPE = {
  code: '',
  name: '',
  description: '',
  is_directed: true,
  forward_label: '',
  reverse_label: '',
  allow_cycle: false,
  color: '#4f46e5',
  lineStyle: 'solid',
  arrow: 'end',
}
const EMPTY_EDGE = {
  source_id: undefined,
  target_id: undefined,
  relation_type_id: undefined,
  properties: '{}',
}

const nodeOptions = (list = []) =>
  list.map((item) => ({
    value: item.id,
    label: `#${item.id} ${item.title}`,
  }))

export default function RelationManagePage({ graph }) {
  const { message } = AntApp.useApp()
  const meta = GRAPHS[graph] || GRAPHS.question
  const [types, setTypes] = useState([])
  const [edges, setEdges] = useState([])
  const [questions, setQuestions] = useState([])
  const [knowledge, setKnowledge] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState(undefined)
  const [filterQ, setFilterQ] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [typeModal, setTypeModal] = useState(false)
  const [edgeModal, setEdgeModal] = useState(false)
  const [editingType, setEditingType] = useState(null)
  const [editingEdge, setEditingEdge] = useState(null)
  const [saving, setSaving] = useState(false)
  const [typeForm] = Form.useForm()
  const [edgeForm] = Form.useForm()

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      qkApi.listRelationTypes(graph),
      qkApi.listRelations(graph, {
        relation_type_id: filterType,
        q: filterQ,
      }),
      qkApi.listQuestions({ limit: 1000, sort: 'title_asc' }),
      qkApi.listKnowledge({ limit: 1000, sort: 'title_asc' }),
    ])
      .then(([typesData, edgesData, questionsData, knowledgeData]) => {
        if (!alive) return
        setTypes(typesData.types)
        setEdges(edgesData.relations)
        setQuestions(questionsData.questions)
        setKnowledge(knowledgeData.knowledge)
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
  }, [graph, filterType, filterQ, reloadToken, message])

  const sourceList = graph === 'knowledge' ? knowledge : questions
  const targetList = graph === 'question_knowledge' ? knowledge : sourceList
  const typeMap = useMemo(
    () => new Map(types.map((item) => [item.id, item])),
    [types],
  )

  const openTypeForm = (item = null) => {
    setEditingType(item)
    if (item) {
      const visual = item.visual_config || {}
      typeForm.setFieldsValue({
        code: item.code,
        name: item.name,
        description: item.description,
        is_directed: item.is_directed,
        forward_label: item.forward_label,
        reverse_label: item.reverse_label,
        allow_cycle: item.allow_cycle,
        color: visual.color || '#4f46e5',
        lineStyle: visual.lineStyle || 'solid',
        arrow: visual.arrow || 'end',
      })
    } else {
      typeForm.resetFields()
      typeForm.setFieldsValue(EMPTY_TYPE)
    }
    setTypeModal(true)
  }

  const saveType = async () => {
    try {
      const values = await typeForm.validateFields()
      setSaving(true)
      const payload = {
        code: values.code,
        name: values.name,
        description: values.description || '',
        is_directed: Boolean(values.is_directed),
        forward_label: values.forward_label || '',
        reverse_label: values.reverse_label || '',
        allow_cycle: Boolean(values.allow_cycle),
        visual_config: {
          color: values.color || '#4f46e5',
          lineStyle: values.lineStyle || 'solid',
          arrow: values.arrow || 'end',
        },
      }
      if (editingType) {
        await qkApi.updateRelationType(graph, editingType.id, payload)
        message.success('关系类型已更新')
      } else {
        await qkApi.createRelationType(graph, payload)
        message.success('关系类型已添加')
      }
      setTypeModal(false)
      setReloadToken((token) => token + 1)
    } catch (error) {
      if (!error?.errorFields) message.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const removeType = async (item) => {
    try {
      await qkApi.removeRelationType(graph, item.id)
      message.success('关系类型已删除')
      setReloadToken((token) => token + 1)
    } catch (error) {
      message.error(error.message)
    }
  }

  const openEdgeForm = (item = null) => {
    setEditingEdge(item)
    if (item) {
      edgeForm.setFieldsValue({
        source_id: item.source_id,
        target_id: item.target_id,
        relation_type_id: item.relation_type_id,
        properties: JSON.stringify(item.properties || {}),
      })
    } else {
      edgeForm.resetFields()
      edgeForm.setFieldsValue(EMPTY_EDGE)
    }
    setEdgeModal(true)
  }

  const saveEdge = async () => {
    try {
      const values = await edgeForm.validateFields()
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
      const payload = {
        source_id: Number(values.source_id),
        target_id: Number(values.target_id),
        relation_type_id: Number(values.relation_type_id),
        properties,
      }
      if (editingEdge) {
        await qkApi.updateRelation(graph, editingEdge.id, payload)
        message.success('关系已更新')
      } else {
        await qkApi.createRelation(graph, payload)
        message.success('关系已添加')
      }
      setEdgeModal(false)
      setReloadToken((token) => token + 1)
    } catch (error) {
      if (!error?.errorFields) message.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const removeEdge = async (item) => {
    try {
      await qkApi.removeRelation(graph, item.id)
      message.success('关系已删除')
      setReloadToken((token) => token + 1)
    } catch (error) {
      message.error(error.message)
    }
  }

  const typeColumns = useMemo(
    () => [
      {
        title: '关系名称',
        dataIndex: 'name',
        key: 'name',
        width: 180,
        render: (_, record) => (
          <div>
            <strong>{record.name}</strong>
            <div className="muted-text">{record.code}</div>
          </div>
        ),
      },
      {
        title: '展示文案',
        key: 'labels',
        render: (_, record) => (
          <div className="qk-relation-label-cell">
            <span>{record.forward_label || '—'}</span>
            <span className="muted-text">↔</span>
            <span>{record.reverse_label || '—'}</span>
          </div>
        ),
      },
      {
        title: '规则',
        key: 'rules',
        width: 180,
        render: (_, record) => (
          <Space size={4} wrap>
            <Tag bordered={false} color={record.is_directed ? 'blue' : 'default'}>
              {record.is_directed ? '有向' : '无向'}
            </Tag>
            <Tag bordered={false} color={record.allow_cycle ? 'default' : 'orange'}>
              {record.allow_cycle ? '允许成环' : '禁止成环'}
            </Tag>
            {record.is_system ? <Tag bordered={false}>内置</Tag> : null}
          </Space>
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 96,
        render: (_, record) => (
          <Space size={2}>
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => openTypeForm(record)}
              />
            </Tooltip>
            {record.is_system ? (
              <Tooltip title="系统内置关系不能删除">
                <Button type="text" size="small" danger disabled icon={<DeleteOutlined />} />
              </Tooltip>
            ) : (
              <Popconfirm
                title={`删除关系类型「${record.name}」？`}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => removeType(record)}
              >
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
          </Space>
        ),
      },
    ],
    [graph],
  )

  const edgeColumns = useMemo(
    () => [
      {
        title: '关系',
        key: 'pair',
        render: (_, record) => (
          <div className="qk-edge-pair">
            <span className="qk-edge-node">#{record.source_id} {record.source_title}</span>
            <Tag bordered={false} color="indigo">
              {typeMap.get(record.relation_type_id)?.name || record.relation_name}
            </Tag>
            <span className="qk-edge-node">#{record.target_id} {record.target_title}</span>
          </div>
        ),
      },
      {
        title: '扩展属性',
        dataIndex: 'properties',
        key: 'properties',
        width: 180,
        render: (value) => (
          <span className="muted-text">
            {value && Object.keys(value).length ? JSON.stringify(value) : '—'}
          </span>
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 96,
        render: (_, record) => (
          <Space size={2}>
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEdgeForm(record)}
              />
            </Tooltip>
            <Popconfirm
              title="删除这条关系？"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => removeEdge(record)}
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [graph, typeMap],
  )

  return (
    <div className="page catalog-page qk-page">
      <PageHeader
        eyebrow={meta.eyebrow}
        title={meta.label}
        description={meta.description}
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => setReloadToken((token) => token + 1)}
            >
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdgeForm()}>
              新增关系
            </Button>
          </Space>
        }
      />

      {loading ? (
        <div className="tag-loading">
          <Spin />
        </div>
      ) : (
        <>
          <Card
            className="toolbar-card"
            title={
              <span>
                <SettingOutlined /> 关系类型定义
              </span>
            }
            extra={
              <Button size="small" icon={<PlusOutlined />} onClick={() => openTypeForm()}>
                新增类型
              </Button>
            }
            styles={{ body: { padding: 0 } }}
          >
            <div className="qk-relation-note">
              系统内置类型禁止删除。有向且禁止成环的关系会在保存时做环路校验。
            </div>
            <Table
              rowKey="id"
              size="small"
              dataSource={types}
              columns={typeColumns}
              pagination={false}
            />
          </Card>

          <Card
            className="toolbar-card qk-edge-card"
            title={
              <span>
                <BranchesOutlined /> 关系边列表
              </span>
            }
            styles={{ body: { padding: 0 } }}
          >
            <div className="qk-edge-toolbar">
              <Input
                allowClear
                value={filterQ}
                onChange={(event) => setFilterQ(event.target.value)}
                prefix={<SearchOutlined className="input-prefix" />}
                placeholder="搜索节点标题"
              />
              <Select
                allowClear
                value={filterType}
                onChange={setFilterType}
                placeholder="关系类型"
                options={types.map((item) => ({ value: item.id, label: item.name }))}
              />
              <span className="result-count">{edges.length} 条</span>
            </div>
            <Table
              rowKey="id"
              size="small"
              dataSource={edges}
              columns={edgeColumns}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              scroll={{ x: 720 }}
            />
          </Card>
        </>
      )}

      <Modal
        open={typeModal}
        title={editingType ? `编辑关系类型「${editingType.name}」` : '新增关系类型'}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={saveType}
        onCancel={() => setTypeModal(false)}
        destroyOnClose
        width={640}
      >
        <Form form={typeForm} layout="vertical" initialValues={EMPTY_TYPE}>
          <div className="qk-form-two-col">
            <Form.Item
              name="name"
              label="关系主名称"
              rules={[{ required: true, message: '请输入关系名称' }]}
            >
              <Input placeholder="例如：前置依赖" />
            </Form.Item>
            <Form.Item
              name="code"
              label="唯一编码"
              extra="留空时自动生成。"
            >
              <Input placeholder="例如：PREREQUISITE" />
            </Form.Item>
          </div>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="这条关系表达什么含义？" />
          </Form.Item>
          <div className="qk-form-two-col">
            <Form.Item name="is_directed" label="是否有向" valuePropName="checked">
              <Switch checkedChildren="有向" unCheckedChildren="无向" />
            </Form.Item>
            <Form.Item name="allow_cycle" label="是否允许成环" valuePropName="checked">
              <Switch checkedChildren="允许" unCheckedChildren="禁止" />
            </Form.Item>
          </div>
          <div className="qk-form-two-col">
            <Form.Item name="forward_label" label="正向展示文案">
              <Input placeholder="例如：是…的前置知识" />
            </Form.Item>
            <Form.Item name="reverse_label" label="反向展示文案">
              <Input placeholder="例如：依赖前置知识" />
            </Form.Item>
          </div>
          <div className="qk-form-three-col">
            <Form.Item name="color" label="线条颜色">
              <Input placeholder="#4f46e5" />
            </Form.Item>
            <Form.Item name="lineStyle" label="线条样式">
              <Select
                options={[
                  { value: 'solid', label: '实线' },
                  { value: 'dashed', label: '虚线' },
                  { value: 'dotted', label: '点线' },
                ]}
              />
            </Form.Item>
            <Form.Item name="arrow" label="箭头样式">
              <Select
                options={[
                  { value: 'none', label: '无箭头' },
                  { value: 'end', label: '终点箭头' },
                  { value: 'both', label: '双向箭头' },
                ]}
              />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        open={edgeModal}
        title={editingEdge ? '编辑关系' : '新增关系'}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={saveEdge}
        onCancel={() => setEdgeModal(false)}
        destroyOnClose
      >
        <Form form={edgeForm} layout="vertical" initialValues={EMPTY_EDGE}>
          <Form.Item
            name="source_id"
            label={graph === 'question_knowledge' ? '习题（起点）' : '起始节点'}
            rules={[{ required: true, message: '请选择起始节点' }]}
          >
            <Select
              showSearch
              options={nodeOptions(sourceList)}
              filterOption={(input, option) =>
                String(option?.label ?? '')
                  .toLocaleLowerCase()
                  .includes(input.trim().toLocaleLowerCase())
              }
              placeholder="选择起始节点"
            />
          </Form.Item>
          <Form.Item
            name="relation_type_id"
            label="关系类型"
            rules={[{ required: true, message: '请选择关系类型' }]}
          >
            <Select
              options={types.map((item) => ({ value: item.id, label: item.name }))}
              placeholder="选择关系类型"
            />
          </Form.Item>
          <Form.Item
            name="target_id"
            label={graph === 'question_knowledge' ? '知识（终点）' : '目标节点'}
            rules={[{ required: true, message: '请选择目标节点' }]}
          >
            <Select
              showSearch
              options={nodeOptions(targetList)}
              filterOption={(input, option) =>
                String(option?.label ?? '')
                  .toLocaleLowerCase()
                  .includes(input.trim().toLocaleLowerCase())
              }
              placeholder="选择目标节点"
            />
          </Form.Item>
          <Form.Item
            name="properties"
            label="扩展属性（JSON）"
            extra="可挂载依赖强度、生效条件等自定义字段。"
          >
            <Input.TextArea rows={4} placeholder='{"strength": 3}' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
