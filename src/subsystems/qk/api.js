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

export const qkApi = {
  stats: () => request('/api/qk/stats'),

  listQuestions: (params = {}) => request(`/api/qk/questions${queryString(params)}`),
  getQuestion: (id) => request(`/api/qk/questions/${id}`),
  createQuestion: (payload) =>
    request('/api/qk/questions', { method: 'POST', body: payload }),
  updateQuestion: (id, payload) =>
    request(`/api/qk/questions/${id}`, { method: 'PUT', body: payload }),
  removeQuestion: (id) => request(`/api/qk/questions/${id}`, { method: 'DELETE' }),
  questionRelations: (id) => request(`/api/qk/questions/${id}/relations`),
  questionKnowledgeRelations: (id) =>
    request(`/api/qk/questions/${id}/knowledge-relations`),

  listKnowledge: (params = {}) => request(`/api/qk/knowledge${queryString(params)}`),
  getKnowledge: (id) => request(`/api/qk/knowledge/${id}`),
  createKnowledge: (payload) =>
    request('/api/qk/knowledge', { method: 'POST', body: payload }),
  updateKnowledge: (id, payload) =>
    request(`/api/qk/knowledge/${id}`, { method: 'PUT', body: payload }),
  removeKnowledge: (id) => request(`/api/qk/knowledge/${id}`, { method: 'DELETE' }),
  knowledgeRelations: (id) => request(`/api/qk/knowledge/${id}/relations`),
  knowledgeQuestionRelations: (id) =>
    request(`/api/qk/knowledge/${id}/question-relations`),

  listTags: ({ sort = 'count', q = '' } = {}) =>
    request(`/api/qk/tags${queryString({ sort, q })}`),
  createTag: (payload) => request('/api/qk/tags', { method: 'POST', body: payload }),
  renameTag: (id, payload) =>
    request(`/api/qk/tags/${id}`, { method: 'PUT', body: payload }),
  removeTag: (id) => request(`/api/qk/tags/${id}`, { method: 'DELETE' }),
  cleanupTags: () => request('/api/qk/tags/orphans', { method: 'DELETE' }),

  listTypes: (category) => request(`/api/qk/types/${category}`),
  createType: (category, payload) =>
    request(`/api/qk/types/${category}`, { method: 'POST', body: payload }),
  updateType: (category, id, payload) =>
    request(`/api/qk/types/${category}/${id}`, { method: 'PUT', body: payload }),
  removeType: (category, id) =>
    request(`/api/qk/types/${category}/${id}`, { method: 'DELETE' }),

  listRelationTypes: (graph) => request(`/api/qk/relation-types/${graph}`),
  createRelationType: (graph, payload) =>
    request(`/api/qk/relation-types/${graph}`, { method: 'POST', body: payload }),
  updateRelationType: (graph, id, payload) =>
    request(`/api/qk/relation-types/${graph}/${id}`, { method: 'PUT', body: payload }),
  removeRelationType: (graph, id) =>
    request(`/api/qk/relation-types/${graph}/${id}`, { method: 'DELETE' }),

  listRelations: (graph, params = {}) =>
    request(`/api/qk/relations/${graph}${queryString(params)}`),
  createRelation: (graph, payload) =>
    request(`/api/qk/relations/${graph}`, { method: 'POST', body: payload }),
  updateRelation: (graph, id, payload) =>
    request(`/api/qk/relations/${graph}/${id}`, { method: 'PUT', body: payload }),
  removeRelation: (graph, id) =>
    request(`/api/qk/relations/${graph}/${id}`, { method: 'DELETE' }),
}
