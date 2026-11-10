import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Drawer,
  Popconfirm,
  Skeleton,
  Space,
  Tooltip,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { docApi } from '../api'
import { navigate } from '../../../router'
import EmptyState from '../../../components/EmptyState'
import DocDetailBody from './DocDetailBody'

export default function DocViewDrawer({
  open,
  documentId,
  onClose,
  onDeleted,
}) {
  const { message } = AntApp.useApp()
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!open || !documentId) return undefined
    let alive = true
    setLoading(true)
    setError('')
    setDoc(null)
    docApi
      .get(documentId)
      .then((data) => {
        if (alive) setDoc(data)
      })
      .catch((err) => {
        if (alive) {
          setError(err.message)
          message.error(err.message)
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open, documentId, reloadToken, message])

  const edit = () => {
    onClose()
    navigate(`/docs/${documentId}/edit`)
  }

  const remove = async () => {
    try {
      await docApi.remove(doc.id)
      message.success('文档已删除')
      onClose()
      onDeleted?.()
    } catch (err) {
      message.error(err.message)
    }
  }

  const filterByTag = (tag) => {
    onClose()
    navigate(`/docs/tags/${encodeURIComponent(tag)}`)
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="100%"
      rootClassName="doc-view-drawer-root"
      className="doc-view-drawer"
      title={
        <div className="drawer-heading">
          <span className="drawer-heading-kicker">文档详情</span>
          <span className="drawer-heading-title">
            {doc?.title || '载入中'}
          </span>
        </div>
      }
      extra={
        doc ? (
          <Space>
            <Button icon={<EditOutlined />} onClick={edit}>
              编辑
            </Button>
            <Popconfirm
              title="删除这篇文档？"
              description="阅读笔记、感想与历史会一起删除，且不可恢复。"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={remove}
            >
              <Button danger type="text" icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
            <Tooltip title="刷新">
              <Button
                icon={<ReloadOutlined />}
                onClick={() => setReloadToken((token) => token + 1)}
              />
            </Tooltip>
          </Space>
        ) : null
      }
    >
      {loading ? (
        <div className="drawer-loading">
          <Skeleton active paragraph={{ rows: 3 }} />
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      ) : error || !doc ? (
        <EmptyState
          icon={<LinkOutlined />}
          title="无法载入这篇文档"
          description="它可能已被删除，或后端服务暂时不可用。"
          action={
            <Button
              type="primary"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              重新载入
            </Button>
          }
        />
      ) : (
        <DocDetailBody
          doc={doc}
          onTagClick={filterByTag}
          onEdit={edit}
        />
      )}
    </Drawer>
  )
}
