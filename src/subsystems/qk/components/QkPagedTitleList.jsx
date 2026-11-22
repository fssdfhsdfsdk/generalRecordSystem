import React, { useEffect, useState } from 'react'
import { Button, Pagination, Space } from 'antd'

export default function QkPagedTitleList({
  eyebrow,
  title,
  rows = [],
  emptyText = '暂无内容',
  onItemClick,
  onAdd,
  addLabel = '添加关系',
  onManage,
  manageLabel = '管理',
}) {
  const [pageSize, setPageSize] = useState(5)
  const [current, setCurrent] = useState(1)

  useEffect(() => {
    setCurrent(1)
  }, [rows.length, pageSize])

  const start = (current - 1) * pageSize
  const visible = rows.slice(start, start + pageSize)

  return (
    <section className="qk-paged-section">
      <div className="qk-paged-head">
        <div>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <h3>
            {title}（{rows.length}）
          </h3>
        </div>
        <Space size={4}>
          {onAdd ? (
            <Button size="small" type="primary" ghost onClick={onAdd}>
              {addLabel}
            </Button>
          ) : null}
          {onManage ? (
            <Button size="small" type="link" onClick={onManage}>
              {manageLabel}
            </Button>
          ) : null}
        </Space>
      </div>

      {visible.length ? (
        <div className="qk-paged-rows">
          {visible.map((row) => (
            <button
              type="button"
              className="qk-paged-row"
              key={row.id}
              onClick={() => onItemClick?.(row)}
            >
              <span className="qk-paged-row-title">{row.title}</span>
              {row.subtitle ? (
                <small className="qk-paged-row-subtitle">{row.subtitle}</small>
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="qk-empty-inline">{emptyText}</div>
      )}

      {rows.length > pageSize ? (
        <div className="qk-paged-foot">
          <Pagination
            size="small"
            current={current}
            pageSize={pageSize}
            total={rows.length}
            showSizeChanger
            pageSizeOptions={[5, 10, 20, 50]}
            showTotal={(total) => `共 ${total} 条`}
            onChange={(page, size) => {
              setCurrent(page)
              if (size) setPageSize(size)
            }}
            onShowSizeChange={(_, size) => {
              setPageSize(size)
              setCurrent(1)
            }}
          />
        </div>
      ) : null}
    </section>
  )
}
