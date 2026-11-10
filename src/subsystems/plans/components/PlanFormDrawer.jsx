import React, { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
} from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { planApi } from '../api'
import { PLAN_TYPES } from '../planMeta'
import MarkdownEditor from '../../../components/MarkdownEditor'
import TagSelect from '../../../components/TagSelect'

const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss'

function toDayjs(value) {
  if (!value) return null
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed : null
}

export default function PlanFormDrawer({
  open,
  plan,
  defaultType = 'short',
  onClose,
  onSaved,
}) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [parentOptions, setParentOptions] = useState([])
  const editing = Boolean(plan?.id)
  const hasChildren = Boolean(plan?.children?.length)

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({
      title: plan?.title || '',
      plan_type: plan?.plan_type || defaultType,
      content: plan?.content || '',
      estimated_hours: plan?.estimated_hours ?? 0,
      actual_hours: plan?.actual_hours ?? 0,
      planned_range:
        plan?.planned_start || plan?.planned_end
          ? [toDayjs(plan.planned_start), toDayjs(plan.planned_end)]
          : undefined,
      tags: plan?.tags || [],
      parent_plan_id: plan?.parent_plan_id || undefined,
    })
    planApi
      .list({ limit: 500, sort: 'updated_desc' })
      .then((data) => {
        setParentOptions(
          data.plans.filter(
            (item) =>
              !item.parent_plan_id && String(item.id) !== String(plan?.id),
          ),
        )
      })
      .catch(() => setParentOptions([]))
  }, [open, plan, defaultType, form])

  const typeOptions = useMemo(
    () => PLAN_TYPES.map((item) => ({ value: item.key, label: item.label })),
    [],
  )

  const submit = async () => {
    const values = await form.validateFields()
    const range = values.planned_range || []
    const payload = {
      title: values.title,
      plan_type: values.plan_type,
      content: values.content || '',
      estimated_hours: values.estimated_hours ?? 0,
      actual_hours: values.actual_hours ?? 0,
      planned_start: range[0] ? range[0].format(DATE_FORMAT) : null,
      planned_end: range[1] ? range[1].format(DATE_FORMAT) : null,
      tags: values.tags || [],
      parent_plan_id: values.parent_plan_id || null,
    }
    setSaving(true)
    try {
      const saved = editing
        ? await planApi.update(plan.id, payload)
        : await planApi.create(payload)
      message.success(editing ? '计划已更新' : '计划已创建')
      onSaved?.(saved)
      onClose?.()
    } catch (error) {
      message.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={760}
      destroyOnHidden
      className="plan-form-drawer"
      rootClassName="plan-form-root"
      title={
        <div className="drawer-heading">
          <span className="drawer-heading-kicker">
            {editing ? 'EDIT PLAN' : 'NEW PLAN'}
          </span>
          <span className="drawer-heading-title">
            {editing ? '编辑计划' : '创建计划'}
          </span>
        </div>
      }
      footer={
        <div className="drawer-footer-actions">
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={submit}
          >
            {editing ? '保存修改' : '创建计划'}
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item
          name="title"
          label="计划标题"
          rules={[{ required: true, message: '请输入计划标题' }]}
        >
          <Input
            id="plan-title"
            maxLength={255}
            showCount
            placeholder="例如：完成 v1.2 计划管理子系统"
          />
        </Form.Item>

        <div className="form-grid-2">
          <Form.Item
            name="plan_type"
            label="计划类型"
            rules={[{ required: true, message: '请选择计划类型' }]}
          >
            <Select options={typeOptions} />
          </Form.Item>
          <Form.Item name="parent_plan_id" label="父计划">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              disabled={hasChildren}
              placeholder={
                hasChildren ? '已有子计划，不能再挂到其他计划下' : '不设置则为根计划'
              }
              options={parentOptions.map((item) => ({
                value: item.id,
                label: `${item.title}（${item.plan_type_label}）`,
              }))}
            />
          </Form.Item>
        </div>

        <div className="form-grid-2">
          <Form.Item name="estimated_hours" label="预估耗时">
            <InputNumber
              min={0}
              max={100000}
              step={0.5}
              precision={2}
              className="full-width"
              addonAfter="小时"
            />
          </Form.Item>
          <Form.Item name="actual_hours" label="实际耗时">
            <InputNumber
              min={0}
              max={100000}
              step={0.5}
              precision={2}
              className="full-width"
              addonAfter="小时"
            />
          </Form.Item>
        </div>

        <Form.Item
          name="planned_range"
          label="计划时间线"
          extra="可以只填开始或只填结束；节点和实际时间点会单独记录。"
        >
          <DatePicker.RangePicker
            showTime
            format="YYYY-MM-DD HH:mm"
            className="full-width"
            placeholder={['计划开始', '计划结束']}
          />
        </Form.Item>

        <Form.Item name="tags" label="计划标签">
          <TagSelect placeholder="输入标签，按回车确认（计划独立词库）" />
        </Form.Item>

        <Form.Item name="content" label="计划内容">
          <MarkdownEditor
            minRows={8}
            placeholder="写下目标、背景、验收标准或拆解思路，支持 Markdown 与表格。"
          />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
