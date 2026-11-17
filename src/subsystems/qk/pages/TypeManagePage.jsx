import React, { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Spin,
  Tooltip,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { qkApi } from '../api'
import { typeCategoryMeta } from '../qkMeta'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'
import EllipsisText from '../../../components/EllipsisText'

export default function TypeManagePage({ category }) {
  const { message } = AntApp.useApp()
  const meta = useMemo(() => typeCategoryMeta(category), [category])
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('count')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const load = async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const data = await qkApi.listTypes(category)
      setTypes(data.types)
    } catch (error) {
      message.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category])

  const visible = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    const filtered = keyword
      ? types.filter(
          (item) =>
            item.name.toLocaleLowerCase().includes(keyword) ||
            item.code.toLocaleLowerCase().includes(keyword),
        )
      : types
    const result = [...filtered]
    if (sort === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    } else {
      result.sort((a, b) => b.count - a.count || a.id - b.id)
    }
    return result
  }, [types, query, sort])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    form.setFieldsValue({
      name: item.name,
      code: item.code,
      description: item.description,
    })
    setModalOpen(true)
  }

  const save = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        await qkApi.updateType(category, editing.id, values)
        message.success('类型已更新')
      } else {
        await qkApi.createType(category, values)
        message.success('类型已添加')
      }
      setModalOpen(false)
      await load(false)
    } catch (error) {
      if (!error?.errorFields) message.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item) => {
    try {
      await qkApi.removeType(category, item.id)
      message.success(`已删除类型「${item.name}」`)
      await load(false)
    } catch (error) {
      message.error(error.message)
    }
  }

  return (
    <div className="page catalog-manage-page qk-page">
      <PageHeader
        eyebrow={meta.eyebrow}
        title={meta.label}
        description={meta.description}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增类型
          </Button>
        }
      />

      <div className="doc-tag-toolbar">
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<SearchOutlined className="input-prefix" />}
          placeholder="搜索类型名称或编码"
          className="tag-search"
        />
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { label: '按使用量', value: 'count' },
            { label: '按名称 A-Z', value: 'name' },
          ]}
        />
        <span className="result-count">{visible.length} 个</span>
      </div>

      {loading ? (
        <div className="tag-loading">
          <Spin />
        </div>
      ) : visible.length ? (
        <div className="doc-tag-card-grid">
          {visible.map((item) => (
            <div className="doc-tag-card qk-type-card" key={item.id}>
              <div className="doc-tag-card-top">
                <span className="doc-tag-card-hash">{item.is_system ? '系' : '自'}</span>
                <span className="doc-tag-card-count">{item.count}</span>
              </div>
              <div className="doc-tag-card-name">
                <EllipsisText text={item.name} maxChars={26} />
              </div>
              <div className="qk-type-code">{item.code}</div>
              {item.description ? (
                <div className="qk-type-desc">
                  <EllipsisText text={item.description} maxChars={44} />
                </div>
              ) : null}
              <div className="doc-tag-card-foot">
                <span>{item.count ? `${item.count} 条内容使用` : '暂未被使用'}</span>
                <Space size={2}>
                  <Tooltip title="编辑">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openEdit(item)}
                    />
                  </Tooltip>
                  <Popconfirm
                    title={`删除类型「${item.name}」？`}
                    description={item.count ? '仍有内容使用该类型，需先移走。' : undefined}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => remove(item)}
                  >
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<SettingOutlined />}
          title={query ? '没有匹配的类型' : '还没有类型'}
          description={query ? '换一个关键词试试。' : '添加自定义类型，扩展分类方式。'}
          action={
            query ? (
              <Button onClick={() => setQuery('')}>清空搜索</Button>
            ) : (
              <Button type="primary" onClick={openCreate}>
                新增类型
              </Button>
            )
          }
        />
      )}

      <Modal
        open={modalOpen}
        title={editing ? `编辑「${editing.name}」` : `新增${meta.label}`}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={save}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="类型标题"
            rules={[{ required: true, message: '请输入类型标题' }]}
          >
            <Input maxLength={100} placeholder="例如：算法题" />
          </Form.Item>
          <Form.Item
            name="code"
            label="类型编码"
            extra="留空时根据标题自动生成；只能使用大写字母、数字和下划线。"
          >
            <Input maxLength={64} placeholder="例如：ALGORITHM" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} maxLength={500} placeholder="这个类型适合什么内容？" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
