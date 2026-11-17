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
  BranchesOutlined,
  EditOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { qkApi } from '../api'
import { formatDate } from '../../../utils'
import Markdown from '../../../components/Markdown'
import TagPill from '../../../components/TagPill'
import EmptyStateFallback from '../../../components/EmptyState'

export default function QuestionViewDrawer({
  open,
  questionId,
  onClose,
  onEdit,
  onChanged,
  onOpenRelations,
  onOpenKnowledgeRelations,
}) {
  const { message } = AntApp.useApp()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!open || !questionId) return undefined
    let alive = true
    setLoading(true)
    setDetail(null)
    qkApi
      .getQuestion(questionId)
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
  }, [open, questionId, reloadToken, message])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={780}
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
          <div className="qk-relation-entries">
            <button
              type="button"
              className="qk-relation-entry"
              onClick={() => onOpenRelations?.(detail)}
            >
              <BranchesOutlined />
              <span>
                <strong>习题关系</strong>
                <small>{detail.relation_count} 条关联</small>
              </span>
            </button>
            <button
              type="button"
              className="qk-relation-entry"
              onClick={() => onOpenKnowledgeRelations?.(detail)}
            >
              <LinkOutlined />
              <span>
                <strong>习题知识关系</strong>
                <small>{detail.knowledge_relation_count} 条关联</small>
              </span>
            </button>
          </div>

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

          <section className="catalog-section">
            <h3>我的答案（{detail.answers.length}）</h3>
            {detail.answers.length ? (
              detail.answers.map((answer, index) => (
                <div className="qk-answer-card" key={answer.id}>
                  <div className="qk-answer-head">答案 {index + 1}</div>
                  <Markdown value={answer.content} empty="这份答案还是空的。" />
                  {answer.thoughts.length ? (
                    <div className="qk-thought-view">
                      <div className="qk-answer-subhead">思维链</div>
                      {answer.thoughts.map((thought, tIndex) => (
                        <div className="qk-thought-view-item" key={thought.id}>
                          <span>思考 {tIndex + 1}</span>
                          <Markdown value={thought.content} empty="未填写。" />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="muted-text">还没有记录答案。</p>
            )}
          </section>

          <section className="catalog-section">
            <h3>参考答案（{detail.ref_answers.length}）</h3>
            {detail.ref_answers.length ? (
              detail.ref_answers.map((item, index) => (
                <div className="qk-answer-card" key={item.id}>
                  <div className="qk-answer-head">参考答案 {index + 1}</div>
                  <Markdown value={item.content} empty="未填写参考答案。" />
                </div>
              ))
            ) : (
              <p className="muted-text">还没有参考答案。</p>
            )}
          </section>
        </div>
      ) : (
        <EmptyStateFallback
          icon={<LinkOutlined />}
          title="无法载入这道习题"
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
