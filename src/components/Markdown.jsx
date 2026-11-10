import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

const CODE_TOKEN_OPEN = '\uE000'
const CODE_TOKEN_CLOSE = '\uE001'
const FENCE_OPEN_RE = /^[ \t]{0,3}(`{3,}|~{3,})/
const FENCE_CLOSE_RE = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*\r?$/

/**
 * Protect fenced code blocks and inline code spans with placeholder tokens so
 * that LaTeX-looking text inside them is never rewritten.
 */
function protectCode(value) {
  const blocks = []
  const stash = (text) => {
    const token = `${CODE_TOKEN_OPEN}${blocks.length}${CODE_TOKEN_CLOSE}`
    blocks.push(text)
    return token
  }

  const lines = String(value).split('\n')
  const output = []
  let buffer = null
  let fenceChar = ''
  let fenceLength = 0

  for (const line of lines) {
    if (buffer) {
      buffer.push(line)
      const close = line.match(FENCE_CLOSE_RE)
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLength) {
        output.push(stash(buffer.join('\n')))
        buffer = null
      }
      continue
    }

    const open = line.match(FENCE_OPEN_RE)
    if (open) {
      buffer = [line]
      fenceChar = open[1][0]
      fenceLength = open[1].length
      continue
    }

    output.push(line)
  }

  if (buffer) output.push(stash(buffer.join('\n')))

  const text = output
    .join('\n')
    .replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (match) => stash(match))

  return { text, blocks }
}

/**
 * remark-math only understands `$…$` and `$$…$$`. Pandoc/LaTeX users often
 * write `\(…\)` and `\[…\]`, so normalize those delimiters before parsing.
 * Escaped sequences such as `\\(` or `\\[2pt]` are left untouched.
 */
export function normalizeMathDelimiters(value) {
  const { text, blocks } = protectCode(value)

  const withBlockMath = text.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (match, body, offset, whole) => {
      if (whole[offset - 1] === '\\') return match
      return `\n\n$$\n${body.trim()}\n$$\n\n`
    },
  )

  const withInlineMath = withBlockMath.replace(
    /\\\(([\s\S]*?)\\\)/g,
    (match, body, offset, whole) => {
      if (whole[offset - 1] === '\\') return match
      return `$${body.replace(/\s*\n\s*/g, ' ').trim()}$`
    },
  )

  return withInlineMath.replace(
    /\uE000(\d+)\uE001/g,
    (match, index) => blocks[Number(index)],
  )
}

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

const remarkPlugins = [remarkGfm, remarkMath]
const rehypePlugins = [[rehypeKatex, { throwOnError: false, strict: false }]]

export default function Markdown({ value, empty = '暂无内容' }) {
  if (!value || !String(value).trim()) {
    return <div className="md-empty">{empty}</div>
  }
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {normalizeMathDelimiters(value)}
      </ReactMarkdown>
    </div>
  )
}
