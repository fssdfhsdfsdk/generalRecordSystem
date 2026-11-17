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
  Tooltip,
} from 'antd'
import {
  BranchesOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
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
import QuestionFormDrawer from '../components/QuestionFormDrawer'
import QuestionViewDrawer from '../components/QuestionViewDrawer'
import KnowledgeFormDrawer from '../components/KnowledgeFormDrawer'
import KnowledgeViewDrawer from '../components/KnowledgeViewDrawer'
import RelationDrawer from '../components/RelationDrawer'
import AnswerListDrawer from '../components/AnswerListDrawer'
import AnswerDetailDrawer from '../components/AnswerDetailDrawer'
import RefAnswerListDrawer from '../components/RefAnswerListDrawer'
import RefAnswerDetailDrawer from '../components/RefAnswerDetailDrawer'

const SORT_OPTIONS = [
  { value: 'updated_desc', label: '最近更新' },
  { value: 'created_desc', label: '最近创建' },
  { value: 'title_asc', label: '标题 A-Z' },
]

const typeOptions = (list = []) =>
  list.map((item) => ({ value: item.id, label: item.name }))

function toggleValue(list, value) {
  const key = String(value).toLocaleLowerCase()
  return list.some((item) => String(item).toLocaleLowerCase() === key)
    ? list.filter((item) => String(item).toLocaleLowerCase() !== key)
    : [...list, value]
}

export default function QuestionListPage({ initialTags = [], initialFocus }) {
  const { message } = AntApp.useApp()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [contentQ, setContentQ] = useState('')
  const [tagQ, setTagQ] = useState('')
  const [tags, setTags] = useState(initialTags)
  const [nodeTypeId, setNodeTypeId] = useState(undefined)
  const [domainTypeId, setDomainTypeId] = useState(undefined)
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
  const [answerListFor, setAnswerListFor] = useState(null)
  const [refListFor, setRefListFor] = useState(null)
  const [answerDetail, setAnswerDetail] = useState(null)
  const [refDetail, setRefDetail] = useState(null)

  const initialKey = initialTags.join('\u0000')
  useEffect(() => {
    setTags(initialTags)
    if (initialFocus) setDetailId(Number(initialFocus) || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey, initialFocus])

  useEffect(() => {
    Promise.all([
      qkApi.listTags({ sort: 'count' }),
      qkApi.listTypes('question_node'),
      qkApi.listTypes('question_domain'),
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
        const data = await qkApi.listQuestions({
          q,
          content_q: contentQ,
          tag_q: tagQ,
          tags: tags.join(','),
          node_type_id: nodeTypeId,
          domain_type_id: domainTypeId,
          sort,
          limit: 500,
        })
        if (alive) setItems(data.questions)
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
  }, [q, contentQ, tagQ, tags, nodeTypeId, domainTypeId, sort, reloadToken, message])

  const filterCount =
    (q ? 1 : 0) +
    (contentQ ? 1 : 0) +
    (tagQ ? 1 : 0) +
    tags.length +
    (nodeTypeId ? 1 : 0) +
    (domainTypeId ? 1 : 0) +
    (sort !== 'updated_desc' ? 1 : 0)

  const resetFilters = () => {
    setQ('')
    setContentQ('')
    setTagQ('')
    setTags([])
    setNodeTypeId(undefined)
    setDomainTypeId(undefined)
    setSort('updated_desc')
  }

  const remove = async (item) => {
    try {
      await qkApi.removeQuestion(item.id)
      message.success('习题已删除')
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

  const openRelation = (item, graph, nodeKind = 'question') => {
    setRelation({ graph, nodeId: item.id, nodeKind, title: item.title })
  }

  const openAnswerList = (item) => {
    setDetailId(null)
    setAnswerListFor({ id: item.id, title: item.title })
  }

  const openRefList = (item) => {
    setDetailId(null)
    setRefListFor({ id: item.id, title: item.title })
  }

  const openQuestionDetail = (questionId) => {
    setAnswerDetail(null)
    setRefDetail(null)
    setAnswerListFor(null)
    setRefListFor(null)
    setDetailId(questionId)
  }

  const openRelatedItem = (kind, id) => {
    if (kind === 'knowledge') setRelatedView({ kind, id })
    else setRelatedView({ kind: 'question', id })
  }

  const editRelatedItem = (kind, id) => {
    if (kind === 'knowledge') setRelatedEdit({ kind, id })
    else setRelatedEdit({ kind: 'question', id })
  }

  const columns = useMemo(
    () => [
      {
        title: '习题',
        dataIndex: 'title',
        key: 'title',
        width: 340,
        render: (_, record) => (
          <div className="catalog-name-cell">
            <button
              type="button"
              className="table-title-button"
              onClick={() => setDetailId(record.id)}
            >
              <TitleText text={record.title} maxChars={42} />
            </button>
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
              <button type="button" onClick={() => openAnswerList(record)}>
                <FileTextOutlined /> 我的答案 {record.answer_count}
              </button>
              <button type="button" onClick={() => openRefList(record)}>
                <CheckCircleOutlined /> 参考答案 {record.ref_answer_count}
              </button>
              <button
                type="button"
                onClick={() => openRelation(record, 'question')}
              >
                <BranchesOutlined /> 习题关系 {record.relation_count}
              </button>
              <button
                type="button"
                onClick={() => openRelation(record, 'question_knowledge')}
              >
                <LinkOutlined /> 知识关系 {record.knowledge_relation_count}
              </button>
            </div>
          </div>
        ),
      },
      {
        title: '我的答案',
        dataIndex: 'answer_count',
        key: 'answer_count',
        width: 90,
        responsive: ['md'],
        render: (value) => <span className="muted-text">{value} 条</span>,
      },
      {
        title: '参考答案',
        dataIndex: 'ref_answer_count',
        key: 'ref_answer_count',
        width: 90,
        responsive: ['lg'],
        render: (value) => <span className="muted-text">{value} 条</span>,
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
              title="删除这道习题？"
              description="答案、思维链和参考答案会一起删除，关系边也会移除。"
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
        eyebrow="QUESTION MANAGEMENT"
        title="习题管理"
        description="维护题目、我的答案与思维链历史、参考答案，以及习题之间的关系。"
        extra={
          <Space wrap>
            <Button
              icon={<BranchesOutlined />}
              onClick={() => navigate('/qk/question-relations')}
            >
              习题关系管理
            </Button>
            <Button
              icon={<LinkOutlined />}
              onClick={() => navigate('/qk/question-knowledge-relations')}
            >
              习题知识关系
            </Button>
            <Button
              icon={<SettingOutlined />}
              onClick={() => navigate('/qk/question-node-types')}
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
              新建习题
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
            placeholder="搜索习题标题"
          />
          <Input
            allowClear
            value={contentQ}
            onChange={(event) => setContentQ(event.target.value)}
            prefix={<SearchOutlined className="input-prefix" />}
            placeholder="搜索题目内容"
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
          共 <strong>{items.length}</strong> 道习题
        </span>
        <span className="muted-text">
          点击题名查看详情；前部区域可直接进入两类关系视图。
        </span>
      </div>

      {!loading && !items.length ? (
        <EmptyState
          icon={<EditOutlined />}
          title={filterCount ? '没有匹配的习题' : '还没有习题'}
          description={
            filterCount
              ? '试试减少筛选条件，或者清空搜索。'
              : '记录第一道题，后续补充答案、思维链和参考答案。'
          }
          action={
            <Space>
              {filterCount ? <Button onClick={resetFilters}>清空筛选</Button> : null}
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>
                新建习题
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
            showTotal: (total) => `共 ${total} 道习题`,
          }}
        />
      )}

      <QuestionViewDrawer
        open={Boolean(detailId)}
        questionId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(detail) => {
          setDetailId(null)
          openForm(detail)
        }}
        onChanged={() => setReloadToken((token) => token + 1)}
        onOpenAnswers={(item) => openAnswerList(item)}
        onOpenRefAnswers={(item) => openRefList(item)}
        onOpenRelations={(item) => {
          setDetailId(null)
          openRelation(item, 'question')
        }}
        onOpenKnowledgeRelations={(item) => {
          setDetailId(null)
          openRelation(item, 'question_knowledge')
        }}
      />
      <QuestionFormDrawer
        open={formOpen}
        question={editing}
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
        onViewItem={openRelatedItem}
        onEditItem={editRelatedItem}
        onChanged={() => setReloadToken((token) => token + 1)}
      />

      {relatedView?.kind === 'question' ? (
        <QuestionViewDrawer
          open
          questionId={relatedView.id}
          onClose={() => setRelatedView(null)}
          onEdit={(item) => {
            setRelatedView(null)
            openForm(item)
          }}
          onOpenAnswers={(item) => {
            setRelatedView(null)
            openAnswerList(item)
          }}
          onOpenRefAnswers={(item) => {
            setRelatedView(null)
            openRefList(item)
          }}
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

      <AnswerListDrawer
        open={Boolean(answerListFor)}
        questionId={answerListFor?.id}
        questionTitle={answerListFor?.title}
        onClose={() => setAnswerListFor(null)}
        onOpenAnswer={(answerId) =>
          setAnswerDetail({
            questionId: answerListFor.id,
            answerId,
            title: answerListFor.title,
          })
        }
        onOpenQuestion={() => openQuestionDetail(answerListFor.id)}
      />
      <AnswerDetailDrawer
        open={Boolean(answerDetail)}
        questionId={answerDetail?.questionId}
        answerId={answerDetail?.answerId}
        questionTitle={answerDetail?.title}
        onClose={() => setAnswerDetail(null)}
        onOpenQuestion={() => openQuestionDetail(answerDetail.questionId)}
      />
      <RefAnswerListDrawer
        open={Boolean(refListFor)}
        questionId={refListFor?.id}
        questionTitle={refListFor?.title}
        onClose={() => setRefListFor(null)}
        onOpenRefAnswer={(refAnswerId) =>
          setRefDetail({
            questionId: refListFor.id,
            refAnswerId,
            title: refListFor.title,
          })
        }
        onOpenQuestion={() => openQuestionDetail(refListFor.id)}
      />
      <RefAnswerDetailDrawer
        open={Boolean(refDetail)}
        questionId={refDetail?.questionId}
        refAnswerId={refDetail?.refAnswerId}
        questionTitle={refDetail?.title}
        onClose={() => setRefDetail(null)}
        onOpenQuestion={() => openQuestionDetail(refDetail.questionId)}
      />
    </div>
  )
}
