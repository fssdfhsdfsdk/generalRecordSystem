import React, { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  Card,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import {
  BranchesOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FilterOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { qkApi } from '../api'
import { navigate } from '../../../router'
import { formatShortDate } from '../../../utils'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'
import TagPill from '../../../components/TagPill'
import TitleText from '../../../components/TitleText'
import {
  DIFFICULTY_OPTIONS,
  difficultyColor,
} from '../qkMeta'
import KnowledgeFormDrawer from '../components/KnowledgeFormDrawer'
import KnowledgeViewDrawer from '../components/KnowledgeViewDrawer'
import QuestionFormDrawer from '../components/QuestionFormDrawer'
import QuestionViewDrawer from '../components/QuestionViewDrawer'
import RelationDrawer from '../components/RelationDrawer'

const SORT_OPTIONS = [
  { value: 'updated_desc', label: '最近更新' },
  { value: 'created_desc', label: '最近创建' },
  { value: 'title_asc', label: '标题 A-Z' },
  { value: 'difficulty_desc', label: '难度从高到低' },
]

const typeOptions = (list = []) =>
  list.map((item) => ({ value: item.id, label: item.name }))

function toggleValue(list, value) {
  const key = String(value).toLocaleLowerCase()
  return list.some((item) => String(item).toLocaleLowerCase() === key)
    ? list.filter((item) => String(item).toLocaleLowerCase() !== key)
    : [...list, value]
}

export default function KnowledgeListPage({ initialTags = [], initialFocus }) {
  const { message } = AntApp.useApp()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [contentQ, setContentQ] = useState('')
  const [tagQ, setTagQ] = useState('')
  const [tags, setTags] = useState(initialTags)
  const [nodeTypeId, setNodeTypeId] = useState(undefined)
  const [domainTypeId, setDomainTypeId] = useState(undefined)
  const [difficulty, setDifficulty] = useState(undefined)
  const [sort, setSort] = useState('updated_desc')
  const [tagOptions, setTagOptions] = useState([])
  const [nodeTypes, setNodeTypes] = useState([])
  const [domainTypes, setDomainTypes] = useState([])
  const [reloadToken, setReloadToken] = useState(0)
  const [detailId, setDetailId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [relation, setRelation] = useState(null)
  const [relatedView, setRelatedView] = useState(null)
  const [relatedEdit, setRelatedEdit] = useState(null)

  const initialKey = initialTags.join('\u0000')
  useEffect(() => {
    setTags(initialTags)
    if (initialFocus) setDetailId(Number(initialFocus) || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey, initialFocus])

  useEffect(() => {
    Promise.all([
      qkApi.listTags({ sort: 'count' }),
      qkApi.listTypes('knowledge_node'),
      qkApi.listTypes('knowledge_domain'),
    ])
      .then(([tagsData, nodeData, domainData]) => {
        setTagOptions(tagsData.tags)
        setNodeTypes(nodeData.types)
        setDomainTypes(domainData.types)
      })
      .catch((error) => message.error(error.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken])

  useEffect(() => {
    let alive = true
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await qkApi.listKnowledge({
          q,
          content_q: contentQ,
          tag_q: tagQ,
          tags: tags.join(','),
          node_type_id: nodeTypeId,
          domain_type_id: domainTypeId,
          difficulty_min: difficulty,
          difficulty_max: difficulty,
          sort,
          limit: 500,
        })
        if (alive) setItems(data.knowledge)
      } catch (error) {
        if (alive) {
          message.error(error.message)
          setItems([])
        }
      } finally {
        if (alive) setLoading(false)
      }
    }, 200)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [q, contentQ, tagQ, tags, nodeTypeId, domainTypeId, difficulty, sort, reloadToken, message])

  const filterCount =
    (q ? 1 : 0) +
    (contentQ ? 1 : 0) +
    (tagQ ? 1 : 0) +
    tags.length +
    (nodeTypeId ? 1 : 0) +
    (domainTypeId ? 1 : 0) +
    (difficulty ? 1 : 0) +
    (sort !== 'updated_desc' ? 1 : 0)

  const resetFilters = () => {
    setQ('')
    setContentQ('')
    setTagQ('')
    setTags([])
    setNodeTypeId(undefined)
    setDomainTypeId(undefined)
    setDifficulty(undefined)
    setSort('updated_desc')
  }

  const remove = async (item) => {
    try {
      await qkApi.removeKnowledge(item.id)
      message.success('知识已删除')
      setDetailId(null)
      setReloadToken((token) => token + 1)
    } catch (error) {
      message.error(error.message)
    }
  }

  const openForm = (item = null) => {
    setEditing(item)
    setFormOpen(true)
  }

  const openRelation = (item, graph, nodeKind = 'knowledge') =>
    setRelation({ graph, nodeId: item.id, nodeKind, title: item.title })

  const columns = useMemo(
    () => [
      {
        title: '知识',
        dataIndex: 'title',
        key: 'title',
        width: 360,
        render: (_, record) => (
          <div className="catalog-name-cell">
            <button
              type="button"
              className="table-title-button"
              onClick={() => setDetailId(record.id)}
            >
              <TitleText text={record.title} maxChars={42} />
            </button>
            {record.summary ? (
              <Tooltip title={record.summary}>
                <div className="qk-list-summary">
                  <TitleText text={record.summary} maxChars={52} />
                </div>
              </Tooltip>
            ) : null}
            <div className="catalog-name-tag-row">
              {record.node_type_name ? (
                <TagPill name={record.node_type_name} size="sm" />
              ) : null}
              {record.domain_type_name ? (
                <TagPill name={record.domain_type_name} size="sm" />
              ) : null}
              {record.tags.map((tag) => (
                <TagPill
                  key={tag}
                  name={tag}
                  size="sm"
                  active={tags.includes(tag)}
                  onClick={(name) => setTags((current) => toggleValue(current, name))}
                />
              ))}
            </div>
            <div className="qk-list-links">
              <button
                type="button"
                onClick={() => openRelation(record, 'knowledge')}
              >
                <BranchesOutlined /> 知识关系 {record.relation_count}
              </button>
              <button
                type="button"
                onClick={() => openRelation(record, 'question_knowledge', 'knowledge')}
              >
                <LinkOutlined /> 关联习题 {record.question_relation_count}
              </button>
            </div>
          </div>
        ),
      },
      {
        title: '难度',
        dataIndex: 'difficulty',
        key: 'difficulty',
        width: 120,
        render: (value) => (
          <Tag color={difficultyColor(value)} bordered={false}>
            {DIFFICULTY_OPTIONS.find((item) => item.value === value)?.label || value}
          </Tag>
        ),
      },
      {
        title: '更新',
        dataIndex: 'updated_at',
        key: 'updated_at',
        width: 120,
        responsive: ['lg'],
        render: (value) => (
          <span className="muted-text">{formatShortDate(value)}</span>
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 112,
        render: (_, record) => (
          <Space size={2}>
            <Tooltip title="查看">
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => setDetailId(record.id)}
              />
            </Tooltip>
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => openForm(record)}
              />
            </Tooltip>
            <Popconfirm
              title="删除这条知识？"
              description="知识的关系边会一起移除。"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => remove(record)}
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [tags],
  )

  return (
    <div className="page catalog-page qk-page">
      <PageHeader
        eyebrow="KNOWLEDGE MANAGEMENT"
        title="知识管理"
        description="沉淀概念、原理、技能与长文；记录我的理解、参考来源，并用关系构建知识图谱。"
        extra={
          <Space wrap>
            <Button
              icon={<BranchesOutlined />}
              onClick={() => navigate('/qk/knowledge-relations')}
            >
              知识关系管理
            </Button>
            <Button
              icon={<SettingOutlined />}
              onClick={() => navigate('/qk/knowledge-node-types')}
            >
              节点类型
            </Button>
            <Button
              icon={<TagsOutlined />}
              onClick={() => navigate('/qk/tags')}
            >
              标签管理
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>
              新建知识
            </Button>
          </Space>
        }
      />

      <Card className="toolbar-card catalog-filter-card" styles={{ body: { padding: 16 } }}>
        <div className="catalog-filter-grid">
          <Input
            allowClear
            value={q}
            onChange={(event) => setQ(event.target.value)}
            prefix={<SearchOutlined className="input-prefix" />}
            placeholder="搜索知识标题"
          />
          <Input
            allowClear
            value={contentQ}
            onChange={(event) => setContentQ(event.target.value)}
            prefix={<SearchOutlined className="input-prefix" />}
            placeholder="搜索摘要、知识或理解"
          />
          <Input
            allowClear
            value={tagQ}
            onChange={(event) => setTagQ(event.target.value)}
            prefix={<SearchOutlined className="input-prefix" />}
            placeholder="标签模糊搜索（空格 AND）"
          />
          <Select
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            value={tags}
            onChange={setTags}
            showSearch
            filterOption={(input, option) =>
              String(option?.label ?? '')
                .toLocaleLowerCase()
                .includes(input.trim().toLocaleLowerCase())
            }
            options={tagOptions.map((tag) => ({
              value: tag.name,
              label: `#${tag.name} (${tag.count})`,
            }))}
            placeholder="标签（AND）"
            suffixIcon={<FilterOutlined />}
          />
          <Select
            allowClear
            value={nodeTypeId}
            onChange={setNodeTypeId}
            options={typeOptions(nodeTypes)}
            placeholder="节点类型"
          />
          <Select
            allowClear
            value={domainTypeId}
            onChange={setDomainTypeId}
            options={typeOptions(domainTypes)}
            placeholder="领域类型"
          />
          <Select
            allowClear
            value={difficulty}
            onChange={setDifficulty}
            options={DIFFICULTY_OPTIONS}
            placeholder="难度系数"
          />
          <Select
            value={sort}
            onChange={setSort}
            options={SORT_OPTIONS}
            className="catalog-filter-sort"
          />
          <Tooltip title="刷新">
            <Button
              icon={<ReloadOutlined spin={loading} />}
              onClick={() => setReloadToken((token) => token + 1)}
            />
          </Tooltip>
        </div>
      </Card>

      <div className="catalog-list-summary">
        <span>
          共 <strong>{items.length}</strong> 条知识
        </span>
        <span className="muted-text">
          摘要会显示在列表中；tooltip 可查看完整摘要。
        </span>
      </div>

      {!loading && !items.length ? (
        <EmptyState
          icon={<BranchesOutlined />}
          title={filterCount ? '没有匹配的知识' : '还没有知识'}
          description={
            filterCount
              ? '试试减少筛选条件，或者清空搜索。'
              : '先记录一条概念，再逐步补上理解、参考来源和关系。'
          }
          action={
            <Space>
              {filterCount ? <Button onClick={resetFilters}>清空筛选</Button> : null}
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>
                新建知识
              </Button>
            </Space>
          }
        />
      ) : (
        <Table
          className="catalog-table"
          rowKey="id"
          loading={loading}
          dataSource={items}
          columns={columns}
          scroll={{ x: 900 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (total) => `共 ${total} 条知识`,
          }}
        />
      )}

      <KnowledgeViewDrawer
        open={Boolean(detailId)}
        knowledgeId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(detail) => {
          setDetailId(null)
          openForm(detail)
        }}
        onOpenRelatedItem={(kind, id) =>
          setRelatedView({
            kind: kind === 'question' ? 'question' : 'knowledge',
            id,
          })
        }
        onManageRelations={() => navigate('/qk/knowledge-relations')}
        onManageQuestionRelations={() =>
          navigate('/qk/question-knowledge-relations')
        }
      />
      <KnowledgeFormDrawer
        open={formOpen}
        knowledge={editing}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSaved={() => setReloadToken((token) => token + 1)}
      />
      <RelationDrawer
        open={Boolean(relation)}
        graph={relation?.graph}
        nodeId={relation?.nodeId}
        nodeKind={relation?.nodeKind}
        title={relation?.title}
        onClose={() => setRelation(null)}
        onViewItem={(kind, id) =>
          setRelatedView({ kind: kind === 'question' ? 'question' : 'knowledge', id })
        }
        onEditItem={(kind, id) =>
          setRelatedEdit({ kind: kind === 'question' ? 'question' : 'knowledge', id })
        }
        onChanged={() => setReloadToken((token) => token + 1)}
      />
      {relatedView?.kind === 'question' ? (
        <QuestionViewDrawer
          open
          questionId={relatedView.id}
          onClose={() => setRelatedView(null)}
          onEdit={(item) => {
            setRelatedView(null)
            setRelatedEdit({ kind: 'question', id: item.id })
          }}
          onOpenRelatedItem={(kind, id) =>
            setRelatedView({
              kind: kind === 'question' ? 'question' : 'knowledge',
              id,
            })
          }
          onManageRelations={() => navigate('/qk/question-relations')}
          onManageKnowledgeRelations={() =>
            navigate('/qk/question-knowledge-relations')
          }
        />
      ) : null}
      {relatedView?.kind === 'knowledge' ? (
        <KnowledgeViewDrawer
          open
          knowledgeId={relatedView.id}
          onClose={() => setRelatedView(null)}
          onEdit={(item) => {
            setRelatedView(null)
            setRelatedEdit({ kind: 'knowledge', id: item.id })
          }}
          onOpenRelatedItem={(kind, id) =>
            setRelatedView({
              kind: kind === 'question' ? 'question' : 'knowledge',
              id,
            })
          }
          onManageRelations={() => navigate('/qk/knowledge-relations')}
          onManageQuestionRelations={() =>
            navigate('/qk/question-knowledge-relations')
          }
        />
      ) : null}
      {relatedEdit?.kind === 'question' ? (
        <QuestionFormDrawer
          open
          question={{ id: relatedEdit.id }}
          onClose={() => setRelatedEdit(null)}
          onSaved={() => setReloadToken((token) => token + 1)}
        />
      ) : null}
      {relatedEdit?.kind === 'knowledge' ? (
        <KnowledgeFormDrawer
          open
          knowledge={{ id: relatedEdit.id }}
          onClose={() => setRelatedEdit(null)}
          onSaved={() => setReloadToken((token) => token + 1)}
        />
      ) : null}
    </div>
  )
}
