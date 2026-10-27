import React from 'react'
import { TagOutlined } from '@ant-design/icons'
import { Select } from 'antd'

function normalizeTags(list) {
  const seen = new Set()
  const result = []
  ;(list || []).forEach((raw) => {
    const tag = String(raw).trim().replace(/^#+/, '')
    if (!tag) return
    const key = tag.toLocaleLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    result.push(tag)
  })
  return result
}

export default function TagSelect({ value = [], onChange, placeholder }) {
  return (
    <Select
      mode="tags"
      value={value}
      onChange={(list) => onChange?.(normalizeTags(list))}
      tokenSeparators={[' ', ',', '，', ';', '；']}
      placeholder={placeholder || '输入标签，按回车确认'}
      suffixIcon={<TagOutlined />}
      className="tag-select"
      open={false}
      notFoundContent={null}
      maxTagCount="responsive"
    />
  )
}
