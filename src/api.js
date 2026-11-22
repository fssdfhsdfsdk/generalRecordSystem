export const DB_GROUP_KEY = 'grs_db_group'

export function currentDbGroup() {
  if (typeof window === 'undefined') return ''
  try {
    return window.sessionStorage.getItem(DB_GROUP_KEY) || ''
  } catch {
    return ''
  }
}

export function setDbGroup(name) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(DB_GROUP_KEY, name)
  } catch {
    // Session storage may be disabled; the server default group still works.
  }
}

export async function request(path, options = {}) {
  const init = { ...options, headers: { ...(options.headers || {}) } }
  const group = currentDbGroup()
  if (group && path !== '/api/groups') init.headers['X-DB-Group'] = group
  if (init.body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(init.body)
  }

  let response
  try {
    response = await fetch(path, init)
  } catch {
    throw new Error('无法连接后端服务，请确认 server.py 正在运行')
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    // Keep data null for empty responses.
  }

  if (!response.ok) {
    const message = data?.error?.message || `请求失败（HTTP ${response.status}）`
    const error = new Error(message)
    error.status = response.status
    error.code = data?.error?.code
    throw error
  }
  return data
}

export const api = {
  groups: () => request('/api/groups'),
  overview: () => request('/api/overview'),
  stats: () => request('/api/stats'),

  listTypes: () => request('/api/types'),
  getType: (id) => request(`/api/types/${id}`),
  createType: (payload) => request('/api/types', { method: 'POST', body: payload }),
  updateType: (id, payload) =>
    request(`/api/types/${id}`, { method: 'PUT', body: payload }),
  deleteType: (id) => request(`/api/types/${id}`, { method: 'DELETE' }),

  listRecords: ({ typeId, q, contentQ, tags, tagQ } = {}) => {
    const params = new URLSearchParams()
    if (typeId) params.set('type_id', typeId)
    if (q) params.set('q', q)
    if (contentQ) params.set('content_q', contentQ)
    if (tags?.length) params.set('tags', tags.join(','))
    if (tagQ) params.set('tag_q', tagQ)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return request(`/api/records${suffix}`)
  },
  getRecord: (id) => request(`/api/records/${id}`),
  createRecord: (payload) =>
    request('/api/records', { method: 'POST', body: payload }),
  updateRecord: (id, payload) =>
    request(`/api/records/${id}`, { method: 'PUT', body: payload }),
  deleteRecord: (id) => request(`/api/records/${id}`, { method: 'DELETE' }),

  listTags: ({ sort = 'count', q = '', typeId } = {}) => {
    const params = new URLSearchParams({ sort })
    if (q) params.set('q', q)
    if (Array.isArray(typeId)) {
      if (typeId.length) params.set('type_id', typeId.join(','))
    } else if (typeId) {
      params.set('type_id', typeId)
    }
    return request(`/api/tags?${params.toString()}`)
  },
  cleanupTags: () => request('/api/tags/orphans', { method: 'DELETE' }),
}
