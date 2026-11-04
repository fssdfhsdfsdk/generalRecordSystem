import React, { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Spin,
  Tooltip,
} from 'antd'
import {
  ClearOutlined,
  DeleteOutlined,
  EditOutlined,
  SearchOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { docApi } from '../api'
import { navigate } from '../../../router'
import { tagTone } from '../../../utils'
import { useAppData } from '../../../shell/AppDataContext'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'
import EllipsisText from '../../../components/EllipsisText'

export default function DocTagsPage() {
  const { message } = AntApp.useApp()
  const { docTypes } = useAppData()
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('count')
  const [typeIds, setTypeIds] = useState([])
  const [cleaning, setCleaning] = useState(false)
  const [renameTarget, setRenameTarget] = useState(null)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const loadTags = async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const data = await docApi.listTags({ sort: 'count', type_id: typeIds })
      setTags(data.tags)
    } catch (error) {
      message.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTags()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeIds])

  const visibleTags = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    const filtered = keyword
      ? tags.filter((tag) => tag.name.toLocaleLowerCase().includes(keyword))
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

  const totalReferences = tags.reduce((sum, tag) => sum + tag.count, 0)
  const orphanCount = tags.filter((tag) => !tag.count).length

  const cleanup = async () => {
    setCleaning(true)
    try {
      const result = await docApi.cleanupTags()
      message.success(
        result.deleted
          ? `已清理 ${result.deleted} 个孤立文档标签`
          : '没有需要清理的孤立标签',
      )
      await loadTags(false)
    } catch (error) {
      message.error(error.message)
    } finally {
      setCleaning(false)
    }
  }

  const filterByTag = (tag) => {
    if (!tag.count) return
    navigate(`/docs/tags/${encodeURIComponent(tag.name)}`)
  }

  const openRename = (tag) => {
    setRenameTarget(tag)
    form.setFieldsValue({ name: tag.name })
  }

  const rename = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      await docApi.renameTag(renameTarget.id, values)
      message.success('标签已重命名')
      setRenameTarget(null)
      await loadTags(false)
    } catch (error) {
      if (!error?.errorFields) message.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const removeTag = async (tag) => {
    try {
      const result = await docApi.removeTag(tag.id)
      message.success(
        tag.count
          ? `已删除标签「${tag.name}」，并从 ${tag.count} 篇文档中移除`
          : `已删除标签「${tag.name}」`,
      )
      await loadTags(false)
      return result
    } catch (error) {
      message.error(error.message)
      return null
    }
  }

  return (
    <div className="page doc-tags-page">
      <PageHeader
        eyebrow="DOCUMENT TAGS"
        title="文档标签管理"
        description="文档使用独立的三表标签词库（doc_tags + doc_tag_links + documents），与记录标签、计划标签互不影响。"
        extra={
          <Popconfirm
            title={`清理 ${orphanCount} 个孤立文档标签？`}
            description="只删除不再被任何文档使用的标签，不影响文档内容。"
            okText="清理"
            cancelText="取消"
            disabled={!orphanCount}
            onConfirm={cleanup}
          >
            <Button
              icon={<ClearOutlined />}
              disabled={!orphanCount}
              loading={cleaning}
            >
              清理孤立标签{orphanCount ? `（${orphanCount}）` : ''}
            </Button>
          </Popconfirm>
        }
      />

      <div className="doc-tag-stats-strip">
        <div>
          <span>全部标签</span>
          <strong>{tags.length}</strong>
        </div>
        <div>
          <span>引用次数</span>
          <strong>{totalReferences}</strong>
        </div>
        <div>
          <span>孤立标签</span>
          <strong className={orphanCount ? 'is-warning' : ''}>{orphanCount}</strong>
        </div>
        <div className="doc-tag-stats-copy">
          标签保存在 docs.db；重命名会同步到所有关联文档。
        </div>
      </div>

      <div className="doc-tag-toolbar">
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<SearchOutlined className="input-prefix" />}
          placeholder="模糊搜索文档标签"
          className="tag-search"
        />
        <Select
          mode="multiple"
          allowClear
          maxTagCount="responsive"
          value={typeIds}
          onChange={setTypeIds}
          options={docTypes.map((type) => ({
            value: type.id,
            label: type.name,
          }))}
          placeholder="全部文档类型"
          className="tag-type-filter"
        />
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { label: '按数量', value: 'count' },
            { label: '按名称 A-Z', value: 'name' },
          ]}
        />
        <span className="result-count">{visibleTags.length} 个</span>
      </div>

      {loading ? (
        <div className="tag-loading">
          <Spin />
        </div>
      ) : visibleTags.length ? (
        <div className="doc-tag-card-grid">
          {visibleTags.map((tag) => (
            <div
              className={`doc-tag-card tag-tone-${tagTone(tag.name)} ${
                tag.count ? 'is-clickable' : 'is-orphan'
              }`}
              key={tag.id}
              role={tag.count ? 'button' : undefined}
              tabIndex={tag.count ? 0 : undefined}
              title={tag.count ? `筛选包含 #${tag.name} 的文档` : undefined}
              onClick={() => filterByTag(tag)}
              onKeyDown={(event) => {
                if (
                  tag.count &&
                  (event.key === 'Enter' || event.key === ' ')
                ) {
                  event.preventDefault()
                  filterByTag(tag)
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
                <span>{tag.count ? `${tag.count} 篇文档` : '暂未被使用'}</span>
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
                      aria-label={`重命名标签 ${tag.name}`}
                    />
                  </Tooltip>
                  <Popconfirm
                    title={`删除标签「${tag.name}」？`}
                    description={
                      tag.count
                        ? `会从 ${tag.count} 篇文档中移除该标签，文档本身保留。`
                        : '该标签没有被任何文档使用。'
                    }
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => removeTag(tag)}
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`删除标签 ${tag.name}`}
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
          title={query ? '没有匹配的文档标签' : '文档标签还是空的'}
          description={
            query
              ? '换一个关键词试试，或者清空搜索查看全部标签。'
              : '编辑文档时添加标签，它们会自动汇总到这里。'
          }
          action={
            query ? (
              <Button onClick={() => setQuery('')}>清空搜索</Button>
            ) : (
              <Button type="primary" onClick={() => window.history.back()}>
                返回上一页
              </Button>
            )
          }
        />
      )}

      <Modal
        open={Boolean(renameTarget)}
        title={`重命名标签「${renameTarget?.name || ''}」`}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={rename}
        onCancel={() => setRenameTarget(null)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark="optional">
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
            <Input maxLength={50} showCount placeholder="输入新的标签名称" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
