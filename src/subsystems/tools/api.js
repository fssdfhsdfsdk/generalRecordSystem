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

export const toolApi = {
  stats: () => request('/api/tools/stats'),
  list: (params = {}) => request(`/api/tools${queryString(params)}`),
  get: (id) => request(`/api/tools/${id}`),
  create: (payload) => request('/api/tools', { method: 'POST', body: payload }),
  update: (id, payload) =>
    request(`/api/tools/${id}`, { method: 'PUT', body: payload }),
  remove: (id) => request(`/api/tools/${id}`, { method: 'DELETE' }),

  listTags: ({ sort = 'count', q = '' } = {}) =>
    request(`/api/tools/tags${queryString({ sort, q })}`),
  createTag: (payload) =>
    request('/api/tools/tags', { method: 'POST', body: payload }),
  renameTag: (id, payload) =>
    request(`/api/tools/tags/${id}`, { method: 'PUT', body: payload }),
  removeTag: (id) => request(`/api/tools/tags/${id}`, { method: 'DELETE' }),
  cleanupTags: () =>
    request('/api/tools/tags/orphans', { method: 'DELETE' }),

  listPlatforms: ({ sort = 'count', q = '' } = {}) =>
    request(`/api/tools/platforms${queryString({ sort, q })}`),
  createPlatform: (payload) =>
    request('/api/tools/platforms', { method: 'POST', body: payload }),
  renamePlatform: (id, payload) =>
    request(`/api/tools/platforms/${id}`, { method: 'PUT', body: payload }),
  removePlatform: (id) =>
    request(`/api/tools/platforms/${id}`, { method: 'DELETE' }),
}
