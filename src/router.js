import { useEffect, useState } from 'react'

export function parseLocation() {
  const raw = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  const [pathPart, queryPart = ''] = raw.split('?')
  const segments = pathPart
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
  return {
    path: `/${segments.join('/')}`,
    segments,
    query: new URLSearchParams(queryPart),
  }
}

export function useRoute() {
  const [route, setRoute] = useState(parseLocation)

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/')
    }
    const onChange = () => setRoute(parseLocation())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

export function navigate(to) {
  const target = to.startsWith('#') ? to : `#${to}`
  if (window.location.hash === target) return
  window.location.hash = target
}

export function tagFilterPath(tags) {
  const query = (Array.isArray(tags) ? tags.join(' ') : String(tags || '')).trim()
  if (!query) return '/tags'
  return `/tags/${encodeURIComponent(query)}`
}

export function parseTags(text) {
  const seen = new Set()
  const result = []
  String(text || '')
    .split(/[\s,，;；]+/)
    .map((part) => part.trim().replace(/^#+/, ''))
    .filter(Boolean)
    .forEach((tag) => {
      const key = tag.toLocaleLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        result.push(tag)
      }
    })
  return result
}
