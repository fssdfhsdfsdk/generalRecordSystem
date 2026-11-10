import React, { useEffect, useMemo, useState } from 'react'
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
import { docApi } from '../api'
import { navigate } from '../../../router'
import { useAppData } from '../../../shell/AppDataContext'
import PageHeader from '../../../components/PageHeader'
import EmptyState from '../../../components/EmptyState'
import DocTypeIcon from '../components/DocTypeIcon'
import DocTypeFormModal from '../components/DocTypeFormModal'
import { docTypeMeta } from '../docsMeta'

export default function DocTypesPage() {
  const { message, modal } = AntApp.useApp()
  const {
    docTypes,
    docTypesLoading,
    reloadDocTypes,
  } = useAppData()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingType, setEditingType] = useState(null)

  useEffect(() => {
    reloadDocTypes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalDocuments = useMemo(
    () => docTypes.reduce((sum, type) => sum + type.document_count, 0),
    [docTypes],
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
      title: `删除文档类型「${type.name}」？`,
      content:
        type.document_count > 0
          ? `该类型下还有 ${type.document_count} 篇文档。为保证数据安全，类型管理会拒绝删除；请先把这些文档移到其他类型或删除。`
          : '类型本身会被删除；已经存在的标签不会受影响。',
      okText: type.document_count > 0 ? '我知道了' : '永久删除',
      cancelText: '取消',
      okButtonProps: type.document_count > 0 ? {} : { danger: true },
      onOk: async () => {
        if (type.document_count > 0) return
        try {
          await docApi.removeType(type.id)
          message.success('文档类型已删除')
          await reloadDocTypes()
        } catch (error) {
          message.error(error.message)
        }
      },
    })
  }

  return (
    <div className="page doc-types-page">
      <PageHeader
        eyebrow="DOCUMENT TAXONOMY"
        title="文档类型管理"
        description="默认提供书籍、论文、文章博客日志、技术与规范类文档、商业与办公类文档五类；可按自己的资料结构继续新增或描述。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建类型
          </Button>
        }
      />

      <div className="doc-manage-summary">
        <div>
          <span>文档类型</span>
          <strong>{docTypes.length}</strong>
        </div>
        <div>
          <span>归入文档</span>
          <strong>{totalDocuments}</strong>
        </div>
        <div className="doc-manage-copy">
          <SettingOutlined />
          类型只决定归档入口；每篇文档仍拥有独立的笔记、感想、标签与阅读历史。
        </div>
      </div>

      <Alert
        type="warning"
        showIcon
        className="doc-manage-alert"
        message="类型名称与描述可以随时修改"
        description="改名不会移动文档。为了不误删资料，类型下还有文档时系统会拒绝删除类型；请先移动或删除文档。"
      />

      {docTypesLoading ? (
        <div className="doc-type-manage-grid">
          {[0, 1, 2, 3, 4].map((item) => (
            <Card className="doc-type-manage-card" key={item}>
              <Skeleton active paragraph={{ rows: 3 }} />
            </Card>
          ))}
        </div>
      ) : docTypes.length ? (
        <div className="doc-type-manage-grid">
          {docTypes.map((type, index) => {
            const meta = docTypeMeta(type)
            return (
              <Card className="doc-type-manage-card" key={type.id}>
                <div className="doc-type-manage-head">
                  <div className="doc-type-manage-title">
                    <DocTypeIcon type={type} index={index} />
                    <div>
                      <h3>{type.name}</h3>
                      <p>
                        {type.document_count} 篇文档
                        {type.slug ? ` · ${meta.kicker}` : ' · 自定义类型'}
                      </p>
                    </div>
                  </div>
                  <Tooltip title="打开这一类文档">
                    <Button
                      type="text"
                      icon={<ArrowRightOutlined />}
                      onClick={() => navigate(`/docs/type/${type.id}`)}
                    />
                  </Tooltip>
                </div>

                <p className="doc-type-description">
                  {type.description || '还没有填写类型描述。'}
                </p>

                <div className="doc-type-manage-actions">
                  <Space wrap>
                    <Button
                      size="small"
                      icon={<ArrowRightOutlined />}
                      onClick={() => navigate(`/docs/type/${type.id}`)}
                    >
                      打开文档
                    </Button>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openEdit(type)}
                    >
                      编辑
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
            )
          })}
          <button type="button" className="doc-type-create-card" onClick={openCreate}>
            <PlusOutlined />
            <span>新建文档类型</span>
            <small>为一类资料建立归档入口</small>
          </button>
        </div>
      ) : (
        <EmptyState
          icon={<SettingOutlined />}
          title="还没有文档类型"
          description="先建立一种类型，再开始归档文档。"
          action={
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建第一个类型
            </Button>
          }
        />
      )}

      <DocTypeFormModal
        open={modalOpen}
        type={editingType}
        onClose={() => {
          setModalOpen(false)
          setEditingType(null)
        }}
        onSaved={() => reloadDocTypes()}
      />
    </div>
  )
}
