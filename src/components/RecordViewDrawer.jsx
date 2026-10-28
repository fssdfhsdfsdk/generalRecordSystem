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
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { api } from '../api'
import { copyText } from '../clipboard'
import { buildRecordMarkdown } from '../recordText'
import { formatDate } from '../utils'
import Markdown from './Markdown'
import TagPill from './TagPill'
import TitleText from './TitleText'
import TypeIcon from './TypeIcon'
import EmptyState from './EmptyState'

export default function RecordViewDrawer({
  open,
  recordId,
  onClose,
  onEdit,
  onDeleted,
}) {
  const { message } = AntApp.useApp()
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!open || !recordId) return undefined
    let alive = true
    setLoading(true)
    setRecord(null)
    api
      .getRecord(recordId)
      .then((data) => {
        if (alive) setRecord(data)
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
  }, [open, recordId, reloadToken, message])

  const handleDelete = async () => {
    if (!record) return
    try {
      await api.deleteRecord(record.id)
      message.success('记录已删除')
      onDeleted?.(record)
      onClose?.()
    } catch (error) {
      message.error(error.message)
    }
  }

  const handleCopyAll = async () => {
    if (!record) return
    try {
      await copyText(buildRecordMarkdown(record))
      message.success('完整记录已复制（Markdown）')
    } catch {
      message.error('复制失败，请检查浏览器的剪贴板权限')
    }
  }

  const handleCopyField = async (field) => {
    if (!String(field.value || '').trim()) {
      message.info('该字段为空，没有可复制的内容')
      return
    }
    try {
      await copyText(field.value)
      message.success(`已复制「${field.name}」`)
    } catch {
      message.error('复制失败，请检查浏览器的剪贴板权限')
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={780}
      className="record-view-drawer"
      title={
        <div className="drawer-heading">
          <span className="drawer-heading-kicker">记录详情</span>
          <span className="drawer-heading-title">{record?.type_name || '载入中'}</span>
        </div>
      }
      extra={
        record ? (
          <Space size={8}>
            <Button
              className="copy-all-button"
              icon={<CopyOutlined />}
              onClick={handleCopyAll}
              aria-label="复制完整记录"
            >
              <span className="copy-all-label">复制全文</span>
            </Button>
            {onEdit ? (
              <Button
                icon={<EditOutlined />}
                onClick={() => onEdit(record)}
                aria-label="编辑记录"
              >
                编辑
              </Button>
            ) : null}
            <Popconfirm
              title="删除这条记录？"
              description="删除后不可恢复，标签本身会保留。"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={handleDelete}
            >
              <Button
                danger
                type="text"
                icon={<DeleteOutlined />}
                aria-label="删除记录"
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        ) : null
      }
    >
      {loading ? (
        <div className="drawer-loading">
          <Skeleton active paragraph={{ rows: 2 }} />
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      ) : record ? (
        <div className="record-view">
          <div className="record-view-head">
            <div className="record-type-line">
              <TypeIcon name={record.type_name} size="sm" />
              <span>{record.type_name}</span>
              <span className="dot-separator">·</span>
              <span>创建于 {formatDate(record.created_at)}</span>
              {record.updated_at !== record.created_at ? (
                <>
                  <span className="dot-separator">·</span>
                  <span>更新于 {formatDate(record.updated_at)}</span>
                </>
              ) : null}
            </div>
            <TitleText
              as="h2"
              className="record-view-title"
              text={record.title}
              maxChars={100}
            />
            <div className="record-tag-row">
              {record.tags.length ? (
                record.tags.map((tag) => <TagPill key={tag} name={tag} />)
              ) : (
                <span className="muted-text">未添加标签</span>
              )}
            </div>
          </div>

          <div className="record-field-list">
            {record.fields.map((field, index) => (
              <section className="record-field" key={field.field_id}>
                <div className="record-field-head">
                  <div className="record-field-name">
                    <span className="field-index">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {field.name}
                  </div>
                  <Tooltip title={field.value?.trim() ? '复制字段内容' : '字段为空'}>
                    <span className="record-field-copy-wrap">
                      <Button
                        type="text"
                        size="small"
                        className="record-field-copy"
                        icon={<CopyOutlined />}
                        disabled={!String(field.value || '').trim()}
                        onClick={() => handleCopyField(field)}
                        aria-label={`复制字段「${field.name}」`}
                      />
                    </span>
                  </Tooltip>
                </div>
                <Markdown value={field.value} />
              </section>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<LinkOutlined />}
          title="无法载入这条记录"
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
