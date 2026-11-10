import React, { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
} from 'antd'
import dayjs from 'dayjs'
import { planApi } from '../api'
import { NODE_STATUS_OPTIONS } from '../planMeta'

const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss'

function toDayjs(value) {
  if (!value) return null
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed : null
}

export default function PlanNodeModal({ open, plan, node, onClose, onChanged }) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const editing = Boolean(node?.id)

  const dependencyOptions = useMemo(
    () =>
      (plan?.nodes || [])
        .filter((item) => String(item.id) !== String(node?.id))
        .map((item) => ({
          value: item.id,
          label: `${item.name}（${item.status_label}）`,
        })),
    [plan?.nodes, node?.id],
  )

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({
      name: node?.name || '',
      planned_range:
        node?.planned_start || node?.planned_end
          ? [toDayjs(node.planned_start), toDayjs(node.planned_end)]
          : undefined,
      weight: node?.weight ?? 1,
      status: node?.status || 'pending',
      depends_on_node_id: node?.depends_on_node_id || undefined,
    })
  }, [open, node, form])

  const submit = async () => {
    const values = await form.validateFields()
    const range = values.planned_range || []
    const payload = {
      name: values.name,
      planned_start: range[0] ? range[0].format(DATE_FORMAT) : null,
      planned_end: range[1] ? range[1].format(DATE_FORMAT) : null,
      weight: values.weight,
      status: values.status,
      depends_on_node_id: values.depends_on_node_id || null,
    }
    setSaving(true)
    try {
      const updated = editing
        ? await planApi.updateNode(plan.id, node.id, payload)
        : await planApi.createNode(plan.id, payload)
      message.success(editing ? '节点已更新' : '节点已添加')
      onChanged?.(updated)
      onClose?.()
    } catch (error) {
      message.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      okText={editing ? '保存节点' : '添加节点'}
      cancelText="取消"
      confirmLoading={saving}
      title={editing ? '编辑计划节点' : '添加计划节点'}
      width={600}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="节点名称"
          rules={[{ required: true, message: '请输入节点名称' }]}
        >
          <Input maxLength={255} placeholder="例如：完成后端 API 与测试" />
        </Form.Item>
        <Form.Item name="planned_range" label="节点计划时间">
          <DatePicker.RangePicker
            showTime
            format="YYYY-MM-DD HH:mm"
            className="full-width"
            placeholder={['计划开始', '计划结束']}
          />
        </Form.Item>
        <div className="form-grid-2">
          <Form.Item
            name="weight"
            label="权重"
            extra="完成度按未放弃节点的权重汇总。"
            rules={[{ required: true, message: '请输入权重' }]}
          >
            <InputNumber
              min={0.01}
              max={1000}
              step={0.5}
              precision={2}
              className="full-width"
            />
          </Form.Item>
          <Form.Item name="status" label="节点状态">
            <Select options={NODE_STATUS_OPTIONS} />
          </Form.Item>
        </div>
        <Form.Item
          name="depends_on_node_id"
          label="依赖节点（可选）"
          extra="只支持单个前置节点；系统会拒绝循环依赖。"
        >
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="不依赖其他节点"
            options={dependencyOptions}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
