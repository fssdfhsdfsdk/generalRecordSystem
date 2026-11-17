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
import {
  BranchesOutlined,
  EditOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { qkApi } from '../api'
import { DIFFICULTY_OPTIONS, difficultyColor } from '../qkMeta'
import { formatDate } from '../../../utils'
import Markdown from '../../../components/Markdown'
import TagPill from '../../../components/TagPill'
import EmptyState from '../../../components/EmptyState'

const difficultyLabel = (value) =>
  DIFFICULTY_OPTIONS.find((item) => item.value === value)?.label || `难度 ${value}`

export default function KnowledgeViewDrawer({
  open,
  knowledgeId,
  onClose,
  onEdit,
  onChanged,
  onOpenRelations,
  onOpenQuestionRelations,
}) {
  const { message } = AntApp.useApp()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!open || !knowledgeId) return undefined
    let alive = true
    setLoading(true)
    setDetail(null)
    qkApi
      .getKnowledge(knowledgeId)
      .then((data) => {
        if (alive) setDetail(data)
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

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={780}
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
          <div className="qk-relation-entries">
            <button
              type="button"
              className="qk-relation-entry"
              onClick={() => onOpenRelations?.(detail)}
            >
              <BranchesOutlined />
              <span>
                <strong>知识关系</strong>
                <small>{detail.relation_count} 条关联</small>
              </span>
            </button>
            <button
              type="button"
              className="qk-relation-entry"
              onClick={() => onOpenQuestionRelations?.(detail)}
            >
              <LinkOutlined />
              <span>
                <strong>关联习题</strong>
                <small>{detail.question_relation_count} 道习题</small>
              </span>
            </button>
          </div>

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
        </div>
      ) : (
        <EmptyState
          icon={<LinkOutlined />}
          title="无法载入这条知识"
          description="它可能已被删除，或后端服务暂时不可用。"
          action={
            <Button
              icon={<ReloadOutlined />}
              onClick={() => setReloadToken((token) => token + 1)}
            >
              重新载入
            </Button>
          }
        />
      )}
    </Drawer>
  )
}
