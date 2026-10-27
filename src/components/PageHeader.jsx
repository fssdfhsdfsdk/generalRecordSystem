import React from 'react'

export default function PageHeader({ eyebrow, title, description, extra, children }) {
  return (
    <div className="page-head">
      <div className="page-head-copy">
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
        {children}
      </div>
      {extra ? <div className="page-head-actions">{extra}</div> : null}
    </div>
  )
}
