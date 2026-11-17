import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Drawer,
  Skeleton,
  Space,
} from 'antd'
import { EditOutlined, ReloadOutlined } from '@ant-design/icons'
import { qkApi } from '../api'
import { formatDate } from '../../../utils'
import EmptyState from '../../../components/EmptyState'

export default function RefAnswerListDrawer({
  open,
  questionId,
  questionTitle,
  onClose,
  onOpenRefAnswer,
  onOpenQuestion,
}) {
  const { message } = AntApp.useApp()
  const [answers, setAnswers] = useState([])
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!open || !questionId) return undefined
    let alive = true
    setLoading(true)
    qkApi
      .listRefAnswers(questionId)
      .then((data) => {
        if (alive) setAnswers(data.ref_answers)
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
      width={560}
      title={
        <div className="drawer-heading">
          <span className="drawer-heading-kicker">参考答案</span>
          <span className="drawer-heading-title">{questionTitle || '答案列表'}</span>
        </div>
      }
      extra={
        <Space>
          {onOpenQuestion ? (
            <Button icon={<EditOutlined />} onClick={onOpenQuestion}>
              查看习题
            </Button>
          ) : null}
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setReloadToken((token) => token + 1)}
          />
        </Space>
      }
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : answers.length ? (
        <div className="qk-answer-list">
          {answers.map((item) => (
            <button
              type="button"
              className="qk-answer-list-row"
              key={item.ref_answer_id}
              onClick={() => onOpenRefAnswer?.(item.ref_answer_id)}
            >
              <span className="qk-answer-list-title">{item.title}</span>
              <small>创建于 {formatDate(item.created_at)}</small>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title="还没有参考答案"
          description="在习题编辑抽屉中可以添加参考答案与我的想法。"
          action={
            onOpenQuestion ? (
              <Button type="primary" onClick={onOpenQuestion}>
                编辑习题
              </Button>
            ) : null
          }
        />
      )}
    </Drawer>
  )
}
