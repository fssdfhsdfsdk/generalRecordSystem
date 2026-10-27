import React, { useState } from 'react'
import { EyeOutlined, FormOutlined } from '@ant-design/icons'
import { Input, Tabs } from 'antd'
import Markdown from './Markdown'

export default function MarkdownEditor({
  value = '',
  onChange,
  placeholder = '支持 Markdown，可输入表格、代码块、列表……',
  minRows = 6,
}) {
  const [activeKey, setActiveKey] = useState('write')
  const text = value || ''

  return (
    <div className="md-editor">
      <Tabs
        size="small"
        activeKey={activeKey}
        onChange={setActiveKey}
        className="md-editor-tabs"
        items={[
          {
            key: 'write',
            label: (
              <span>
                <FormOutlined /> 编写
              </span>
            ),
            children: (
              <Input.TextArea
                value={text}
                onChange={(event) => onChange?.(event.target.value)}
                placeholder={placeholder}
                autoSize={{ minRows, maxRows: 20 }}
                className="md-textarea"
              />
            ),
          },
          {
            key: 'preview',
            label: (
              <span>
                <EyeOutlined /> 预览
              </span>
            ),
            children: (
              <div className="md-preview">
                <Markdown value={text} empty="预览区为空，切换到「编写」开始输入。" />
              </div>
            ),
          },
        ]}
      />
      <div className="md-editor-foot">
        <span>{text.length.toLocaleString()} 字符</span>
        <span>支持 GFM 表格 / 任务列表 / 代码块</span>
      </div>
    </div>
  )
}
