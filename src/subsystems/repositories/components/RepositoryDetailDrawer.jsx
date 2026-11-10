import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Descriptions,
  Drawer,
  Skeleton,
  Space,
  Tooltip,
} from 'antd'
import {
  EditOutlined,
  LinkOutlined,
  ReloadOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { repositoryApi } from '../api'
import { formatDate } from '../../../utils'
import TagPill from '../../../components/TagPill'
import Markdown from '../../../components/Markdown'
import EmptyState from '../../../components/EmptyState'

function ResourceLink({ item }) {
  const url = String(item.url || '').trim()
  const href = /^https?:\/\//i.test(url) ? url : ''
  if (!href) {
    return (
      <li>
        <span className="catalog-resource-name">{item.name}</span>
        {url ? <span className="muted-text"> · {url}</span> : null}
      </li>
    )
  }
  return (
    <li>
      <Tooltip title={url}>
        <a href={href} target="_blank" rel="noreferrer noopener">
          <LinkOutlined /> {item.name}
        </a>
      </Tooltip>
    </li>
  )
}

export default function RepositoryDetailDrawer({
  open,
  repositoryId,
  onClose,
  onEdit,
  onChanged,
}) {
  const { message } = AntApp.useApp()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!open || !repositoryId) return undefined
    let alive = true
    setLoading(true)
    setDetail(null)
    repositoryApi
      .get(repositoryId)
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
  }, [open, repositoryId, reloadToken, message])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={760}
      className="catalog-detail-drawer"
      title={
        <div className="drawer-heading">
          <span className="drawer-heading-kicker">仓库详情</span>
          <span className="drawer-heading-title">
            {detail?.name || '载入中'}
          </span>
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
        <div className="catalog-detail">
          <div className="catalog-detail-head">
            <h2>{detail.name}</h2>
            <div className="catalog-detail-tag-row">
              {detail.languages.map((item) => (
                <TagPill key={item} name={item} size="sm" />
              ))}
              {detail.tags.map((item) => (
                <TagPill key={item} name={item} size="sm" />
              ))}
              {!detail.languages.length && !detail.tags.length ? (
                <span className="muted-text">未添加语言或标签</span>
              ) : null}
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
            <h3>仓库描述</h3>
            <Markdown
              value={detail.description}
              empty="还没有填写仓库描述。"
            />
          </section>

          <section className="catalog-section">
            <h3>评价（优点 / 缺点）</h3>
            <Markdown
              value={detail.evaluation}
              empty="还没有填写评价。"
            />
          </section>

          <section className="catalog-section">
            <h3>
              <LinkOutlined /> 资源地址
            </h3>
            {detail.resources.length ? (
              <ul className="catalog-resource-list">
                {detail.resources.map((item) => (
                  <ResourceLink item={item} key={item.id} />
                ))}
              </ul>
            ) : (
              <p className="muted-text">还没有资源地址。</p>
            )}
          </section>

          <section className="catalog-section">
            <h3>
              <TagsOutlined /> 编程语言 / 仓库标签
            </h3>
            <div className="catalog-detail-tag-row">
              {detail.languages.map((item) => (
                <TagPill key={`language-${item}`} name={item} size="sm" />
              ))}
              {detail.tags.map((item) => (
                <TagPill key={`tag-${item}`} name={item} size="sm" />
              ))}
              {!detail.languages.length && !detail.tags.length ? (
                <span className="muted-text">未添加。</span>
              ) : null}
            </div>
          </section>

          <section className="catalog-section">
            <h3>关联品（相似品 / 替代品等）</h3>
            {detail.relations.length ? (
              <div className="catalog-relation-list">
                {detail.relations.map((item) => (
                  <div className="catalog-relation-row" key={item.id}>
                    <strong>{item.related_name}</strong>
                    <span>
                      {item.description || (
                        <span className="muted-text">未填写关联描述</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted-text">还没有关联品。</p>
            )}
          </section>
        </div>
      ) : (
        <EmptyState
          icon={<LinkOutlined />}
          title="无法载入这个仓库"
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
