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
  SearchOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { docApi } from '../api'
import { navigate } from '../../../router'
import { tagTone } from '../../../utils'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'
import EllipsisText from '../../../components/EllipsisText'

export default function NoteTagsPage() {
  const { message } = AntApp.useApp()
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('count')
  const [cleaning, setCleaning] = useState(false)
  const [renameTarget, setRenameTarget] = useState(null)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const loadTags = async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const data = await docApi.listNoteTags({ sort: 'count' })
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
  }, [])

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
      const result = await docApi.cleanupNoteTags()
      message.success(
        result.deleted
          ? `已清理 ${result.deleted} 个孤立笔记标签`
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
    navigate(`/docs/notes/tags/${encodeURIComponent(tag.name)}`)
  }

  const openRename = (tag) => {
    setRenameTarget(tag)
    form.setFieldsValue({ name: tag.name })
  }

  const rename = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      await docApi.renameNoteTag(renameTarget.id, values)
      message.success('笔记标签已重命名')
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
      const result = await docApi.removeNoteTag(tag.id)
      message.success(
        tag.count
          ? `已删除标签「${tag.name}」，并从 ${tag.count} 条笔记中移除`
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
    <div className="page doc-tags-page note-tags-page">
      <PageHeader
        eyebrow="NOTE TAGS"
        title="笔记标签管理"
        description="笔记使用独立的三表标签词库（note_tags + note_tag_links + book_notes），与文档标签、记录标签、计划标签互不影响。"
        extra={
          <Popconfirm
            title={`清理 ${orphanCount} 个孤立笔记标签？`}
            description="只删除不再被任何笔记使用的标签，不影响笔记内容。"
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
          标签保存在 docs.db；重命名会同步到所有关联笔记。
        </div>
      </div>

      <div className="doc-tag-toolbar">
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<SearchOutlined className="input-prefix" />}
          placeholder="模糊搜索笔记标签"
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
              title={tag.count ? `筛选包含 #${tag.name} 的笔记` : undefined}
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
                <span>{tag.count ? `${tag.count} 条笔记` : '暂未被使用'}</span>
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
                        ? `会从 ${tag.count} 条笔记中移除该标签，笔记本身保留。`
                        : '该标签没有被任何笔记使用。'
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
          title={query ? '没有匹配的笔记标签' : '笔记标签还是空的'}
          description={
            query
              ? '换一个关键词试试，或者清空搜索查看全部标签。'
              : '编辑笔记时添加标签，它们会自动汇总到这里。'
          }
          action={
            query ? (
              <Button onClick={() => setQuery('')}>清空搜索</Button>
            ) : (
              <Button type="primary" onClick={() => navigate('/docs/notes')}>
                返回笔记列表
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
