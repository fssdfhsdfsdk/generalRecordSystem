import React from 'react'
import { Select } from 'antd'

export default function FuzzyTagSelect({
  value = [],
  onChange,
  options = [],
  placeholder,
  allowCreate = true,
  className = '',
  tokenSeparators = [' ', ',', '，', ';', '；'],
}) {
  const normalized = (options || []).map((item) =>
    typeof item === 'string'
      ? { value: item, label: item }
      : { value: item.value ?? item.name, label: item.label ?? item.name },
  )
  return (
    <Select
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
      maxTagCount="responsive"
      className={className}
    />
  )
}
