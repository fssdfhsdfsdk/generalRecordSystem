import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const components = {
  a({ node, ...props }) {
    return <a {...props} target="_blank" rel="noreferrer noopener" />
  },
  table({ node, ...props }) {
    return (
      <div className="md-table-wrap">
        <table {...props} />
      </div>
    )
  },
  input({ node, ...props }) {
    return <input {...props} disabled />
  },
  img({ node, ...props }) {
    return <img {...props} loading="lazy" alt={props.alt || ''} />
  },
}

export default function Markdown({ value, empty = '暂无内容' }) {
  if (!value || !String(value).trim()) {
    return <div className="md-empty">{empty}</div>
  }
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {String(value)}
      </ReactMarkdown>
    </div>
  )
}
