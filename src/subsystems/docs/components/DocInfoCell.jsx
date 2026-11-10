import React from 'react'
import { Tooltip } from 'antd'
import EllipsisText from '../../../components/EllipsisText'
import { httpLink } from '../docInfo'

const FIELDS = [
  ['author', 'author'],
  ['doc_time', 'doc_time'],
  ['version', 'version'],
  ['resource_url', 'resource_url'],
  ['info_extra', 'info_extra'],
]

export default function DocInfoCell({ doc }) {
  const lines = FIELDS.map(([key]) => ({
    key,
    value: String(doc[key] || '').trim(),
  })).filter((line) => line.value)

  if (!lines.length) {
    return <span className="muted-text">—</span>
  }

  return (
    <div className="doc-info-lines">
      {lines.map((line) => {
        if (line.key === 'resource_url') {
          const href = httpLink(line.value)
          if (href) {
            return (
              <div className="doc-info-line" key={line.key}>
                <Tooltip title={line.value}>
                  <a
                    className="doc-info-link"
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    资源地址
                  </a>
                </Tooltip>
              </div>
            )
          }
        }
        return (
          <div className="doc-info-line" key={line.key}>
            <EllipsisText text={line.value} maxChars={30} />
          </div>
        )
      })}
    </div>
  )
}
