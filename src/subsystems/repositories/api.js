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

export const repositoryApi = {
  stats: () => request('/api/repositories/stats'),
  list: (params = {}) => request(`/api/repositories${queryString(params)}`),
  get: (id) => request(`/api/repositories/${id}`),
  create: (payload) =>
    request('/api/repositories', { method: 'POST', body: payload }),
  update: (id, payload) =>
    request(`/api/repositories/${id}`, { method: 'PUT', body: payload }),
  remove: (id) => request(`/api/repositories/${id}`, { method: 'DELETE' }),

  listTags: ({ sort = 'count', q = '' } = {}) =>
    request(`/api/repositories/tags${queryString({ sort, q })}`),
  createTag: (payload) =>
    request('/api/repositories/tags', { method: 'POST', body: payload }),
  renameTag: (id, payload) =>
    request(`/api/repositories/tags/${id}`, { method: 'PUT', body: payload }),
  removeTag: (id) =>
    request(`/api/repositories/tags/${id}`, { method: 'DELETE' }),
  cleanupTags: () =>
    request('/api/repositories/tags/orphans', { method: 'DELETE' }),

  listLanguages: ({ sort = 'count', q = '' } = {}) =>
    request(`/api/repositories/languages${queryString({ sort, q })}`),
  createLanguage: (payload) =>
    request('/api/repositories/languages', { method: 'POST', body: payload }),
  renameLanguage: (id, payload) =>
    request(`/api/repositories/languages/${id}`, {
      method: 'PUT',
      body: payload,
    }),
  removeLanguage: (id) =>
    request(`/api/repositories/languages/${id}`, { method: 'DELETE' }),
}
