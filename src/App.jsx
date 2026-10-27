import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  Layout,
  Menu,
  Spin,
  Tooltip,
} from 'antd'
import {
  AppstoreOutlined,
  DatabaseOutlined,
  MenuOutlined,
  SettingOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { api } from './api'
import { navigate, useRoute } from './router'
import { typeVisual } from './components/TypeIcon'
import HomePage from './pages/HomePage'
import RecordsPage from './pages/RecordsPage'
import TagsPage from './pages/TagsPage'
import TagFilterPage from './pages/TagFilterPage'
import TypesPage from './pages/TypesPage'

const AppDataContext = createContext({
  types: [],
  typesLoading: true,
  reloadTypes: () => {},
})

export function useAppData() {
  return useContext(AppDataContext)
}

const { Sider, Header, Content } = Layout

export default function App() {
  const route = useRoute()
  const { message } = AntApp.useApp()
  const [types, setTypes] = useState([])
  const [typesLoading, setTypesLoading] = useState(true)
  const [mobile, setMobile] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const reloadTypes = useCallback(async () => {
    try {
      const data = await api.listTypes()
      setTypes(data.types)
      return data.types
    } catch (error) {
      message.error(error.message)
      return []
    } finally {
      setTypesLoading(false)
    }
  }, [message])

  useEffect(() => {
    reloadTypes()
  }, [reloadTypes])

  const currentType = useMemo(() => {
    if (route.segments[0] !== 'type') return null
    return types.find((type) => String(type.id) === route.segments[1]) || null
  }, [route.segments, types])

  const selectedKey = useMemo(() => {
    if (route.segments[0] === 'type') return `/type/${route.segments[1]}`
    if (route.segments[0] === 'tags') return '/tags'
    if (route.segments[0] === 'manage') return '/manage'
    return '/'
  }, [route.segments])

  const title = useMemo(() => {
    if (route.segments[0] === 'type') return currentType?.name || '记录'
    if (route.segments[0] === 'tags') {
      return route.segments.length > 1 ? '标签筛选' : '标签库'
    }
    if (route.segments[0] === 'manage') return '类型管理'
    return '总览'
  }, [route.segments, currentType])

  const menuItems = useMemo(() => {
    const items = [
      {
        key: 'workspace',
        type: 'group',
        label: '工作台',
        children: [
          {
            key: '/',
            icon: <AppstoreOutlined />,
            label: '总览',
          },
        ],
      },
    ]
    if (types.length) {
      items.push({
        key: 'types',
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
    items.push({
      key: 'management',
      type: 'group',
      label: '发现与配置',
      children: [
        { key: '/tags', icon: <TagsOutlined />, label: '标签库' },
        { key: '/manage', icon: <SettingOutlined />, label: '类型管理' },
      ],
    })
    return items
  }, [types])

  const closeMobileMenu = () => {
    if (mobile) setCollapsed(true)
  }

  const renderPage = () => {
    if (route.segments.length === 0) {
      return <HomePage />
    }
    if (route.segments[0] === 'type' && route.segments[1]) {
      return <RecordsPage key={route.segments[1]} typeId={route.segments[1]} />
    }
    if (route.segments[0] === 'tags') {
      if (route.segments.length > 1) {
        return <TagFilterPage query={route.segments.slice(1).join('/')} />
      }
      return <TagsPage />
    }
    if (route.segments[0] === 'manage') {
      return <TypesPage />
    }
    return (
      <div className="not-found">
        <div className="not-found-code">404</div>
        <h1>这里没有记录</h1>
        <p>页面地址可能写错了，或者内容已经被移动。</p>
        <Button type="primary" onClick={() => navigate('/')}>
          回到总览
        </Button>
      </div>
    )
  }

  return (
    <AppDataContext.Provider value={{ types, typesLoading, reloadTypes }}>
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
                <span className="brand-sub">GENERAL RECORDS</span>
              </span>
            </button>

            <div className="sider-nav">
              {typesLoading ? (
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
                <span>SQLite · 本地存储</span>
              </div>
              <div className="sider-footer-meta">数据只保存在这台电脑上</div>
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
                <span className="crumb-root">拾录</span>
                <span className="crumb-slash">/</span>
                <span className="crumb-current">{title}</span>
              </div>
            </div>
            <div className="header-right">
              <Tooltip title="所有数据保存在本机 data/records.db">
                <span className="status-pill">
                  <span className="status-dot" />
                  本地优先
                </span>
              </Tooltip>
            </div>
          </Header>

          <Content className="app-content">
            <div className="content-inner">{renderPage()}</div>
          </Content>
        </Layout>
      </Layout>
    </AppDataContext.Provider>
  )
}
