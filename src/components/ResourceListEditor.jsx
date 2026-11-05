import React from 'react'
import { Button, Form, Input, Space } from 'antd'
import { DeleteOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons'

export default function ResourceListEditor({
  name = 'resources',
  nameLabel = '资源名称',
  urlLabel = '资源地址',
  addText = '添加资源地址',
}) {
  return (
    <Form.List name={name}>
      {(fields, { add, remove }) => (
        <div className="resource-editor">
          {fields.map((field, index) => (
            <div className="resource-editor-row" key={field.key}>
              <Form.Item
                {...field}
                name={[field.name, 'name']}
                rules={[
                  { required: true, message: `请输入${nameLabel}` },
                  { max: 100, message: `${nameLabel}不能超过 100 个字符` },
                ]}
              >
                <Input
                  placeholder={`${nameLabel}（必填）`}
                  prefix={<LinkOutlined className="input-prefix" />}
                />
              </Form.Item>
              <Form.Item
                {...field}
                name={[field.name, 'url']}
                rules={[{ max: 2000, message: '资源地址过长' }]}
              >
                <Input placeholder={urlLabel} />
              </Form.Item>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label={`删除第 ${index + 1} 个资源地址`}
                onClick={() => remove(field.name)}
              />
            </div>
          ))}
          <Space>
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => add({ name: '', url: '' })}
            >
              {addText}
            </Button>
          </Space>
        </div>
      )}
    </Form.List>
  )
}
