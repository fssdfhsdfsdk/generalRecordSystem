import React, { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
} from 'antd'
import dayjs from 'dayjs'
import { planApi } from '../api'
import { PROGRESS_TYPE_OPTIONS } from '../planMeta'

const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss'

export default function PlanProgressModal({ open, plan, onClose, onChanged }) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const delta = Form.useWatch('delta', form)
  const logType = Form.useWatch('log_type', form)

  const predicted = useMemo(() => {
    const value = Math.max(0, Math.min(100, Number(plan?.progress || 0) + Number(delta || 0)))
    return Number.isFinite(value) ? Math.round(value) : plan?.progress || 0
  }, [plan?.progress, delta])

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({
      log_type: 'progress',
      delta: 10,
      changed_at: dayjs(),
      description: '',
      evidence: '',
      node_id: undefined,
    })
  }, [open, form])

  const submit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const updated = await planApi.addProgress(plan.id, {
        ...values,
        changed_at: values.changed_at
          ? values.changed_at.format(DATE_FORMAT)
          : null,
      })
      message.success('进度已记录')
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
      okText="记录进度"
      cancelText="取消"
      confirmLoading={saving}
      title="记录进度 / 阻塞 / 困难"
      width={560}
      destroyOnHidden
    >
      <div className="progress-preview">
        <span>当前进度 {plan?.progress ?? 0}%</span>
        <span className="progress-preview-arrow">→</span>
        <strong>记录后 {predicted}%</strong>
      </div>
      <Form form={form} layout="vertical">
        <div className="form-grid-2">
          <Form.Item name="log_type" label="记录类型">
            <Select options={PROGRESS_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="delta"
            label="进度变化（百分点）"
            rules={[{ required: true, message: '请输入变化度' }]}
          >
            <InputNumber
              min={-100}
              max={100}
              step={5}
              precision={0}
              className="full-width"
              addonAfter="%"
            />
          </Form.Item>
        </div>
        <div className="quick-delta-row">
          <span>快捷：</span>
          {[5, 10, 20, -5, -10].map((value) => (
            <Button
              key={value}
              size="small"
              onClick={() => form.setFieldValue('delta', value)}
            >
              {value > 0 ? `+${value}` : value}%
            </Button>
          ))}
        </div>
        {logType !== 'progress' ? (
          <div className="form-hint">
            {logType === 'blocker'
              ? '阻塞记录可以填写 0% 变化，重点写清被什么卡住。'
              : '困难记录可以填写负数，表示返工或进度回退。'}
          </div>
        ) : null}
        <Form.Item
          name="description"
          label="描述"
          rules={[{ required: true, message: '请描述这次变化或阻塞' }]}
        >
          <Input.TextArea
            rows={4}
            maxLength={5000}
            showCount
            placeholder="例如：完成登录接口联调；或：等待第三方接口文档，暂停两天。"
          />
        </Form.Item>
        <div className="form-grid-2">
          <Form.Item name="changed_at" label="发生时间">
            <DatePicker showTime className="full-width" format="YYYY-MM-DD HH:mm" />
          </Form.Item>
          <Form.Item name="node_id" label="关联节点（可选）">
            <Select
              allowClear
              placeholder="不关联到具体节点"
              options={(plan?.nodes || []).map((node) => ({
                value: node.id,
                label: node.name,
              }))}
            />
          </Form.Item>
        </div>
        <Form.Item name="evidence" label="证据 / 附件说明（可选）">
          <Input
            maxLength={2000}
            placeholder="链接、文件路径或一句备注"
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
