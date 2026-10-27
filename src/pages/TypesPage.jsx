import React, { useMemo, useState } from 'react'
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Skeleton,
  Space,
  Tooltip,
} from 'antd'
import {
  ArrowRightOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useAppData } from '../App'
import { api } from '../api'
import { navigate } from '../router'
import { formatDate } from '../utils'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import TypeIcon from '../components/TypeIcon'
import TypeFormModal from '../components/TypeFormModal'

export default function TypesPage() {
  const { message, modal } = AntApp.useApp()
  const { types, typesLoading, reloadTypes } = useAppData()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingType, setEditingType] = useState(null)

  const totalFields = useMemo(
    () => types.reduce((sum, type) => sum + type.fields.length, 0),
    [types],
  )

  const openCreate = () => {
    setEditingType(null)
    setModalOpen(true)
  }

  const openEdit = (type) => {
    setEditingType(type)
    setModalOpen(true)
  }

  const handleDelete = (type) => {
    modal.confirm({
      title: `删除记录类型「${type.name}」？`,
      content: (
        <div className="confirm-copy">
          <p>
            该类型下的 <strong>{type.record_count} 条记录</strong>
            及其全部字段内容会被永久删除。
          </p>
          <p>标签本身会保留在标签库中，不会随记录一起消失。</p>
        </div>
      ),
      okText: '永久删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.deleteType(type.id)
          message.success('记录类型已删除')
          await reloadTypes()
        } catch (error) {
          message.error(error.message)
        }
      },
    })
  }

  return (
    <div className="page types-page">
      <PageHeader
        eyebrow="SCHEMA STUDIO"
        title="类型管理"
        description="把「一类内容长什么样」定义成结构。类型与字段都是数据，可以随时扩展。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建类型
          </Button>
        }
      />

      <div className="manage-summary">
        <div className="manage-summary-item">
          <span>记录类型</span>
          <strong>{types.length}</strong>
        </div>
        <div className="manage-summary-item">
          <span>字段总数</span>
          <strong>{totalFields}</strong>
        </div>
        <div className="manage-summary-copy">
          <SettingOutlined />
          标题、创建时间与标签由系统统一提供，无需重复定义。
        </div>
      </div>

      <Alert
        type="warning"
        showIcon
        className="manage-alert"
        message="结构变更会直接影响已有记录"
        description="删除字段会同时删除所有记录中该字段的内容；删除类型会清空其下全部记录。重命名与排序是安全的。"
      />

      {typesLoading ? (
        <div className="manage-grid">
          {[0, 1, 2].map((item) => (
            <Card className="manage-card" key={item}>
              <Skeleton active paragraph={{ rows: 3 }} />
            </Card>
          ))}
        </div>
      ) : types.length ? (
        <div className="manage-grid">
          {types.map((type) => (
            <Card className="manage-card" key={type.id}>
              <div className="manage-card-head">
                <div className="manage-card-title">
                  <TypeIcon name={type.name} />
                  <div>
                    <h3>{type.name}</h3>
                    <p>
                      {type.record_count} 条记录 · 创建于 {formatDate(type.created_at)}
                    </p>
                  </div>
                </div>
                <Tooltip title="打开记录">
                  <Button
                    type="text"
                    icon={<ArrowRightOutlined />}
                    onClick={() => navigate(`/type/${type.id}`)}
                  />
                </Tooltip>
              </div>

              <div className="manage-field-list">
                {type.fields.map((field, index) => (
                  <span className="manage-field" key={field.id}>
                    <span className="field-index">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {field.field_name}
                  </span>
                ))}
              </div>

              <div className="manage-card-actions">
                <Space wrap>
                  <Button
                    size="small"
                    icon={<ArrowRightOutlined />}
                    onClick={() => navigate(`/type/${type.id}`)}
                  >
                    打开记录
                  </Button>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openEdit(type)}
                  >
                    编辑结构
                  </Button>
                </Space>
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(type)}
                >
                  删除
                </Button>
              </div>
            </Card>
          ))}
          <button type="button" className="manage-create-card" onClick={openCreate}>
            <PlusOutlined />
            <span>新建记录类型</span>
            <small>定义一组新的字段</small>
          </button>
        </div>
      ) : (
        <EmptyState
          icon={<SettingOutlined />}
          title="还没有任何记录类型"
          description="先定义一个类型和它的字段，记录才有地方安放。"
          action={
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建第一个类型
            </Button>
          }
        />
      )}

      <TypeFormModal
        open={modalOpen}
        type={editingType}
        onClose={() => {
          setModalOpen(false)
          setEditingType(null)
        }}
        onSaved={() => reloadTypes()}
      />
    </div>
  )
}
