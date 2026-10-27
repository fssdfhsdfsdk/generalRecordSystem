import React, { useEffect, useState } from 'react'
import {
  Alert,
  App as AntApp,
  Button,
  Form,
  Input,
  Modal,
  Space,
  Tooltip,
} from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { api } from '../api'

export default function TypeFormModal({ open, type, onClose, onSaved }) {
  const { message, modal } = AntApp.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const isEdit = Boolean(type)

  useEffect(() => {
    if (!open) return
    form.resetFields()
    if (type) {
      form.setFieldsValue({
        name: type.name,
        fields: type.fields.map((field) => ({
          id: field.id,
          name: field.field_name,
        })),
      })
    } else {
      form.setFieldsValue({ name: '', fields: [{ name: '' }] })
    }
  }, [open, type, form])

  const persist = async (values) => {
    const fields = values.fields.map((field) => ({
      ...(field.id ? { id: field.id } : {}),
      name: field.name.trim(),
    }))
    setSaving(true)
    try {
      const saved = isEdit
        ? await api.updateType(type.id, { name: values.name.trim(), fields })
        : await api.createType({ name: values.name.trim(), fields })
      message.success(isEdit ? '类型结构已更新' : '记录类型已创建')
      onSaved?.(saved)
      onClose?.()
    } catch (error) {
      message.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleFinish = async (values) => {
    if (!isEdit) {
      await persist(values)
      return
    }
    const submittedIds = new Set(values.fields.map((field) => field.id).filter(Boolean))
    const removed = type.fields.filter((field) => !submittedIds.has(field.id))
    if (!removed.length) {
      await persist(values)
      return
    }
    modal.confirm({
      title: `将删除 ${removed.length} 个字段`,
      content: (
        <div className="confirm-copy">
          <p>
            字段：{removed.map((field) => `「${field.field_name}」`).join('、')}
          </p>
          <p>这些字段在所有记录中的内容会一并永久删除，且无法恢复。</p>
        </div>
      ),
      okText: '删除字段并保存',
      cancelText: '返回检查',
      okButtonProps: { danger: true },
      onOk: () => persist(values),
    })
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={isEdit ? '编辑记录类型' : '新建记录类型'}
      width={640}
      destroyOnHidden
      maskClosable={false}
      confirmLoading={saving}
      okText={isEdit ? '保存结构' : '创建类型'}
      cancelText="取消"
      onOk={() => form.submit()}
    >
      <Form form={form} layout="vertical" onFinish={handleFinish} requiredMark={false}>
        <Form.Item
          name="name"
          label="类型名称"
          rules={[
            { required: true, whitespace: true, message: '请填写类型名称' },
            { max: 100, message: '不能超过 100 个字符' },
          ]}
        >
          <Input placeholder="例如：需求记录、读书笔记、复盘" maxLength={100} />
        </Form.Item>

        {isEdit ? (
          <div className="modal-hint">
            <Alert
              type="warning"
              showIcon
              message="调整结构会影响已有记录。删除字段会连带删除所有记录中该字段的内容。"
            />
          </div>
        ) : null}

        <div className="form-list-label">
          <span>字段</span>
          <span className="muted-text">按顺序展示，标题与标签由系统自动提供</span>
        </div>

        <Form.List name="fields">
          {(fieldItems, { add, remove, move }) => (
            <div className="type-field-list">
              {fieldItems.map(({ key, name, ...restField }, index) => (
                <div className="type-field-row" key={key}>
                  <span className="type-field-order">{String(index + 1).padStart(2, '0')}</span>
                  <Form.Item name={[name, 'id']} hidden>
                    <Input type="hidden" />
                  </Form.Item>
                  <Form.Item
                    {...restField}
                    name={[name, 'name']}
                    className="type-field-input"
                    rules={[
                      { required: true, whitespace: true, message: '请填写字段名' },
                      { max: 100, message: '不能超过 100 个字符' },
                    ]}
                  >
                    <Input placeholder={'例如：问题背景、答案、验收标准'} maxLength={100} />
                  </Form.Item>
                  <Space size={2} className="type-field-actions">
                    <Tooltip title="上移">
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowUpOutlined />}
                        disabled={index === 0}
                        onClick={() => move(index, index - 1)}
                      />
                    </Tooltip>
                    <Tooltip title="下移">
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowDownOutlined />}
                        disabled={index === fieldItems.length - 1}
                        onClick={() => move(index, index + 1)}
                      />
                    </Tooltip>
                    <Tooltip title={fieldItems.length <= 1 ? '至少保留一个字段' : '删除字段'}>
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={fieldItems.length <= 1}
                        onClick={() => remove(name)}
                      />
                    </Tooltip>
                  </Space>
                </div>
              ))}
              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                onClick={() => add({ name: '' })}
                className="add-field-button"
              >
                添加字段
              </Button>
            </div>
          )}
        </Form.List>
      </Form>
    </Modal>
  )
}
