import React, { useRef, useState } from 'react'
import { Select } from 'antd'

// Show up to 100 tags at once. Only beyond that does Ant Design collapse the
// rest into a "+n" chip. The old "responsive" mode collapsed after ~7 tags,
// which made the hidden tags impossible to remove.
const MAX_VISIBLE_TAGS = 100

export default function FuzzyTagSelect({
  value = [],
  onChange,
  options = [],
  placeholder,
  allowCreate = true,
  className = '',
  tokenSeparators = [' ', ',', '，', ';', '；'],
  id,
}) {
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

  const normalized = (options || []).map((item) =>
    typeof item === 'string'
      ? { value: item, label: item }
      : { value: item.value ?? item.name, label: item.label ?? item.name },
  )
  return (
    <div ref={shellRef} className={`tag-select-shell ${className}`.trim()}>
      <Select
        id={id}
        mode={allowCreate ? 'tags' : 'multiple'}
        value={value}
        onChange={(list) => {
          const seen = new Set()
          const result = []
          ;(list || []).forEach((item) => {
            const text = String(item).trim().replace(/^#+/, '')
            if (!text) return
            const key = text.toLocaleLowerCase()
            if (seen.has(key)) return
            seen.add(key)
            result.push(text)
          })
          onChange?.(result)
        }}
        options={normalized}
        showSearch
        filterOption={(input, option) =>
          String(option?.label ?? option?.value ?? '')
            .toLocaleLowerCase()
            .includes(input.trim().toLocaleLowerCase())
        }
        tokenSeparators={tokenSeparators}
        placeholder={placeholder}
        maxTagCount={expanded ? undefined : MAX_VISIBLE_TAGS}
        className="fuzzy-tag-select"
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
