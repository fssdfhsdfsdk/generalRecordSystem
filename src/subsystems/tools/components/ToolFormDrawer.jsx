import React, { useEffect, useState } from 'react'
import {
  App as AntApp,
  Button,
  Drawer,
  Form,
  Input,
  Space,
  Spin,
  Switch,
} from 'antd'
import { toolApi } from '../api'
import FuzzyTagSelect from '../../../components/FuzzyTagSelect'
import MarkdownEditor from '../../../components/MarkdownEditor'
import ResourceListEditor from '../../../components/ResourceListEditor'
import RelatedItemEditor from '../../../components/RelatedItemEditor'

const EMPTY = {
  name: '',
  description: '',
  evaluation: '',
  is_open_source: false,
  platforms: [],
  tags: [],
  resources: [],
  relations: [],
}

export default function ToolFormDrawer({ open, tool, onClose, onSaved }) {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tagOptions, setTagOptions] = useState([])
  const [platformOptions, setPlatformOptions] = useState([])
  const [toolOptions, setToolOptions] = useState([])

  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    Promise.all([
      toolApi.listTags({ sort: 'name' }),
      toolApi.listPlatforms({ sort: 'name' }),
      toolApi.list({ limit: 1000, sort: 'name_asc' }),
    ])
      .then(([tagsData, platformsData, toolsData]) => {
        if (!alive) return
        setTagOptions(tagsData.tags.map((tag) => tag.name))
        setPlatformOptions(platformsData.platforms.map((item) => item.name))
        setToolOptions(toolsData.tools)
        if (tool?.id) {
          return toolApi.get(tool.id).then((detail) => {
            if (!alive) return
            form.setFieldsValue({
              name: detail.name,
              description: detail.description,
              evaluation: detail.evaluation,
              is_open_source: detail.is_open_source,
              platforms: detail.platforms,
              tags: detail.tags,
              resources: detail.resources.map((item) => ({
                name: item.name,
                url: item.url,
              })),
              relations: detail.relations.map((item) => ({
                related_tool_id: item.related_tool_id,
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
  }, [open, tool?.id])

  const submit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const payload = {
        name: values.name,
        description: values.description || '',
        evaluation: values.evaluation || '',
        is_open_source: Boolean(values.is_open_source),
        platforms: values.platforms || [],
        tags: values.tags || [],
        resources: (values.resources || []).map((item) => ({
          name: item?.name || '',
          url: item?.url || '',
        })),
        relations: (values.relations || []).map((item) => ({
          related_tool_id: item.related_tool_id,
          description: item.description || '',
        })),
      }
      if (tool?.id) {
        await toolApi.update(tool.id, payload)
        message.success('工具已更新')
      } else {
        await toolApi.create(payload)
        message.success('工具已创建')
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
      title={tool?.id ? '编辑工具' : '新建工具'}
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
            label="工具名称"
            rules={[
              { required: true, message: '请输入工具名称' },
              { max: 255, message: '工具名称不能超过 255 个字符' },
            ]}
          >
            <Input placeholder="例如：VS Code、Docker、Postman" />
          </Form.Item>
          <Form.Item name="description" label="工具描述">
            <MarkdownEditor
              minRows={3}
              placeholder="这个工具能解决什么问题？支持 Markdown。"
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
          <Form.Item
            name="is_open_source"
            label="是否开源"
            valuePropName="checked"
          >
            <Switch checkedChildren="开源" unCheckedChildren="闭源" />
          </Form.Item>
          <Form.Item name="platforms" label="支持平台">
            <FuzzyTagSelect
              options={platformOptions}
              placeholder="选择或输入支持平台，可添加新平台"
              tokenSeparators={[',', '，', ';', '；']}
            />
          </Form.Item>
          <Form.Item name="tags" label="工具标签">
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
              relatedField="related_tool_id"
              options={toolOptions}
              itemLabel="工具"
              disabledId={tool?.id}
            />
          </Form.Item>
        </Form>
      )}
    </Drawer>
  )
}
