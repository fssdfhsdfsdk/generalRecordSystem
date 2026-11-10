import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Popconfirm,
  Skeleton,
  Space,
} from 'antd'
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import { docApi } from '../api'
import { navigate } from '../../../router'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'
import TagPill from '../../../components/TagPill'
import DocTypeIcon from '../components/DocTypeIcon'
import DocStatusTag from '../components/DocStatusTag'
import DocPriorityTag from '../components/DocPriorityTag'
import DocDetailBody from '../components/DocDetailBody'
import { docTypeMeta } from '../docsMeta'

export default function DocContentPage({ documentId }) {
  const { message } = AntApp.useApp()
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
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
  }, [documentId, message])

  const type = doc
    ? {
        id: doc.type_id,
        name: doc.type_name,
        slug: doc.type_slug,
      }
    : null
  const typeMeta = doc ? docTypeMeta(type) : null

  const filterByTag = (tag) => {
    navigate(`/docs/tags/${encodeURIComponent(tag)}`)
  }

  const remove = async () => {
    try {
      await docApi.remove(doc.id)
      message.success('文档已删除')
      navigate(`/docs/type/${doc.type_id}`)
    } catch (err) {
      message.error(err.message)
    }
  }

  if (loading) {
    return (
      <div className="page doc-content-page">
        <div className="doc-content-loading">
          <Skeleton active paragraph={{ rows: 3 }} />
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    )
  }

  if (error || !doc) {
    return (
      <div className="page">
        <EmptyState
          icon={<LinkOutlined />}
          title="无法载入这篇文档"
          description="它可能已被删除，或后端服务暂时不可用。"
          action={
            <Space>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/docs')}
              >
                回到文档总览
              </Button>
              <Button type="primary" onClick={() => window.location.reload()}>
                重新载入
              </Button>
            </Space>
          }
        />
      </div>
    )
  }

  return (
    <div className="page doc-content-page">
      <PageHeader
        eyebrow={typeMeta.kicker}
        title={doc.title}
        description={
          doc.document_info
            ? doc.document_info
            : '这篇文档还没有填写作者、时间、版本或资源地址。'
        }
        extra={
          <Space wrap>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/docs/type/${doc.type_id}`)}
            >
              返回{type.name}
            </Button>
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => navigate(`/docs/${doc.id}/edit`)}
            >
              编辑文档
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
          </Space>
        }
      >
        <div className="doc-content-title-meta">
          <span className="doc-type-inline">
            <DocTypeIcon type={type} size="sm" />
            {type.name}
          </span>
          <DocStatusTag status={doc.reading_status} />
          <DocPriorityTag priority={doc.priority} />
          <span className="muted-text">
            <HistoryOutlined /> {doc.history_count} 条阅读历史
          </span>
        </div>
        {doc.tags.length ? (
          <div className="doc-content-tags">
            {doc.tags.map((tag) => (
              <TagPill key={tag} name={tag} onClick={filterByTag} />
            ))}
          </div>
        ) : (
          <div className="muted-text doc-content-no-tags">未添加标签</div>
        )}
      </PageHeader>

      <DocDetailBody
        doc={doc}
        onTagClick={filterByTag}
        onEdit={() => navigate(`/docs/${doc.id}/edit`)}
      />
    </div>
  )
}
