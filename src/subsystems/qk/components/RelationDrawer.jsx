import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Drawer,
  Popconfirm,
  Space,
  Spin,
  Tag,
  Tooltip,
} from 'antd'
import {
  BranchesOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { qkApi } from '../api'
import { relationItemLabel } from '../qkMeta'
import EmptyState from '../../../components/EmptyState'

function fetchGroups(graph, nodeId, nodeKind) {
  if (graph === 'question') return qkApi.questionRelations(nodeId)
  if (graph === 'knowledge') return qkApi.knowledgeRelations(nodeId)
  if (nodeKind === 'knowledge') return qkApi.knowledgeQuestionRelations(nodeId)
  return qkApi.questionKnowledgeRelations(nodeId)
}

export default function RelationDrawer({
  open,
  graph,
  nodeId,
  nodeKind = 'question',
  title,
  onClose,
  onViewItem,
  onEditItem,
  onChanged,
}) {
  const { message } = AntApp.useApp()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!open || !nodeId) return undefined
    let alive = true
    setLoading(true)
    setGroups([])
    fetchGroups(graph, nodeId, nodeKind)
      .then((data) => {
        if (alive) setGroups(data.groups || [])
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
  }, [open, graph, nodeId, nodeKind, reloadToken, message])

  const remove = async (edgeId) => {
    try {
      await qkApi.removeRelation(graph, edgeId)
      message.success('关系已删除')
      setReloadToken((token) => token + 1)
      onChanged?.()
    } catch (error) {
      message.error(error.message)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={680}
      className="qk-relation-drawer"
      title={
        <div className="drawer-heading">
          <span className="drawer-heading-kicker">关系查看</span>
          <span className="drawer-heading-title">{title || '节点关系'}</span>
        </div>
      }
      extra={
        <Button
          icon={<ReloadOutlined />}
          onClick={() => setReloadToken((token) => token + 1)}
        />
      }
    >
      {loading ? (
        <div className="drawer-loading">
          <Spin />
        </div>
      ) : groups.length ? (
        <div className="qk-relation-groups">
          {groups.map((group) => (
            <section className="qk-relation-group" key={group.relation_type_id}>
              <div className="qk-relation-group-head">
                <span
                  className="qk-relation-dot"
                  style={{ background: group.visual_config?.color || '#4f46e5' }}
                />
                <h3>{group.name}</h3>
                <Tag bordered={false}>{group.items.length}</Tag>
                {!group.is_directed ? <Tag bordered={false}>双向等价</Tag> : null}
                {group.description ? (
                  <span className="muted-text">{group.description}</span>
                ) : null}
              </div>
              <div className="qk-relation-list">
                {group.items.map((item) => (
                  <div className="qk-relation-row" key={item.edge_id}>
                    <div className="qk-relation-row-main">
                      <button
                        type="button"
                        className="table-title-button"
                        onClick={() => onViewItem?.(item.related_kind, item.related_id)}
                      >
                        {item.related_title}
                      </button>
                      <span className="muted-text">
                        {relationItemLabel(item, item.direction === 'out')}
                        {item.direction === 'in' ? '（反向）' : ''}
                      </span>
                      {item.properties && Object.keys(item.properties).length ? (
                        <Tooltip title={JSON.stringify(item.properties)}>
                          <Tag bordered={false}>扩展属性</Tag>
                        </Tooltip>
                      ) : null}
                    </div>
                    <Space size={2}>
                      <Tooltip title="查看关联项">
                        <Button
                          type="text"
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={() =>
                            onViewItem?.(item.related_kind, item.related_id)
                          }
                        />
                      </Tooltip>
                      <Tooltip title="编辑关联项">
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() =>
                            onEditItem?.(item.related_kind, item.related_id)
                          }
                        />
                      </Tooltip>
                      <Popconfirm
                        title="删除这条关系？"
                        description="只删除关系边，不会删除关联的内容。"
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => remove(item.edge_id)}
                      >
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<BranchesOutlined />}
          title="还没有关系"
          description="在习题或知识的编辑页面，可以进入关系管理添加关联。"
        />
      )}
    </Drawer>
  )
}
