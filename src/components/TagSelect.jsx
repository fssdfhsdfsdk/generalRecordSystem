import React, { useRef, useState } from 'react'
import { TagOutlined } from '@ant-design/icons'
import { Select } from 'antd'

// Show up to 100 tags at once. Only beyond that does Ant Design collapse the
// rest into a "+n" chip. The old "responsive" mode collapsed after ~7 tags,
// which made the hidden tags impossible to remove.
const MAX_VISIBLE_TAGS = 100

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

export default function TagSelect({ value = [], onChange, placeholder, id }) {
  const [expanded, setExpanded] = useState(false)
  const shellRef = useRef(null)
  const tagCount = Array.isArray(value) ? value.length : 0
  const collapsed = tagCount > MAX_VISIBLE_TAGS && !expanded

  // Keep the caret after the existing tags. With many tags the input sits at
  // the bottom of the scrollable field, so bring it into view on focus.
  const revealInput = () => {
    const selector = shellRef.current?.querySelector('.ant-select-selector')
    if (selector) selector.scrollTop = selector.scrollHeight
  }

  return (
    <div ref={shellRef} className="tag-select-shell">
      <Select
        id={id}
        mode="tags"
        value={value}
        onChange={(list) => onChange?.(normalizeTags(list))}
        tokenSeparators={[' ', ',', '，', ';', '；']}
        placeholder={placeholder || '输入标签，按回车确认'}
        suffixIcon={<TagOutlined />}
        className="tag-select"
        open={false}
        notFoundContent={null}
        maxTagCount={expanded ? undefined : MAX_VISIBLE_TAGS}
        onFocus={revealInput}
      />
      {collapsed ? (
        <button
          type="button"
          className="tag-select-expand"
          onClick={() => setExpanded(true)}
        >
          展开其余 {tagCount - MAX_VISIBLE_TAGS} 个标签
        </button>
      ) : null}
      {expanded && tagCount > MAX_VISIBLE_TAGS ? (
        <button
          type="button"
          className="tag-select-expand"
          onClick={() => setExpanded(false)}
        >
          收起标签
        </button>
      ) : null}
    </div>
  )
}
