import React, { useEffect, useMemo, useState } from 'react'
import { Button, Layout, Menu, Spin, Tooltip } from 'antd'
import {
  BookOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  EditOutlined,
  FileTextOutlined,
  FlagOutlined,
  GithubOutlined,
  HomeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ProjectOutlined,
  ReadOutlined,
  SettingOutlined,
  TagsOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { navigate, parseTags, useRoute } from '../router'
import { useAppData } from './AppDataContext'
import {
  breadcrumb,
  docTypeFromSegments,
  pageTitle,
  planTypeFromSegments,
  subsystemOf,
} from './navigation'
import { typeVisual } from '../subsystems/records/components/TypeIcon'
import { PLAN_TYPES } from '../subsystems/plans/planMeta'
import MainPage from './MainPage'
import RecordsHomePage from '../subsystems/records/pages/HomePage'
import RecordsPage from '../subsystems/records/pages/RecordsPage'
import TagsPage from '../subsystems/records/pages/TagsPage'
import TagFilterPage from '../subsystems/records/pages/TagFilterPage'
import TypesPage from '../subsystems/records/pages/TypesPage'
import PlanOverviewPage from '../subsystems/plans/pages/PlanOverviewPage'
import PlanListPage from '../subsystems/plans/pages/PlanListPage'
import PlanTagsPage from '../subsystems/plans/pages/PlanTagsPage'
import PlanTagFilterPage from '../subsystems/plans/pages/PlanTagFilterPage'
import PlanFuzzyTagPage from '../subsystems/plans/pages/PlanFuzzyTagPage'
import DocsOverviewPage from '../subsystems/docs/pages/DocsOverviewPage'
import DocListPage from '../subsystems/docs/pages/DocListPage'
import DocContentPage from '../subsystems/docs/pages/DocContentPage'
import DocEditPage from '../subsystems/docs/pages/DocEditPage'
import DocTypesPage from '../subsystems/docs/pages/DocTypesPage'
import DocTagsPage from '../subsystems/docs/pages/DocTagsPage'
import NotesListPage from '../subsystems/docs/pages/NotesListPage'
import NoteTagsPage from '../subsystems/docs/pages/NoteTagsPage'
import NoteTypesPage from '../subsystems/docs/pages/NoteTypesPage'
import RepositoryListPage from '../subsystems/repositories/pages/RepositoryListPage'
import RepositoryTagsPage from '../subsystems/repositories/pages/RepositoryTagsPage'
import RepositoryLanguagesPage from '../subsystems/repositories/pages/RepositoryLanguagesPage'
import RepositoryFuzzyTagPage from '../subsystems/repositories/pages/RepositoryFuzzyTagPage'
import ToolListPage from '../subsystems/tools/pages/ToolListPage'
import ToolFuzzyTagPage from '../subsystems/tools/pages/ToolFuzzyTagPage'
import ToolTagsPage from '../subsystems/tools/pages/ToolTagsPage'
import ToolPlatformsPage from '../subsystems/tools/pages/ToolPlatformsPage'

const { Sider, Header, Content } = Layout

function parseListParam(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function AppShell() {
  const route = useRoute()
  const { types, typesLoading, docTypes, docTypesLoading } = useAppData()
  const [mobile, setMobile] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const subsystem = subsystemOf(route.segments)
  const title = pageTitle(route.segments, types, docTypes)
  const crumbs = breadcrumb(route.segments, types, docTypes)

  useEffect(() => {
    if (mobile) setCollapsed(true)
  }, [route.path, mobile])

  useEffect(() => {
    const width = mobile || collapsed ? 0 : 252
    document.documentElement.style.setProperty('--app-sider-width', `${width}px`)
  }, [mobile, collapsed])

  const selectedKey = useMemo(() => {
    if (route.segments[0] === 'type') return `/type/${route.segments[1]}`
    if (route.segments[0] === 'tags') return '/tags'
    if (route.segments[0] === 'tag-search') return '/tag-search'
    if (route.segments[0] === 'manage') return '/manage'
    if (route.segments[0] === 'records') return '/records'
    if (route.segments[0] === 'plans') {
      if (route.segments[1] === 'tag-search') return '/plans/tag-search'
      if (route.segments[1] === 'tags') return '/plans/tags'
      const type = planTypeFromSegments(route.segments)
      if (type) return type.path
      return '/plans'
    }
    if (route.segments[0] === 'docs') {
      if (route.segments[1] === 'notes') {
        if (route.segments[2] === 'types') return '/docs/notes/types'
        if (route.segments[2] === 'tag-search') return '/docs/notes/tag-search'
        if (route.segments[2] === 'tags') return '/docs/notes/tags'
        return '/docs/notes'
      }
      if (route.segments[1] === 'types') return '/docs/types'
      if (route.segments[1] === 'tag-search') return '/docs/tag-search'
      if (route.segments[1] === 'tags') return '/docs/tags'
      if (route.segments[1] === 'type') return `/docs/type/${route.segments[2]}`
      return '/docs'
    }
    if (route.segments[0] === 'repositories') {
      if (route.segments[1] === 'languages') return '/repositories/languages'
      if (route.segments[1] === 'tag-search') return '/repositories/tag-search'
      if (route.segments[1] === 'tags') return '/repositories/tags'
      return '/repositories'
    }
    if (route.segments[0] === 'tools') {
      if (route.segments[1] === 'platforms') return '/tools/platforms'
      if (route.segments[1] === 'tag-search') return '/tools/tag-search'
      if (route.segments[1] === 'tags') return '/tools/tags'
      return '/tools'
    }
    return '/'
  }, [route.segments])

  const menuItems = useMemo(() => {
    const items = [
      {
        key: 'home',
        type: 'group',
        label: '入口',
        children: [
          { key: '/', icon: <HomeOutlined />, label: '主页面' },
        ],
      },
    ]

    if (subsystem === 'records') {
      const recordItems = [
        { key: '/records', icon: <BookOutlined />, label: '记录总览' },
      ]
      if (types.length) {
        recordItems.push({
          key: 'record-types',
          type: 'group',
          label: '记录类型',
          children: types.map((type) => {
            const visual = typeVisual(type.name)
            return {
              key: `/type/${type.id}`,
              icon: <span className={`menu-dot type-tone-${visual.tone}`} />,
              label: (
                <span className="menu-type-label">
                  <span className="menu-type-name">{type.name}</span>
                  <span className="menu-type-count">{type.record_count}</span>
                </span>
              ),
            }
          }),
        })
      }
      recordItems.push(
        { key: '/tags', icon: <TagsOutlined />, label: '标签库' },
        { key: '/tag-search', icon: <TagsOutlined />, label: '标签模糊搜索' },
        { key: '/manage', icon: <SettingOutlined />, label: '类型管理' },
      )
      items.push({
        key: 'records',
        type: 'group',
        label: '通用记录',
        children: recordItems,
      })
    } else if (subsystem === 'plans') {
      items.push({
        key: 'plans',
        type: 'group',
        label: '计划管理',
        children: [
          {
            key: '/plans',
            icon: <ProjectOutlined />,
            label: '计划总览',
          },
          ...PLAN_TYPES.map((type) => ({
            key: type.path,
            icon: <CalendarOutlined />,
            label: type.label,
          })),
          { key: '/plans/tags', icon: <FlagOutlined />, label: '计划标签' },
          {
            key: '/plans/tag-search',
            icon: <TagsOutlined />,
            label: '标签模糊搜索',
          },
        ],
      })
    } else if (subsystem === 'docs') {
      const docItems = [
        { key: '/docs', icon: <ReadOutlined />, label: '文档总览' },
      ]
      if (docTypes.length) {
        docItems.push({
          key: 'doc-types',
          type: 'group',
          label: '文档类型',
          children: docTypes.map((type) => ({
            key: `/docs/type/${type.id}`,
            icon: <FileTextOutlined />,
            label: (
              <span className="menu-type-label">
                <span className="menu-type-name">{type.name}</span>
                <span className="menu-type-count">{type.document_count}</span>
              </span>
            ),
          })),
        })
      }
      docItems.push(
        { key: '/docs/tags', icon: <TagsOutlined />, label: '文档标签' },
        {
          key: '/docs/tag-search',
          icon: <TagsOutlined />,
          label: '标签模糊搜索',
        },
        { key: '/docs/types', icon: <SettingOutlined />, label: '类型管理' },
      )
      items.push({
        key: 'docs',
        type: 'group',
        label: '书籍与文档',
        children: docItems,
      })
      items.push({
        key: 'doc-notes',
        type: 'group',
        label: '笔记管理',
        children: [
          { key: '/docs/notes', icon: <EditOutlined />, label: '笔记列表' },
          {
            key: '/docs/notes/tags',
            icon: <TagsOutlined />,
            label: '笔记标签',
          },
          {
            key: '/docs/notes/tag-search',
            icon: <TagsOutlined />,
            label: '标签模糊搜索',
          },
          {
            key: '/docs/notes/types',
            icon: <SettingOutlined />,
            label: '类型管理',
          },
        ],
      })
    } else if (subsystem === 'repositories') {
      items.push({
        key: 'repositories',
        type: 'group',
        label: '仓库管理',
        children: [
          {
            key: '/repositories',
            icon: <GithubOutlined />,
            label: '仓库列表',
          },
          {
            key: '/repositories/languages',
            icon: <TagsOutlined />,
            label: '编程语言管理',
          },
          {
            key: '/repositories/tags',
            icon: <TagsOutlined />,
            label: '仓库标签管理',
          },
          {
            key: '/repositories/tag-search',
            icon: <TagsOutlined />,
            label: '标签模糊搜索',
          },
        ],
      })
    } else if (subsystem === 'tools') {
      items.push({
        key: 'tools',
        type: 'group',
        label: '工具管理',
        children: [
          { key: '/tools', icon: <ToolOutlined />, label: '工具列表' },
          {
            key: '/tools/platforms',
            icon: <TagsOutlined />,
            label: '支持平台管理',
          },
          {
            key: '/tools/tags',
            icon: <TagsOutlined />,
            label: '工具标签管理',
          },
          {
            key: '/tools/tag-search',
            icon: <TagsOutlined />,
            label: '标签模糊搜索',
          },
        ],
      })
    } else {
      items.push({
        key: 'systems',
        type: 'group',
        label: '子系统',
        children: [
          { key: '/records', icon: <BookOutlined />, label: '通用记录' },
          { key: '/plans', icon: <CalendarOutlined />, label: '计划管理' },
          { key: '/docs', icon: <ReadOutlined />, label: '书籍与文档' },
          {
            key: '/repositories',
            icon: <GithubOutlined />,
            label: '仓库管理',
          },
          { key: '/tools', icon: <ToolOutlined />, label: '工具管理' },
        ],
      })
    }
    return items
  }, [subsystem, types, docTypes])

  const renderPage = () => {
    if (!route.segments.length) return <MainPage />
    if (route.segments[0] === 'records') return <RecordsHomePage />
    if (route.segments[0] === 'type' && route.segments[1]) {
      return <RecordsPage key={route.segments[1]} typeId={route.segments[1]} />
    }
    if (route.segments[0] === 'tags') {
      if (route.segments.length > 1) {
        return <TagFilterPage query={route.segments.slice(1).join('/')} />
      }
      return <TagsPage />
    }
    if (route.segments[0] === 'tag-search') {
      const fuzzyQuery = route.segments.slice(1).join('/')
      return (
        <TagFilterPage
          key={`tag-search:${fuzzyQuery}`}
          fuzzy
          query={fuzzyQuery}
        />
      )
    }
    if (route.segments[0] === 'manage') return <TypesPage />
    if (route.segments[0] === 'plans') {
      if (route.segments.length === 1) return <PlanOverviewPage />
      if (route.segments[1] === 'tag-search') {
        const fuzzyQuery = route.segments.slice(2).join('/')
        return (
          <PlanFuzzyTagPage
            key={`plans-tag-search:${fuzzyQuery}`}
            query={fuzzyQuery}
          />
        )
      }
      if (route.segments[1] === 'tags') {
        if (route.segments.length > 2) {
          return <PlanTagFilterPage query={route.segments.slice(2).join('/')} />
        }
        return <PlanTagsPage />
      }
      const type = planTypeFromSegments(route.segments)
      if (type) return <PlanListPage key={type.key} type={type.key} />
    }
    if (route.segments[0] === 'repositories') {
      if (route.segments[1] === 'languages') return <RepositoryLanguagesPage />
      if (route.segments[1] === 'tag-search') {
        const fuzzyQuery = route.segments.slice(2).join('/')
        return (
          <RepositoryFuzzyTagPage
            key={`repositories-tag-search:${fuzzyQuery}`}
            query={fuzzyQuery}
          />
        )
      }
      if (route.segments[1] === 'tags') return <RepositoryTagsPage />
      return (
        <RepositoryListPage
          key={`repositories:${route.query.toString()}`}
          initialTags={parseListParam(route.query.get('tags'))}
          initialLanguages={parseListParam(route.query.get('languages'))}
        />
      )
    }
    if (route.segments[0] === 'tools') {
      if (route.segments[1] === 'platforms') return <ToolPlatformsPage />
      if (route.segments[1] === 'tag-search') {
        const fuzzyQuery = route.segments.slice(2).join('/')
        return (
          <ToolFuzzyTagPage
            key={`tools-tag-search:${fuzzyQuery}`}
            query={fuzzyQuery}
          />
        )
      }
      if (route.segments[1] === 'tags') return <ToolTagsPage />
      return (
        <ToolListPage
          key={`tools:${route.query.toString()}`}
          initialTags={parseListParam(route.query.get('tags'))}
          initialPlatforms={parseListParam(route.query.get('platforms'))}
        />
      )
    }
    if (route.segments[0] === 'docs') {
      if (route.segments.length === 1) return <DocsOverviewPage />
      if (route.segments[1] === 'notes') {
        if (route.segments[2] === 'types') return <NoteTypesPage />
        if (route.segments[2] === 'tag-search') {
          const fuzzyQuery = route.segments.slice(3).join('/')
          return (
            <NotesListPage
              key={`docs-notes-tag-search:${fuzzyQuery}`}
              fuzzyTagMode
              initialTagQ={fuzzyQuery}
            />
          )
        }
        if (route.segments[2] === 'tags') {
          if (route.segments.length > 3) {
            const tagQuery = route.segments.slice(3).join('/')
            return (
              <NotesListPage
                key={`docs-notes-tags:${tagQuery}`}
                tagMode
                initialTags={parseTags(tagQuery)}
              />
            )
          }
          return <NoteTagsPage />
        }
        return (
          <NotesListPage
            key={`docs-notes:${route.query.toString()}`}
            initialDocId={route.query.get('doc_id')}
          />
        )
      }
      if (route.segments[1] === 'types') return <DocTypesPage />
      if (route.segments[1] === 'tag-search') {
        const fuzzyQuery = route.segments.slice(2).join('/')
        return (
          <DocListPage
            key={`docs-tag-search:${fuzzyQuery}`}
            tagMode
            fuzzyTagMode
            initialTagQ={fuzzyQuery}
          />
        )
      }
      if (route.segments[1] === 'tags') {
        if (route.segments.length > 2) {
          const tagQuery = route.segments.slice(2).join('/')
          return (
            <DocListPage
              key={`docs-tags:${tagQuery}`}
              tagMode
              initialTags={parseTags(tagQuery)}
            />
          )
        }
        return <DocTagsPage />
      }
      if (route.segments[1] === 'new') {
        return (
          <DocEditPage
            key={route.query.get('type') || 'new'}
            defaultTypeId={route.query.get('type')}
          />
        )
      }
      if (route.segments[1] === 'type' && route.segments[2]) {
        const type = docTypeFromSegments(route.segments, docTypes)
        if (!docTypesLoading && !type) {
          return (
            <div className="not-found">
              <div className="not-found-code">404</div>
              <h1>文档类型不存在</h1>
              <p>它可能已经被删除，或者地址有误。</p>
              <Button type="primary" onClick={() => navigate('/docs/types')}>
                前往类型管理
              </Button>
            </div>
          )
        }
        return (
          <DocListPage
            key={route.segments[2]}
            typeId={route.segments[2]}
            initialTags={parseTags(route.query.get('tags'))}
          />
        )
      }
      if (route.segments[2] === 'edit' && route.segments[1]) {
        return <DocEditPage key={route.segments[1]} documentId={route.segments[1]} />
      }
      if (route.segments[1]) {
        return <DocContentPage key={route.segments[1]} documentId={route.segments[1]} />
      }
    }
    return (
      <div className="not-found">
        <div className="not-found-code">404</div>
        <h1>这里没有内容</h1>
        <p>页面地址可能写错了，或者内容已经被移动。</p>
        <Button type="primary" onClick={() => navigate('/')}>
          回到主页面
        </Button>
      </div>
    )
  }

  const closeMobileMenu = () => {
    if (mobile) setCollapsed(true)
  }

  return (
    <Layout className="app-shell">
      {mobile && !collapsed ? (
        <div className="sider-mask" onClick={() => setCollapsed(true)} />
      ) : null}
      <Sider
        width={252}
        className="app-sider"
        collapsible
        collapsed={collapsed}
        collapsedWidth={0}
        trigger={null}
        breakpoint="lg"
        onBreakpoint={(broken) => {
          setMobile(broken)
          setCollapsed(broken)
        }}
      >
        <div className="sider-inner">
          <button
            type="button"
            className="brand"
            onClick={() => {
              navigate('/')
              closeMobileMenu()
            }}
          >
            <span className="brand-mark">拾</span>
            <span className="brand-copy">
              <span className="brand-name">拾录</span>
              <span className="brand-sub">
                RECORDS · PLANS · DOCS · REPOS · TOOLS
              </span>
            </span>
          </button>

          <div className="sider-nav">
            {(typesLoading && subsystem === 'records') ||
            (docTypesLoading && subsystem === 'docs') ? (
              <div className="sider-loading">
                <Spin size="small" />
              </div>
            ) : (
              <Menu
                theme="dark"
                mode="inline"
                selectedKeys={[selectedKey]}
                items={menuItems}
                onClick={({ key }) => {
                  navigate(key)
                  closeMobileMenu()
                }}
              />
            )}
          </div>

          <div className="sider-footer">
            <div className="sider-footer-row">
              <DatabaseOutlined />
              <span>SQLite · 五库隔离</span>
            </div>
            <div className="sider-footer-meta">
              records.db / plans.db / docs.db / repository.db / tools.db
            </div>
          </div>
        </div>
      </Sider>

      <Layout className="app-main">
        <Header className="app-header">
          <div className="header-left">
            <Tooltip title={collapsed ? '展开侧边栏' : '收起侧边栏'}>
              <Button
                className="mobile-menu-button"
                type="text"
                aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
                aria-expanded={!collapsed}
                icon={
                  collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />
                }
                onClick={() => setCollapsed((value) => !value)}
              />
            </Tooltip>
            <div className="header-crumb">
              <span className="crumb-root">{crumbs[0]}</span>
              <span className="crumb-slash">/</span>
              {crumbs.length > 2 ? (
                <>
                  <span className="crumb-section">{crumbs[1]}</span>
                  <span className="crumb-slash">/</span>
                </>
              ) : null}
              <span className="crumb-current">
                {crumbs[crumbs.length - 1]}
              </span>
            </div>
          </div>
          <div className="header-right">
            <Tooltip title="records.db / plans.db / docs.db / repository.db / tools.db，五个数据库完全隔离">
              <span className="status-pill">
                <span className="status-dot" />
                五库隔离
              </span>
            </Tooltip>
          </div>
        </Header>

        <Content className="app-content">
          <div className="content-inner">{renderPage()}</div>
        </Content>
      </Layout>
    </Layout>
  )
}
