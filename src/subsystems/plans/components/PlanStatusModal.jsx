import React, { useEffect, useMemo, useState } from 'react'
import { App as AntApp, Alert, Form, Input, Modal, Select } from 'antd'
import { planApi } from '../api'
import {
  ALLOWED_TRANSITIONS,
  PLAN_STATUS_META,
  planStatusMeta,
} from '../planMeta'

const REASON_REQUIRED = new Set(['abandoned', 'on_hold', 'overdue'])

export default function PlanStatusModal({ open, plan, onClose, onChanged }) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const target = Form.useWatch('status', form)
  const current = plan?.status

  const options = useMemo(() => {
    const allowed = ALLOWED_TRANSITIONS[current] || []
    return allowed.map((status) => ({
      value: status,
      label: PLAN_STATUS_META[status].label,
    }))
  }, [current])

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({ status: options[0]?.value, reason: '' })
  }, [open, form, options])

  const submit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const updated = await planApi.changeStatus(plan.id, values)
      message.success(`状态已变更为「${planStatusMeta(values.status).label}」`)
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
      okText="确认变更"
      cancelText="取消"
      confirmLoading={saving}
      title="变更计划状态"
      destroyOnHidden
    >
      <div className="status-modal-current">
        当前状态：<strong>{planStatusMeta(current).label}</strong>
      </div>
      <Form form={form} layout="vertical">
        <Form.Item
          name="status"
          label="目标状态"
          rules={[{ required: true, message: '请选择目标状态' }]}
        >
          <Select options={options} />
        </Form.Item>
        {target ? (
          <Alert
            type={target === 'completed' ? 'success' : 'info'}
            showIcon
            message={`变更为「${PLAN_STATUS_META[target].label}」`}
            description={
              target === 'completed'
                ? '完成前需要所有未放弃的节点都已完成；进度会自动补齐到 100%。'
                : PLAN_STATUS_META[target].description
            }
          />
        ) : null}
        <Form.Item
          name="reason"
          label="变更原因"
          rules={[
            {
              required: target ? REASON_REQUIRED.has(target) : false,
              message: '该状态必须填写原因',
            },
          ]}
          extra={
            target === 'completed' || target === 'in_progress'
              ? '可选。重新打开已完成/已放弃计划时会写入审计。'
              : '放弃、搁置、超时状态必须说明原因。'
          }
        >
          <Input.TextArea
            rows={3}
            maxLength={1000}
            showCount
            placeholder="记录为什么变更，方便以后回看。"
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
