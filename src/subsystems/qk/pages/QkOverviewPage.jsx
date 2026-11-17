import React, { useEffect, useState } from 'react'
import { App as AntApp, Button, Card, Skeleton, Space, Tag } from 'antd'
import {
  BranchesOutlined,
  LinkOutlined,
  PlusOutlined,
  ReadOutlined,
  SettingOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { qkApi } from '../api'
import { navigate } from '../../../router'
import PageHeader from '../../../components/PageHeader'
import { difficultyColor } from '../qkMeta'

const EMPTY = {
  questions: 0,
  knowledge: 0,
  tags: 0,
  answers: 0,
  ref_answers: 0,
  question_relations: 0,
  knowledge_relations: 0,
  question_knowledge_relations: 0,
  avg_difficulty: 0,
  recent_questions: [],
  recent_knowledge: [],
}

const ACTIONS = [
  {
    key: 'questions',
    label: '习题管理',
    description: '题目、答案历史、思维链与参考答案',
    path: '/qk/questions',
    icon: <ReadOutlined />,
    tone: 'qk-action-questions',
  },
  {
    key: 'knowledge',
    label: '知识管理',
    description: '概念、原理、技能与长文的沉淀',
    path: '/qk/knowledge',
    icon: <BranchesOutlined />,
    tone: 'qk-action-knowledge',
  },
  {
    key: 'tags',
    label: '标签管理',
    description: '习题与知识共用的标签词库',
    path: '/qk/tags',
    icon: <TagsOutlined />,
    tone: 'qk-action-tags',
  },
]

export default function QkOverviewPage() {
  const { message } = AntApp.useApp()
  const [stats, setStats] = useState(EMPTY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    qkApi
      .stats()
      .then((data) => {
        if (alive) setStats(data)
      })
      .catch((error) => {
        if (alive) message.error(error.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [message])

  const metrics = [
    { label: '习题', value: stats.questions, hint: `${stats.answers} 条答案历史` },
    { label: '知识', value: stats.knowledge, hint: `平均难度 ${stats.avg_difficulty}` },
    { label: '共享标签', value: stats.tags, hint: '习题 / 知识共用' },
    {
      label: '关系边',
      value:
        stats.question_relations +
        stats.knowledge_relations +
        stats.question_knowledge_relations,
      hint: '三类关系图',
    },
  ]

  return (
    <div className="page qk-page qk-overview">
      <PageHeader
        eyebrow="QUESTIONS & KNOWLEDGE"
        title="习题与知识管理"
        description="把题目、答案思路与知识沉淀放在同一个独立数据库里，用标签和关系把它们连成网络。"
        extra={
          <Space wrap>
            <Button
              icon={<SettingOutlined />}
              onClick={() => navigate('/qk/question-relations')}
            >
              关系管理
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/qk/questions')}>
              进入习题
            </Button>
          </Space>
        }
      />

      <Card className="qk-metric-card" styles={{ body: { padding: 20 } }}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : (
          <div className="qk-metric-grid">
            {metrics.map((item) => (
              <div className="qk-metric" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.hint}</small>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="qk-action-grid">
        {ACTIONS.map((item) => (
          <button
            type="button"
            className={`qk-action-card ${item.tone}`}
            key={item.key}
            onClick={() => navigate(item.path)}
          >
            <span className="qk-action-icon">{item.icon}</span>
            <h3>{item.label}</h3>
            <p>{item.description}</p>
            <span className="qk-action-more">进入 →</span>
          </button>
        ))}
      </div>

      <div className="qk-overview-links">
        <Button onClick={() => navigate('/qk/question-node-types')}>习题节点类型</Button>
        <Button onClick={() => navigate('/qk/question-domain-types')}>习题领域类型</Button>
        <Button onClick={() => navigate('/qk/knowledge-node-types')}>知识节点类型</Button>
        <Button onClick={() => navigate('/qk/knowledge-domain-types')}>知识领域类型</Button>
        <Button onClick={() => navigate('/qk/knowledge-relations')}>知识关系</Button>
        <Button icon={<LinkOutlined />} onClick={() => navigate('/qk/question-knowledge-relations')}>
          习题知识关系
        </Button>
      </div>

      {!loading ? (
        <div className="qk-recent-grid">
          <Card title="最近习题" size="small">
            {stats.recent_questions.length ? (
              stats.recent_questions.map((item) => (
                <button
                  type="button"
                  className="qk-recent-row"
                  key={item.id}
                  onClick={() => navigate(`/qk/questions?focus=${item.id}`)}
                >
                  <span>{item.title}</span>
                  <small>{item.node_type_name || '未分类'}</small>
                </button>
              ))
            ) : (
              <p className="muted-text">还没有习题。</p>
            )}
          </Card>
          <Card title="最近知识" size="small">
            {stats.recent_knowledge.length ? (
              stats.recent_knowledge.map((item) => (
                <button
                  type="button"
                  className="qk-recent-row"
                  key={item.id}
                  onClick={() => navigate(`/qk/knowledge?focus=${item.id}`)}
                >
                  <span>{item.title}</span>
                  <Tag color={difficultyColor(item.difficulty)} bordered={false}>
                    难度 {item.difficulty}
                  </Tag>
                </button>
              ))
            ) : (
              <p className="muted-text">还没有知识。</p>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  )
}
