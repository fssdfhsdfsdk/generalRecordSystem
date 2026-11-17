import { request } from '../../api'

const CATEGORY_KEYS = {
  'question-node-types': 'question_node',
  'question-domain-types': 'question_domain',
  'knowledge-node-types': 'knowledge_node',
  'knowledge-domain-types': 'knowledge_domain',
}
const GRAPH_KEYS = {
  'question-relations': 'question',
  'knowledge-relations': 'knowledge',
  'question-knowledge-relations': 'question_knowledge',
}
const categoryKey = (value) => CATEGORY_KEYS[value] || value
const graphKey = (value) => GRAPH_KEYS[value] || value

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

  listTypes: (category) => request(`/api/qk/types/${categoryKey(category)}`),
  createType: (category, payload) =>
    request(`/api/qk/types/${categoryKey(category)}`, { method: 'POST', body: payload }),
  updateType: (category, id, payload) =>
    request(`/api/qk/types/${categoryKey(category)}/${id}`, { method: 'PUT', body: payload }),
  removeType: (category, id) =>
    request(`/api/qk/types/${categoryKey(category)}/${id}`, { method: 'DELETE' }),

  listRelationTypes: (graph) => request(`/api/qk/relation-types/${graphKey(graph)}`),
  createRelationType: (graph, payload) =>
    request(`/api/qk/relation-types/${graphKey(graph)}`, { method: 'POST', body: payload }),
  updateRelationType: (graph, id, payload) =>
    request(`/api/qk/relation-types/${graphKey(graph)}/${id}`, { method: 'PUT', body: payload }),
  removeRelationType: (graph, id) =>
    request(`/api/qk/relation-types/${graphKey(graph)}/${id}`, { method: 'DELETE' }),

  listRelations: (graph, params = {}) =>
    request(`/api/qk/relations/${graphKey(graph)}${queryString(params)}`),
  createRelation: (graph, payload) =>
    request(`/api/qk/relations/${graphKey(graph)}`, { method: 'POST', body: payload }),
  updateRelation: (graph, id, payload) =>
    request(`/api/qk/relations/${graphKey(graph)}/${id}`, { method: 'PUT', body: payload }),
  removeRelation: (graph, id) =>
    request(`/api/qk/relations/${graphKey(graph)}/${id}`, { method: 'DELETE' }),
}
