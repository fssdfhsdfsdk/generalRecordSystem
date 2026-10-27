import React from 'react'
import ReactDOM from 'react-dom/client'
import { App as AntApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import App from './App'
import './styles.css'

dayjs.locale('zh-cn')

const theme = {
  token: {
    colorPrimary: '#4f46e5',
    colorInfo: '#4f46e5',
    colorSuccess: '#0f9f6e',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    colorText: '#111827',
    colorTextSecondary: '#5b6472',
    colorBorder: '#e2e5ee',
    colorBorderSecondary: '#eceef4',
    colorBgLayout: '#f4f5f9',
    borderRadius: 10,
    borderRadiusLG: 14,
    controlHeight: 38,
    fontFamily:
      '"Inter", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif',
    fontSize: 14,
    boxShadowSecondary: '0 18px 50px rgba(15, 23, 42, 0.12)',
  },
  components: {
    Button: {
      fontWeight: 500,
      primaryShadow: '0 6px 16px rgba(79, 70, 229, 0.24)',
    },
    Card: {
      borderRadiusLG: 16,
      paddingLG: 22,
    },
    Table: {
      headerBg: '#f8f9fc',
      headerColor: '#64748b',
      headerSplitColor: 'transparent',
      rowHoverBg: '#fafbff',
      borderColor: '#eef0f6',
      cellPaddingBlock: 14,
    },
    Menu: {
      darkItemBg: 'transparent',
      darkItemSelectedBg: 'rgba(99, 102, 241, 0.18)',
      darkItemSelectedColor: '#ffffff',
      darkItemColor: '#94a3b8',
      darkItemHoverBg: 'rgba(148, 163, 184, 0.1)',
      darkItemHoverColor: '#e2e8f0',
      itemBorderRadius: 9,
      itemMarginInline: 10,
      itemHeight: 40,
    },
    Drawer: {
      paddingLG: 24,
    },
    Input: {
      activeShadow: '0 0 0 3px rgba(79, 70, 229, 0.1)',
    },
    Select: {
      optionSelectedBg: '#eef2ff',
    },
    Tabs: {
      itemSelectedColor: '#4f46e5',
      inkBarColor: '#4f46e5',
    },
  },
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={theme}
      button={{ autoInsertSpace: false }}
    >
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
)
