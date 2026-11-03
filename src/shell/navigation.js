import { PLAN_TYPES } from '../subsystems/plans/planMeta'

export const RECORDS_PREFIXES = new Set(['records', 'type', 'tags', 'manage'])
export const PLANS_PREFIXES = new Set(['plans'])
export const DOCS_PREFIXES = new Set(['docs'])

export function subsystemOf(segments) {
  if (!segments.length) return 'home'
  if (RECORDS_PREFIXES.has(segments[0])) return 'records'
  if (PLANS_PREFIXES.has(segments[0])) return 'plans'
  if (DOCS_PREFIXES.has(segments[0])) return 'docs'
  return 'unknown'
}

export function planTypeFromSegments(segments) {
  if (segments[0] !== 'plans') return null
  return PLAN_TYPES.find((item) => item.key === segments[1]) || null
}

export function docTypeFromSegments(segments, docTypes = []) {
  if (segments[0] !== 'docs' || segments[1] !== 'type') return null
  return docTypes.find((item) => String(item.id) === segments[2]) || null
}

export function pageTitle(segments, types = [], docTypes = []) {
  if (!segments.length) return '主页面'
  if (segments[0] === 'records') return '记录总览'
  if (segments[0] === 'type') {
    const type = types.find((item) => String(item.id) === segments[1])
    return type?.name || '记录'
  }
  if (segments[0] === 'tags') {
    return segments.length > 1 ? '标签筛选' : '标签库'
  }
  if (segments[0] === 'manage') return '类型管理'
  if (segments[0] === 'plans') {
    if (segments[1] === 'tags') {
      return segments.length > 2 ? '计划标签筛选' : '计划标签'
    }
    const type = planTypeFromSegments(segments)
    if (type) return type.label
    return '计划总览'
  }
  if (segments[0] === 'docs') {
    if (segments.length === 1) return '书籍与文档'
    if (segments[1] === 'types') return '文档类型管理'
    if (segments[1] === 'tags') return '文档标签管理'
    if (segments[1] === 'new') return '新建文档'
    if (segments[1] === 'type') {
      const type = docTypeFromSegments(segments, docTypes)
      return type?.name || '文档类型'
    }
    if (segments[2] === 'edit') return '编辑文档'
    return '文档内容'
  }
  return '未找到'
}

export function breadcrumb(segments, types = [], docTypes = []) {
  const subsystem = subsystemOf(segments)
  if (subsystem === 'home') return ['拾录', '主页面']
  if (subsystem === 'records') {
    if (segments[0] === 'records') return ['拾录', '通用记录', '记录总览']
    if (segments[0] === 'type') return ['拾录', '通用记录', pageTitle(segments, types, docTypes)]
    if (segments[0] === 'tags') {
      return ['拾录', '通用记录', segments.length > 1 ? '标签筛选' : '标签库']
    }
    return ['拾录', '通用记录', '类型管理']
  }
  if (subsystem === 'plans') {
    if (segments[0] === 'plans' && segments.length === 1) {
      return ['拾录', '计划管理', '计划总览']
    }
    if (segments[1] === 'tags') return ['拾录', '计划管理', '计划标签']
    return ['拾录', '计划管理', pageTitle(segments, types, docTypes)]
  }
  if (subsystem === 'docs') {
    if (segments.length === 1) return ['拾录', '书籍与文档', '文档总览']
    if (segments[1] === 'types') return ['拾录', '书籍与文档', '类型管理']
    if (segments[1] === 'tags') return ['拾录', '书籍与文档', '标签管理']
    if (segments[1] === 'type') {
      return ['拾录', '书籍与文档', pageTitle(segments, types, docTypes)]
    }
    if (segments[1] === 'new') return ['拾录', '书籍与文档', '新建文档']
    if (segments[2] === 'edit') return ['拾录', '书籍与文档', '编辑文档']
    return ['拾录', '书籍与文档', '文档内容']
  }
  return ['拾录', '未找到']
}
