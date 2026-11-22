import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Descriptions,
  Drawer,
  Skeleton,
  Space,
  Tag,
  Tooltip,
} from 'antd'
import { EditOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons'
import { qkApi } from '../api'
import { DIFFICULTY_OPTIONS, difficultyColor } from '../qkMeta'
import { formatDate } from '../../../utils'
import Markdown from '../../../components/Markdown'
import TagPill from '../../../components/TagPill'
import EmptyState from '../../../components/EmptyState'
import QkPagedTitleList from './QkPagedTitleList'
import RelationDetailDrawer from './RelationDetailDrawer'
import RelationCreateDrawer from './RelationCreateDrawer'

const difficultyLabel = (value) =>
  DIFFICULTY_OPTIONS.find((item) => item.value === value)?.label || `难度 ${value}`

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

export default function KnowledgeViewDrawer({
  open,
  knowledgeId,
  onClose,
  onEdit,
  onChanged,
  onOpenRelatedItem,
  onManageRelations,
  onManageQuestionRelations,
}) {
  const { message } = AntApp.useApp()
  const [detail, setDetail] = useState(null)
  const [knowledgeRelations, setKnowledgeRelations] = useState([])
  const [questionRelations, setQuestionRelations] = useState([])
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [relation, setRelation] = useState(null)
  const [relationCreate, setRelationCreate] = useState(null)

  useEffect(() => {
    if (!open || !knowledgeId) return undefined
    let alive = true
    setLoading(true)
    setDetail(null)
    setKnowledgeRelations([])
    setQuestionRelations([])
    Promise.all([
      qkApi.getKnowledge(knowledgeId),
      qkApi.knowledgeRelations(knowledgeId),
      qkApi.knowledgeQuestionRelations(knowledgeId),
    ])
      .then(([knowledge, knowledgeRel, questionRel]) => {
        if (!alive) return
        setDetail(knowledge)
        setKnowledgeRelations(flattenRelations(knowledgeRel.groups || [], 'knowledge'))
        setQuestionRelations(
          flattenRelations(questionRel.groups || [], 'question_knowledge'),
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
  }, [open, knowledgeId, reloadToken, message])

  const reload = () => {
    setReloadToken((token) => token + 1)
    onChanged?.()
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={820}
      className="catalog-detail-drawer"
      title={
        <div className="drawer-heading">
          <span className="drawer-heading-kicker">知识详情</span>
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
          {detail.summary ? (
            <div className="qk-summary-preview">
              <span>核心摘要</span>
              {detail.summary}
            </div>
          ) : null}

          <div className="catalog-detail-head">
            <h2>{detail.title}</h2>
            <div className="catalog-detail-tag-row">
              {detail.node_type_name ? <Tag>{detail.node_type_name}</Tag> : null}
              {detail.domain_type_name ? <Tag>{detail.domain_type_name}</Tag> : null}
              <Tooltip title="难度系数">
                <Tag color={difficultyColor(detail.difficulty)}>
                  {difficultyLabel(detail.difficulty)}
                </Tag>
              </Tooltip>
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
            <h3>知识</h3>
            <Markdown value={detail.content} empty="还没有填写知识内容。" />
          </section>
          <section className="catalog-section">
            <h3>我的理解</h3>
            <Markdown value={detail.understanding} empty="还没有写下自己的理解。" />
          </section>
          <section className="catalog-section">
            <h3>参考来源</h3>
            <Markdown value={detail.references} empty="还没有记录参考来源。" />
          </section>

          <div className="qk-detail-sections">
            <QkPagedTitleList
              eyebrow="KNOWLEDGE RELATIONS"
              title="知识关系"
              rows={knowledgeRelations}
              emptyText="还没有知识关系。"
              onAdd={() =>
                setRelationCreate({
                  graph: 'knowledge',
                  sourceId: knowledgeId,
                  sourceKind: 'knowledge',
                  sourceTitle: detail.title,
                })
              }
              manageLabel="关系管理"
              onManage={onManageRelations}
              onItemClick={(row) =>
                setRelation({ graph: row.graph, edgeId: row.id })
              }
            />
            <QkPagedTitleList
              eyebrow="RELATED QUESTIONS"
              title="关联习题"
              rows={questionRelations}
              emptyText="还没有关联习题。"
              manageLabel="关系管理"
              onManage={onManageQuestionRelations}
              onItemClick={(row) =>
                setRelation({ graph: row.graph, edgeId: row.id })
              }
            />
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<LinkOutlined />}
          title="无法载入这条知识"
          description="它可能已被删除，或后端服务暂时不可用。"
          action={
            <Button icon={<ReloadOutlined />} onClick={reload}>
              重新载入
            </Button>
          }
        />
      )}

      <RelationDetailDrawer
        open={Boolean(relation)}
        graph={relation?.graph}
        edgeId={relation?.edgeId}
        onClose={() => setRelation(null)}
        onChanged={reload}
        onOpenRelatedItem={onOpenRelatedItem}
      />
      <RelationCreateDrawer
        open={Boolean(relationCreate)}
        graph={relationCreate?.graph}
        sourceId={relationCreate?.sourceId}
        sourceKind={relationCreate?.sourceKind}
        sourceTitle={relationCreate?.sourceTitle}
        onClose={() => setRelationCreate(null)}
        onCreated={reload}
      />
    </Drawer>
  )
}
