import React from 'react'
import { Button, Form, Input, Select, Space } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'

export default function RelatedItemEditor({
  name = 'relations',
  relatedField = 'related_id',
  options = [],
  itemLabel = '仓库',
  descriptionLabel = '关联描述',
  addText = '添加关联品',
  disabledId = null,
}) {
  const selectOptions = (options || [])
    .filter((item) => String(item.id) !== String(disabledId))
    .map((item) => ({ value: item.id, label: item.name }))

  return (
    <Form.List name={name}>
      {(fields, { add, remove }) => (
        <div className="related-editor">
          {fields.map((field, index) => (
            <div className="related-editor-row" key={field.key}>
              <Form.Item
                {...field}
                name={[field.name, relatedField]}
                rules={[{ required: true, message: `请选择${itemLabel}` }]}
              >
                <Select
                  showSearch
                  placeholder={`按${itemLabel}名称模糊搜索`}
                  options={selectOptions}
                  filterOption={(input, option) =>
                    String(option?.label ?? '')
                      .toLocaleLowerCase()
                      .includes(input.trim().toLocaleLowerCase())
                  }
                />
              </Form.Item>
              <Form.Item
                {...field}
                name={[field.name, 'description']}
                rules={[{ max: 2000, message: '关联描述过长' }]}
              >
                <Input placeholder={`${descriptionLabel}（如相似品 / 替代品）`} />
              </Form.Item>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label={`删除第 ${index + 1} 个关联品`}
                onClick={() => remove(field.name)}
              />
            </div>
          ))}
          <Space>
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => add({ [relatedField]: undefined, description: '' })}
            >
              {addText}
            </Button>
          </Space>
        </div>
      )}
    </Form.List>
  )
}
