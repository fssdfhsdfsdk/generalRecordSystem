import { request } from '../../api'

function queryString(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','))
    } else {
      search.set(key, String(value))
    }
  })
  const suffix = search.toString()
  return suffix ? `?${suffix}` : ''
}

export const docApi = {
  stats: () => request('/api/docs/stats'),

  listTypes: () => request('/api/docs/types'),
  createType: (payload) =>
    request('/api/docs/types', { method: 'POST', body: payload }),
  updateType: (id, payload) =>
    request(`/api/docs/types/${id}`, { method: 'PUT', body: payload }),
  removeType: (id) => request(`/api/docs/types/${id}`, { method: 'DELETE' }),

  list: (params = {}) => request(`/api/docs${queryString(params)}`),
  get: (id) => request(`/api/docs/${id}`),
  create: (payload) => request('/api/docs', { method: 'POST', body: payload }),
  update: (id, payload) =>
    request(`/api/docs/${id}`, { method: 'PUT', body: payload }),
  remove: (id) => request(`/api/docs/${id}`, { method: 'DELETE' }),

  addHistory: (id, payload) =>
    request(`/api/docs/${id}/history`, { method: 'POST', body: payload }),
  updateHistory: (id, historyId, payload) =>
    request(`/api/docs/${id}/history/${historyId}`, {
      method: 'PUT',
      body: payload,
    }),
  removeHistory: (id, historyId) =>
    request(`/api/docs/${id}/history/${historyId}`, { method: 'DELETE' }),

  listTags: ({ sort = 'count', q = '', type_id } = {}) =>
    request(`/api/docs/tags${queryString({ sort, q, type_id })}`),
  renameTag: (id, payload) =>
    request(`/api/docs/tags/${id}`, { method: 'PUT', body: payload }),
  removeTag: (id) => request(`/api/docs/tags/${id}`, { method: 'DELETE' }),
  cleanupTags: () =>
    request('/api/docs/tags/orphans', { method: 'DELETE' }),
}
