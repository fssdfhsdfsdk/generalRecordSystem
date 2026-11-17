export const TYPE_CATEGORIES = [
  {
    key: 'question_node',
    label: '习题节点类型',
    eyebrow: 'QUESTION NODE TYPES',
    path: '/qk/question-node-types',
    description: '维护习题的解题形式：解答、证明、思考等。',
  },
  {
    key: 'question_domain',
    label: '习题领域类型',
    eyebrow: 'QUESTION DOMAIN TYPES',
    path: '/qk/question-domain-types',
    description: '维护习题所属的知识领域：数学、物理、计算机等。',
  },
  {
    key: 'knowledge_node',
    label: '知识节点类型',
    eyebrow: 'KNOWLEDGE NODE TYPES',
    path: '/qk/knowledge-node-types',
    description: '维护知识的粒度：概念、原理、实操技能、长文汇总。',
  },
  {
    key: 'knowledge_domain',
    label: '知识领域类型',
    eyebrow: 'KNOWLEDGE DOMAIN TYPES',
    path: '/qk/knowledge-domain-types',
    description: '维护知识所属领域：数学、物理、计算机等。',
  },
]

export const GRAPHS = {
  question: {
    label: '习题关系',
    eyebrow: 'QUESTION RELATIONS',
    path: '/qk/question-relations',
    description: '定义习题与习题之间的关系类型与关系边。',
  },
  knowledge: {
    label: '知识关系',
    eyebrow: 'KNOWLEDGE RELATIONS',
    path: '/qk/knowledge-relations',
    description: '定义知识与知识之间的关系类型与关系边。',
  },
  question_knowledge: {
    label: '习题知识关系',
    eyebrow: 'QUESTION ↔ KNOWLEDGE',
    path: '/qk/question-knowledge-relations',
    description: '定义习题引用、依赖、考察某条知识的关系。',
  },
}

export const DIFFICULTY_OPTIONS = [
  { value: 1, label: '1 · 入门' },
  { value: 2, label: '2 · 基础' },
  { value: 3, label: '3 · 进阶' },
  { value: 4, label: '4 · 困难' },
  { value: 5, label: '5 · 挑战' },
]

export function difficultyColor(value) {
  if (value >= 5) return 'red'
  if (value === 4) return 'orange'
  if (value === 3) return 'gold'
  if (value === 2) return 'blue'
  return 'green'
}

export function relationTypeLabel(type) {
  if (!type) return '关系'
  return type.name || type.code
}

export function relationItemLabel(item, outgoing) {
  return outgoing
    ? item.forward_label || item.name || '正向关系'
    : item.reverse_label || item.name || '反向关系'
}
