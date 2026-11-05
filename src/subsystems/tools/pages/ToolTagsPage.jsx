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
  ClearOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { toolApi } from '../api'
import { navigate } from '../../../router'
import { tagTone } from '../../../utils'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'
import EllipsisText from '../../../components/EllipsisText'

export default function ToolTagsPage() {
  const { message } = AntApp.useApp()
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('count')
  const [cleaning, setCleaning] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const load = async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const data = await toolApi.listTags({ sort: 'count' })
      setTags(data.tags)
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
      ? tags.filter((item) =>
          item.name.toLocaleLowerCase().includes(keyword),
        )
      : tags
    const result = [...filtered]
    if (sort === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    } else {
      result.sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'),
      )
    }
    return result
  }, [tags, query, sort])

  const orphanCount = tags.filter((tag) => !tag.count).length

  const cleanup = async () => {
    setCleaning(true)
    try {
      const result = await toolApi.cleanupTags()
      message.success(
        result.deleted
          ? `已清理 ${result.deleted} 个孤立标签`
          : '没有需要清理的孤立标签',
      )
      await load(false)
    } catch (error) {
      message.error(error.message)
    } finally {
      setCleaning(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openRename = (tag) => {
    setEditing(tag)
    form.setFieldsValue({ name: tag.name })
    setModalOpen(true)
  }

  const save = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        await toolApi.renameTag(editing.id, values)
        message.success('标签已更新')
      } else {
        await toolApi.createTag(values)
        message.success('标签已添加')
      }
      setModalOpen(false)
      await load(false)
    } catch (error) {
      if (!error?.errorFields) message.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (tag) => {
    try {
      await toolApi.removeTag(tag.id)
      message.success(
        tag.count
          ? `已删除标签「${tag.name}」，并从 ${tag.count} 个工具中移除`
          : `已删除标签「${tag.name}」`,
      )
      await load(false)
    } catch (error) {
      message.error(error.message)
    }
  }

  return (
    <div className="page doc-tags-page catalog-manage-page">
      <PageHeader
        eyebrow="TOOL TAGS"
        title="工具标签管理"
        description="工具使用独立标签词库。点击标签卡片可筛选包含该标签的所有工具。"
        extra={
          <Space wrap>
            <Button
              icon={<ClearOutlined />}
              disabled={!orphanCount}
              loading={cleaning}
              onClick={cleanup}
            >
              清理孤立标签{orphanCount ? `（${orphanCount}）` : ''}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增标签
            </Button>
          </Space>
        }
      />

      <div className="doc-tag-toolbar">
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<SearchOutlined className="input-prefix" />}
          placeholder="模糊搜索工具标签"
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
          {visible.map((tag) => (
            <div
              className={`doc-tag-card tag-tone-${tagTone(tag.name)} ${
                tag.count ? 'is-clickable' : 'is-orphan'
              }`}
              key={tag.id}
              role={tag.count ? 'button' : undefined}
              tabIndex={tag.count ? 0 : undefined}
              onClick={() => {
                if (tag.count) {
                  navigate(`/tools?tags=${encodeURIComponent(tag.name)}`)
                }
              }}
              onKeyDown={(event) => {
                if (
                  tag.count &&
                  (event.key === 'Enter' || event.key === ' ')
                ) {
                  event.preventDefault()
                  navigate(`/tools?tags=${encodeURIComponent(tag.name)}`)
                }
              }}
            >
              <div className="doc-tag-card-top">
                <span className="doc-tag-card-hash">#</span>
                <span className="doc-tag-card-count">{tag.count}</span>
              </div>
              <div className="doc-tag-card-name">
                <EllipsisText text={tag.name} maxChars={26} />
              </div>
              <div className="doc-tag-card-foot">
                <span>{tag.count ? `${tag.count} 个工具` : '暂未被使用'}</span>
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
                      onClick={() => openRename(tag)}
                    />
                  </Tooltip>
                  <Popconfirm
                    title={`删除标签「${tag.name}」？`}
                    description="会从所有工具中移除该标签，工具本身保留。"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => remove(tag)}
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
          title={query ? '没有匹配的工具标签' : '工具标签还是空的'}
          description={
            query
              ? '换一个关键词试试。'
              : '编辑工具时添加标签，它们会自动汇总到这里。'
          }
          action={
            query ? (
              <Button onClick={() => setQuery('')}>清空搜索</Button>
            ) : (
              <Button type="primary" onClick={openCreate}>
                新增标签
              </Button>
            )
          }
        />
      )}

      <Modal
        open={modalOpen}
        title={editing ? `重命名「${editing.name}」` : '新增工具标签'}
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
            label="标签名称"
            rules={[
              { required: true, message: '请输入标签名称' },
              { max: 50, message: '标签不能超过 50 个字符' },
              {
                pattern: /^[^\s,，;；]+$/,
                message: '标签不能包含空格、逗号或分号',
              },
            ]}
          >
            <Input maxLength={50} placeholder="例如：编辑器、容器、API" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
