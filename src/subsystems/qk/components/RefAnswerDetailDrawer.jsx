import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Descriptions,
  Drawer,
  Skeleton,
  Space,
} from 'antd'
import { LinkOutlined, ReloadOutlined } from '@ant-design/icons'
import { qkApi } from '../api'
import { formatDate } from '../../../utils'
import Markdown from '../../../components/Markdown'
import EmptyState from '../../../components/EmptyState'

export default function RefAnswerDetailDrawer({
  open,
  questionId,
  refAnswerId,
  questionTitle,
  onClose,
  onOpenQuestion,
}) {
  const { message } = AntApp.useApp()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!open || !questionId || !refAnswerId) return undefined
    let alive = true
    setLoading(true)
    setDetail(null)
    qkApi
      .getRefAnswer(questionId, refAnswerId)
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
  }, [open, questionId, refAnswerId, reloadToken, message])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={720}
      className="catalog-detail-drawer"
      title={
        <div className="drawer-heading">
          <span className="drawer-heading-kicker">参考答案详情</span>
          <span className="drawer-heading-title">{detail?.title || '载入中'}</span>
        </div>
      }
      extra={
        detail ? (
          <Space>
            {onOpenQuestion ? (
              <Button icon={<LinkOutlined />} onClick={onOpenQuestion}>
                查看所属习题
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
          {questionTitle ? (
            <button
              type="button"
              className="qk-detail-link"
              onClick={onOpenQuestion}
            >
              <LinkOutlined /> 所属习题：{questionTitle}
            </button>
          ) : null}

          <div className="catalog-detail-head">
            <h2>{detail.title}</h2>
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
            <h3>参考答案</h3>
            <Markdown value={detail.content} empty="未填写参考答案。" />
          </section>
          <section className="catalog-section">
            <h3>我的想法</h3>
            <Markdown value={detail.idea} empty="还没有写下想法。" />
          </section>
        </div>
      ) : (
        <EmptyState title="无法载入这份参考答案" description="它可能已被删除。" />
      )}
    </Drawer>
  )
}
