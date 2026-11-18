import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Descriptions,
  Drawer,
  Skeleton,
  Space,
  Tag,
} from 'antd'
import {
  EditOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { qkApi } from '../api'
import { formatDate } from '../../../utils'
import Markdown from '../../../components/Markdown'
import TagPill from '../../../components/TagPill'
import EmptyState from '../../../components/EmptyState'
import QkPagedTitleList from './QkPagedTitleList'
import AnswerDetailDrawer from './AnswerDetailDrawer'
import RefAnswerDetailDrawer from './RefAnswerDetailDrawer'
import RelationDetailDrawer from './RelationDetailDrawer'

function flattenRelations(groups = [], graph) {
  return groups.flatMap((group) =>
    group.items.map((item) => ({
      id: item.edge_id,
      title: item.related_title,
      subtitle: `${group.name} · ${item.label}${item.direction === 'in' ? '（反向）' : ''}`,
      graph,
      edge: { ...item, group },
    })),
  )
}

export default function QuestionViewDrawer({
  open,
  questionId,
  onClose,
  onEdit,
  onChanged,
  onOpenRelatedItem,
  onManageRelations,
  onManageKnowledgeRelations,
}) {
  const { message } = AntApp.useApp()
  const [detail, setDetail] = useState(null)
  const [answers, setAnswers] = useState([])
  const [refAnswers, setRefAnswers] = useState([])
  const [questionRelations, setQuestionRelations] = useState([])
  const [knowledgeRelations, setKnowledgeRelations] = useState([])
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [answerId, setAnswerId] = useState(null)
  const [refAnswerId, setRefAnswerId] = useState(null)
  const [relation, setRelation] = useState(null)

  useEffect(() => {
    if (!open || !questionId) return undefined
    let alive = true
    setLoading(true)
    setDetail(null)
    setAnswers([])
    setRefAnswers([])
    setQuestionRelations([])
    setKnowledgeRelations([])
    Promise.all([
      qkApi.getQuestion(questionId),
      qkApi.listAnswers(questionId),
      qkApi.listRefAnswers(questionId),
      qkApi.questionRelations(questionId),
      qkApi.questionKnowledgeRelations(questionId),
    ])
      .then(([question, answerData, refData, questionRel, knowledgeRel]) => {
        if (!alive) return
        setDetail(question)
        setAnswers(answerData.answers || [])
        setRefAnswers(refData.ref_answers || [])
        setQuestionRelations(
          flattenRelations(questionRel.groups || [], 'question'),
        )
        setKnowledgeRelations(
          flattenRelations(knowledgeRel.groups || [], 'question_knowledge'),
        )
      })
      .catch((error) => {
        if (alive) message.error(error.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open, questionId, reloadToken, message])

  const reload = () => {
    setReloadToken((token) => token + 1)
    onChanged?.()
  }

  const openQuestion = () => {
    setAnswerId(null)
    setRefAnswerId(null)
    setRelation(null)
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={820}
      className="catalog-detail-drawer"
      title={
        <div className="drawer-heading">
          <span className="drawer-heading-kicker">习题详情</span>
          <span className="drawer-heading-title">{detail?.title || '载入中'}</span>
        </div>
      }
      extra={
        detail ? (
          <Space>
            {onEdit ? (
              <Button icon={<EditOutlined />} onClick={() => onEdit(detail)}>
                编辑
              </Button>
            ) : null}
            <Button
              icon={<ReloadOutlined />}
              onClick={() => setReloadToken((token) => token + 1)}
            />
          </Space>
        ) : null
      }
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : detail ? (
        <div className="catalog-detail qk-detail">
          <div className="catalog-detail-head">
            <h2>{detail.title}</h2>
            <div className="catalog-detail-tag-row">
              {detail.node_type_name ? <Tag>{detail.node_type_name}</Tag> : null}
              {detail.domain_type_name ? <Tag>{detail.domain_type_name}</Tag> : null}
              {detail.tags.map((tag) => (
                <TagPill key={tag} name={tag} size="sm" />
              ))}
            </div>
          </div>

          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label="创建时间">
              {formatDate(detail.created_at)}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {formatDate(detail.updated_at)}
            </Descriptions.Item>
          </Descriptions>

          <section className="catalog-section">
            <h3>问题</h3>
            <Markdown value={detail.content} empty="还没有填写题目内容。" />
          </section>

          <div className="qk-detail-sections">
            <QkPagedTitleList
              eyebrow="MY ANSWERS"
              title="我的答案"
              rows={answers.map((item) => ({
                id: item.answer_id,
                title: item.title,
                subtitle: `更新于 ${formatDate(item.updated_at)}`,
              }))}
              emptyText="还没有我的答案。"
              onItemClick={(row) => setAnswerId(row.id)}
            />
            <QkPagedTitleList
              eyebrow="REFERENCE ANSWERS"
              title="参考答案"
              rows={refAnswers.map((item) => ({
                id: item.ref_answer_id,
                title: item.title,
                subtitle: `创建于 ${formatDate(item.created_at)}`,
              }))}
              emptyText="还没有参考答案。"
              onItemClick={(row) => setRefAnswerId(row.id)}
            />
            <QkPagedTitleList
              eyebrow="QUESTION RELATIONS"
              title="习题关系"
              rows={questionRelations}
              emptyText="还没有习题关系。"
              manageLabel="关系管理"
              onManage={onManageRelations}
              onItemClick={(row) =>
                setRelation({ graph: row.graph, edgeId: row.id })
              }
            />
            <QkPagedTitleList
              eyebrow="QUESTION ↔ KNOWLEDGE"
              title="习题知识关系"
              rows={knowledgeRelations}
              emptyText="还没有习题知识关系。"
              manageLabel="关系管理"
              onManage={onManageKnowledgeRelations}
              onItemClick={(row) =>
                setRelation({ graph: row.graph, edgeId: row.id })
              }
            />
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<LinkOutlined />}
          title="无法载入这道习题"
          description="它可能已被删除，或后端服务暂时不可用。"
          action={
            <Button icon={<ReloadOutlined />} onClick={reload}>
              重新载入
            </Button>
          }
        />
      )}

      <AnswerDetailDrawer
        open={Boolean(answerId)}
        questionId={questionId}
        answerId={answerId}
        questionTitle={detail?.title}
        onClose={() => setAnswerId(null)}
        onOpenQuestion={openQuestion}
      />
      <RefAnswerDetailDrawer
        open={Boolean(refAnswerId)}
        questionId={questionId}
        refAnswerId={refAnswerId}
        questionTitle={detail?.title}
        onClose={() => setRefAnswerId(null)}
        onOpenQuestion={openQuestion}
      />
      <RelationDetailDrawer
        open={Boolean(relation)}
        graph={relation?.graph}
        edgeId={relation?.edgeId}
        onClose={() => setRelation(null)}
        onChanged={reload}
        onOpenRelatedItem={onOpenRelatedItem}
      />
    </Drawer>
  )
}
