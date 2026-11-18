import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Descriptions,
  Drawer,
  Popconfirm,
  Skeleton,
  Space,
  Tag,
  Tooltip,
} from 'antd'
import {
  DeleteOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { qkApi } from '../api'
import { formatDate } from '../../../utils'
import EmptyState from '../../../components/EmptyState'

export default function RelationDetailDrawer({
  open,
  graph,
  edgeId,
  onClose,
  onOpenRelatedItem,
  onChanged,
}) {
  const { message } = AntApp.useApp()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!open || !graph || !edgeId) return undefined
    let alive = true
    setLoading(true)
    setDetail(null)
    qkApi
      .getRelation(graph, edgeId)
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
  }, [open, graph, edgeId, reloadToken, message])

  const remove = async () => {
    try {
      await qkApi.removeRelation(graph, edgeId)
      message.success('关系已删除')
      onChanged?.()
      onClose?.()
    } catch (error) {
      message.error(error.message)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={560}
      className="catalog-detail-drawer"
      title={
        <div className="drawer-heading">
          <span className="drawer-heading-kicker">关系详情</span>
          <span className="drawer-heading-title">{detail?.relation_name || '载入中'}</span>
        </div>
      }
      extra={
        detail ? (
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => setReloadToken((token) => token + 1)}
            />
            <Popconfirm
              title="删除这条关系？"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={remove}
            >
              <Button danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ) : null
      }
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : detail ? (
        <div className="catalog-detail qk-detail">
          <div className="qk-relation-detail-pair">
            <div>
              <span className="muted-text">起点</span>
              <strong>{detail.source_title}</strong>
            </div>
            <Tag color="indigo" bordered={false}>
              {detail.relation_name}
            </Tag>
            <div>
              <span className="muted-text">终点</span>
              <strong>{detail.target_title}</strong>
            </div>
          </div>

          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label="关系编码">{detail.relation_code}</Descriptions.Item>
            <Descriptions.Item label="方向">
              {detail.is_directed ? '有向' : '无向 / 双向等价'}
            </Descriptions.Item>
            <Descriptions.Item label="正向文案">{detail.forward_label || '—'}</Descriptions.Item>
            <Descriptions.Item label="反向文案">{detail.reverse_label || '—'}</Descriptions.Item>
            <Descriptions.Item label="扩展属性">
              {detail.properties && Object.keys(detail.properties).length
                ? JSON.stringify(detail.properties)
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {formatDate(detail.created_at)}
            </Descriptions.Item>
          </Descriptions>

          <div className="qk-detail-links">
            <Tooltip title="从当前习题视角查看关联项">
              <Button
                icon={<LinkOutlined />}
                onClick={() =>
                  onOpenRelatedItem?.(detail.target_kind, detail.target_id)
                }
              >
                查看关联项
              </Button>
            </Tooltip>
            <Button onClick={() => onOpenRelatedItem?.('question', detail.source_id)}>
              查看当前习题
            </Button>
          </div>
        </div>
      ) : (
        <EmptyState title="无法载入这条关系" description="它可能已被删除。" />
      )}
    </Drawer>
  )
}
