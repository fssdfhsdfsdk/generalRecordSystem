import React, { useEffect, useState } from 'react'
import { App as AntApp, Select, Tag, Tooltip } from 'antd'
import { DatabaseOutlined } from '@ant-design/icons'
import { api, currentDbGroup, setDbGroup } from '../api'

export default function DbGroupSwitcher({ compact = false }) {
  const { message } = AntApp.useApp()
  const [groups, setGroups] = useState([])
  const [defaultGroup, setDefaultGroup] = useState('')
  const [value, setValue] = useState(currentDbGroup())

  useEffect(() => {
    let alive = true
    api
      .groups()
      .then((data) => {
        if (!alive) return
        const names = (data.groups || []).map((item) => item.name)
        setGroups(data.groups || [])
        setDefaultGroup(data.default_group || names[0] || '')
        const stored = currentDbGroup()
        const next = stored && names.includes(stored) ? stored : data.default_group || names[0]
        if (next && next !== stored) setDbGroup(next)
        if (next) setValue(next)
      })
      .catch((error) => {
        if (alive) message.error(error.message)
      })
    return () => {
      alive = false
    }
  }, [message])

  const onChange = (name) => {
    setDbGroup(name)
    setValue(name)
    window.location.reload()
  }

  const options = groups.map((item) => ({
    value: item.name,
    label: item.label || item.name,
  }))

  if (compact) {
    return (
      <Tooltip title="当前标签页的数据组；每个标签页可独立切换">
        <span className="db-group-compact">
          <DatabaseOutlined />
          <Select
            size="small"
            value={value || undefined}
            options={options}
            onChange={onChange}
            placeholder="数据组"
            variant="borderless"
            className="db-group-select"
          />
        </span>
      </Tooltip>
    )
  }

  return (
    <div className="db-group-switcher">
      <div className="db-group-copy">
        <span className="db-group-kicker">DATA GROUP</span>
        <h3>当前标签页数据组</h3>
        <p>
          不同标签页可以选择不同数据组，各自独立访问对应的六库数据库，互不干扰。
        </p>
      </div>
      <div className="db-group-control">
        <Select
          value={value || undefined}
          options={options}
          onChange={onChange}
          placeholder="选择数据组"
          className="db-group-select-large"
        />
        <Tag bordered={false} color="blue">
          {groups.length} 组配置
        </Tag>
        <span className="db-group-default">默认：{defaultGroup || '—'}</span>
      </div>
    </div>
  )
}
