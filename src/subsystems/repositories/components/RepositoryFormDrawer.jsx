import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Drawer,
  Form,
  Input,
  Space,
  Spin,
} from 'antd'
import { repositoryApi } from '../api'
import FuzzyTagSelect from '../../../components/FuzzyTagSelect'
import MarkdownEditor from '../../../components/MarkdownEditor'
import ResourceListEditor from '../../../components/ResourceListEditor'
import RelatedItemEditor from '../../../components/RelatedItemEditor'

const EMPTY = {
  name: '',
  description: '',
  evaluation: '',
  languages: [],
  tags: [],
  resources: [],
  relations: [],
}

export default function RepositoryFormDrawer({
  open,
  repository,
  onClose,
  onSaved,
}) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tagOptions, setTagOptions] = useState([])
  const [languageOptions, setLanguageOptions] = useState([])
  const [repositoryOptions, setRepositoryOptions] = useState([])

  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    Promise.all([
      repositoryApi.listTags({ sort: 'name' }),
      repositoryApi.listLanguages({ sort: 'name' }),
      repositoryApi.list({ limit: 1000, sort: 'name_asc' }),
    ])
      .then(([tagsData, languagesData, repositoriesData]) => {
        if (!alive) return
        setTagOptions(tagsData.tags.map((tag) => tag.name))
        setLanguageOptions(languagesData.languages.map((item) => item.name))
        setRepositoryOptions(repositoriesData.repositories)
        if (repository?.id) {
          return repositoryApi.get(repository.id).then((detail) => {
            if (!alive) return
            form.setFieldsValue({
              name: detail.name,
              description: detail.description,
              evaluation: detail.evaluation,
              languages: detail.languages,
              tags: detail.tags,
              resources: detail.resources.map((item) => ({
                name: item.name,
                url: item.url,
              })),
              relations: detail.relations.map((item) => ({
                related_repository_id: item.related_repository_id,
                description: item.description,
              })),
            })
          })
        }
        form.resetFields()
        form.setFieldsValue(EMPTY)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, repository?.id])

  const submit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const payload = {
        name: values.name,
        description: values.description || '',
        evaluation: values.evaluation || '',
        languages: values.languages || [],
        tags: values.tags || [],
        resources: (values.resources || []).map((item) => ({
          name: item?.name || '',
          url: item?.url || '',
        })),
        relations: (values.relations || []).map((item) => ({
          related_repository_id: item.related_repository_id,
          description: item.description || '',
        })),
      }
      if (repository?.id) {
        await repositoryApi.update(repository.id, payload)
        message.success('仓库已更新')
      } else {
        await repositoryApi.create(payload)
        message.success('仓库已创建')
      }
      onSaved?.()
      onClose?.()
    } catch (error) {
      if (!error?.errorFields) message.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={760}
      destroyOnClose
      title={repository?.id ? '编辑仓库' : '新建仓库'}
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={submit}>
            保存
          </Button>
        </Space>
      }
    >
      {loading ? (
        <div className="drawer-loading">
          <Spin />
        </div>
      ) : (
        <Form form={form} layout="vertical" initialValues={EMPTY}>
          <Form.Item
            name="name"
            label="仓库名称"
            rules={[
              { required: true, message: '请输入仓库名称' },
              { max: 255, message: '仓库名称不能超过 255 个字符' },
            ]}
          >
            <Input placeholder="例如：React、SQLite、某个开源项目" />
          </Form.Item>
          <Form.Item name="description" label="仓库描述">
            <MarkdownEditor
              minRows={3}
              placeholder="这个仓库是做什么的？支持 Markdown。"
            />
          </Form.Item>
          <Form.Item
            name="evaluation"
            label="评价（优点 / 缺点）"
            extra="可以分点写优点、缺点、适用场景与风险，支持 Markdown。"
          >
            <MarkdownEditor
              minRows={4}
              placeholder={'## 优点\n\n- ...\n\n## 缺点\n\n- ...'}
            />
          </Form.Item>
          <Form.Item name="languages" label="编程语言">
            <FuzzyTagSelect
              options={languageOptions}
              placeholder="输入或选择编程语言，可添加新语言"
              tokenSeparators={[',', '，', ';', '；']}
            />
          </Form.Item>
          <Form.Item name="tags" label="仓库标签">
            <FuzzyTagSelect
              options={tagOptions}
              placeholder="输入标签模糊搜索，或按回车创建新标签"
            />
          </Form.Item>
          <Form.Item label="资源地址列表">
            <ResourceListEditor name="resources" />
          </Form.Item>
          <Form.Item label="关联品（相似品 / 替代品等）">
            <RelatedItemEditor
              name="relations"
              relatedField="related_repository_id"
              options={repositoryOptions}
              itemLabel="仓库"
              disabledId={repository?.id}
            />
          </Form.Item>
        </Form>
      )}
    </Drawer>
  )
}
