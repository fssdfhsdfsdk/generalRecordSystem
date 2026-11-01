import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
} from 'antd'
import dayjs from 'dayjs'
import { planApi } from '../api'

const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss'

function toDayjs(value) {
  if (!value) return null
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed : null
}

export default function PlanActualModal({ open, plan, actual, onClose, onChanged }) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const editing = Boolean(actual?.id)

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({
      node_id: actual?.node_id || undefined,
      actual_start: toDayjs(actual?.actual_start) || dayjs(),
      actual_end: toDayjs(actual?.actual_end),
      description: actual?.description || '',
      evidence: actual?.evidence || '',
    })
  }, [open, actual, form])

  const submit = async () => {
    const values = await form.validateFields()
    const payload = {
      node_id: values.node_id || null,
      actual_start: values.actual_start?.format(DATE_FORMAT),
      actual_end: values.actual_end?.format(DATE_FORMAT) || null,
      description: values.description,
      evidence: values.evidence || '',
    }
    setSaving(true)
    try {
      const updated = editing
        ? await planApi.updateActual(plan.id, actual.id, payload)
        : await planApi.createActual(plan.id, payload)
      message.success(editing ? '实际时间点已更新' : '实际时间点已添加')
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
      okText={editing ? '保存记录' : '添加记录'}
      cancelText="取消"
      confirmLoading={saving}
      title={editing ? '编辑实际时间点' : '添加实际时间点'}
      width={600}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="node_id" label="关联节点（可选）">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="不关联到具体节点"
            options={(plan?.nodes || []).map((node) => ({
              value: node.id,
              label: node.name,
            }))}
          />
        </Form.Item>
        <div className="form-grid-2">
          <Form.Item
            name="actual_start"
            label="实际开始"
            rules={[{ required: true, message: '请选择实际开始时间' }]}
          >
            <DatePicker showTime className="full-width" format="YYYY-MM-DD HH:mm" />
          </Form.Item>
          <Form.Item name="actual_end" label="实际结束（可留空）">
            <DatePicker showTime className="full-width" format="YYYY-MM-DD HH:mm" />
          </Form.Item>
        </div>
        <Form.Item
          name="description"
          label="描述"
          rules={[{ required: true, message: '请描述实际发生了什么' }]}
        >
          <Input.TextArea
            rows={4}
            maxLength={5000}
            showCount
            placeholder="例如：和供应商开了 1 小时会，确认了交付边界。"
          />
        </Form.Item>
        <Form.Item name="evidence" label="证据 / 附件说明（可选）">
          <Input maxLength={2000} placeholder="链接、文件路径或一句备注" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
