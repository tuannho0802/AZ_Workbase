'use client';

import { useMemo } from 'react';
import { Select, Tag } from 'antd';
import { KeyOutlined } from '@ant-design/icons';
import type { GuidePermissionBrief } from '@/lib/api/guides.api';
import { groupPermissionOptions, matchPermissionOption } from '@/lib/guides/guide-permission-groups';

interface Props {
  /** Do `Form.Item` truyền vào. */
  value?: string[];
  onChange?: (value: string[]) => void;
  permissions: GuidePermissionBrief[];
  loading?: boolean;
}

/**
 * Chọn NHIỀU permission, gom nhóm theo resource (giống drawer Phân quyền) và tìm được theo key / mô tả / tên nhóm.
 * Key đã lưu nhưng không còn trong danh mục vẫn hiện (tag đỏ) để người soạn thấy và gỡ được.
 */
export function GuidePermissionSelect({ value, onChange, permissions, loading }: Props) {
  const groups = useMemo(() => groupPermissionOptions(permissions), [permissions]);
  const known = useMemo(() => new Set(permissions.map((p) => p.key)), [permissions]);

  return (
    <Select<string[]>
      mode="multiple"
      allowClear
      showSearch
      value={value}
      onChange={onChange}
      loading={loading}
      placeholder="Không yêu cầu quyền"
      maxTagCount="responsive"
      listHeight={360}
      options={groups}
      filterOption={(input, option) => matchPermissionOption(input, option)}
      optionRender={(option) => (
        <div>
          <div style={{ fontFamily: 'monospace' }}>{option.label}</div>
          {option.data.description && <div style={{ color: '#8c8c8c', fontSize: 12 }}>{option.data.description}</div>}
        </div>
      )}
      tagRender={({ value: key, closable, onClose }) => (
        <Tag
          icon={<KeyOutlined />}
          color={loading || known.has(String(key)) ? 'gold' : 'red'}
          closable={closable}
          onClose={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          style={{ marginInlineEnd: 4, fontFamily: 'monospace' }}
        >
          {String(key)}
        </Tag>
      )}
    />
  );
}
