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

export const planApi = {
  overview: () => request('/api/overview'),
  stats: () => request('/api/plans/stats'),
  list: (params = {}) => request(`/api/plans${queryString(params)}`),
  get: (id) => request(`/api/plans/${id}`),
  create: (payload) => request('/api/plans', { method: 'POST', body: payload }),
  update: (id, payload) =>
    request(`/api/plans/${id}`, { method: 'PUT', body: payload }),
  remove: (id) => request(`/api/plans/${id}`, { method: 'DELETE' }),

  changeStatus: (id, payload) =>
    request(`/api/plans/${id}/status`, { method: 'POST', body: payload }),

  addProgress: (id, payload) =>
    request(`/api/plans/${id}/progress`, { method: 'POST', body: payload }),
  removeProgress: (id, logId) =>
    request(`/api/plans/${id}/progress/${logId}`, { method: 'DELETE' }),

  createNode: (id, payload) =>
    request(`/api/plans/${id}/nodes`, { method: 'POST', body: payload }),
  updateNode: (id, nodeId, payload) =>
    request(`/api/plans/${id}/nodes/${nodeId}`, { method: 'PUT', body: payload }),
  removeNode: (id, nodeId) =>
    request(`/api/plans/${id}/nodes/${nodeId}`, { method: 'DELETE' }),

  createActual: (id, payload) =>
    request(`/api/plans/${id}/actuals`, { method: 'POST', body: payload }),
  updateActual: (id, actualId, payload) =>
    request(`/api/plans/${id}/actuals/${actualId}`, {
      method: 'PUT',
      body: payload,
    }),
  removeActual: (id, actualId) =>
    request(`/api/plans/${id}/actuals/${actualId}`, { method: 'DELETE' }),

  listTags: ({ sort = 'count', q = '' } = {}) =>
    request(`/api/plans/tags${queryString({ sort, q })}`),
  cleanupTags: () => request('/api/plans/tags/orphans', { method: 'DELETE' }),
}
