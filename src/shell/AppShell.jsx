import React, { useEffect, useMemo, useState } from 'react'
import { Button, Layout, Menu, Spin, Tooltip } from 'antd'
import {
  AppstoreOutlined,
  BookOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  FlagOutlined,
  HomeOutlined,
  MenuOutlined,
  ProjectOutlined,
  SettingOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { navigate, useRoute } from '../router'
import { useAppData } from './AppDataContext'
import {
  breadcrumb,
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

const { Sider, Header, Content } = Layout

export default function AppShell() {
  const route = useRoute()
  const { types, typesLoading } = useAppData()
  const [mobile, setMobile] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const subsystem = subsystemOf(route.segments)
  const title = pageTitle(route.segments, types)
  const crumbs = breadcrumb(route.segments, types)

  useEffect(() => {
    if (mobile) setCollapsed(true)
  }, [route.path, mobile])

  const selectedKey = useMemo(() => {
    if (route.segments[0] === 'type') return `/type/${route.segments[1]}`
    if (route.segments[0] === 'tags') return '/tags'
    if (route.segments[0] === 'manage') return '/manage'
    if (route.segments[0] === 'records') return '/records'
    if (route.segments[0] === 'plans') {
      if (route.segments[1] === 'tags') return '/plans/tags'
      const type = planTypeFromSegments(route.segments)
      if (type) return type.path
      return '/plans'
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
        ],
      })
    }
    return items
  }, [subsystem, types])

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
    if (route.segments[0] === 'manage') return <TypesPage />
    if (route.segments[0] === 'plans') {
      if (route.segments.length === 1) return <PlanOverviewPage />
      if (route.segments[1] === 'tags') {
        if (route.segments.length > 2) {
          return <PlanTagFilterPage query={route.segments.slice(2).join('/')} />
        }
        return <PlanTagsPage />
      }
      const type = planTypeFromSegments(route.segments)
      if (type) return <PlanListPage key={type.key} type={type.key} />
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
              <span className="brand-sub">RECORDS · PLANS</span>
            </span>
          </button>

          <div className="sider-nav">
            {typesLoading && subsystem === 'records' ? (
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
              <span>SQLite · 双库隔离</span>
            </div>
            <div className="sider-footer-meta">
              records.db / plans.db 各自独立
            </div>
          </div>
        </div>
      </Sider>

      <Layout className="app-main">
        <Header className="app-header">
          <div className="header-left">
            <Button
              className="mobile-menu-button"
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setCollapsed((value) => !value)}
            />
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
            <Tooltip title="记录 data/records.db，计划 data/plans.db，两个库完全隔离">
              <span className="status-pill">
                <span className="status-dot" />
                双库隔离
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
