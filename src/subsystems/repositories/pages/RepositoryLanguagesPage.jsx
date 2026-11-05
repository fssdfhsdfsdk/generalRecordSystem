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
  TagsOutlined,
} from '@ant-design/icons'
import { repositoryApi } from '../api'
import { navigate } from '../../../router'
import { tagTone } from '../../../utils'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'
import EllipsisText from '../../../components/EllipsisText'

export default function RepositoryLanguagesPage() {
  const { message } = AntApp.useApp()
  const [languages, setLanguages] = useState([])
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
      const data = await repositoryApi.listLanguages({ sort: 'count' })
      setLanguages(data.languages)
    } catch (error) {
      message.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visible = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    const filtered = keyword
      ? languages.filter((item) =>
          item.name.toLocaleLowerCase().includes(keyword),
        )
      : languages
    const result = [...filtered]
    if (sort === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    } else {
      result.sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'),
      )
    }
    return result
  }, [languages, query, sort])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openRename = (item) => {
    setEditing(item)
    form.setFieldsValue({ name: item.name })
    setModalOpen(true)
  }

  const save = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        await repositoryApi.renameLanguage(editing.id, values)
        message.success('编程语言已更新')
      } else {
        await repositoryApi.createLanguage(values)
        message.success('编程语言已添加')
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
      await repositoryApi.removeLanguage(item.id)
      message.success(`已删除编程语言「${item.name}」`)
      await load(false)
    } catch (error) {
      message.error(error.message)
    }
  }

  return (
    <div className="page doc-tags-page catalog-manage-page">
      <PageHeader
        eyebrow="PROGRAMMING LANGUAGES"
        title="编程语言管理"
        description="维护仓库可选的编程语言。点击语言卡片可筛选相关仓库。"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
          >
            新增编程语言
          </Button>
        }
      />

      <div className="doc-tag-toolbar">
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<SearchOutlined className="input-prefix" />}
          placeholder="搜索编程语言"
          className="tag-search"
        />
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { label: '按数量', value: 'count' },
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
            <div
              className={`doc-tag-card tag-tone-${tagTone(item.name)} ${
                item.count ? 'is-clickable' : 'is-orphan'
              }`}
              key={item.id}
              role={item.count ? 'button' : undefined}
              tabIndex={item.count ? 0 : undefined}
              onClick={() => {
                if (item.count) {
                  navigate(
                    `/repositories?languages=${encodeURIComponent(item.name)}`,
                  )
                }
              }}
              onKeyDown={(event) => {
                if (
                  item.count &&
                  (event.key === 'Enter' || event.key === ' ')
                ) {
                  event.preventDefault()
                  navigate(
                    `/repositories?languages=${encodeURIComponent(item.name)}`,
                  )
                }
              }}
            >
              <div className="doc-tag-card-top">
                <span className="doc-tag-card-hash">#</span>
                <span className="doc-tag-card-count">{item.count}</span>
              </div>
              <div className="doc-tag-card-name">
                <EllipsisText text={item.name} maxChars={26} />
              </div>
              <div className="doc-tag-card-foot">
                <span>{item.count ? `${item.count} 个仓库` : '暂未被使用'}</span>
                <Space
                  size={2}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Tooltip title="重命名">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openRename(item)}
                    />
                  </Tooltip>
                  <Popconfirm
                    title={`删除编程语言「${item.name}」？`}
                    description="会从所有仓库中移除该语言，仓库本身保留。"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => remove(item)}
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                    />
                  </Popconfirm>
                </Space>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<TagsOutlined />}
          title={query ? '没有匹配的编程语言' : '还没有编程语言'}
          description={
            query ? '换一个关键词试试。' : '添加仓库常用的编程语言。'
          }
          action={
            query ? (
              <Button onClick={() => setQuery('')}>清空搜索</Button>
            ) : (
              <Button type="primary" onClick={openCreate}>
                新增编程语言
              </Button>
            )
          }
        />
      )}

      <Modal
        open={modalOpen}
        title={editing ? `重命名「${editing.name}」` : '新增编程语言'}
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
            label="编程语言名称"
            rules={[
              { required: true, message: '请输入编程语言名称' },
              { max: 100, message: '不能超过 100 个字符' },
            ]}
          >
            <Input maxLength={100} placeholder="例如：Python、TypeScript" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
