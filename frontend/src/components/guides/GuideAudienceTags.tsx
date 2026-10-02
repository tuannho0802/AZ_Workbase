'use client';

import type { ReactNode } from 'react';
import { Tag, Tooltip } from 'antd';
import { ApartmentOutlined, IdcardOutlined, KeyOutlined, SafetyCertificateOutlined } from '@ant-design/icons';

export interface AudienceItem {
  id: number;
  name: string;
  color: string;
}

export type AudienceKind = 'role' | 'position' | 'department';

export const AUDIENCE_META: Record<AudienceKind, { label: string; icon: ReactNode }> = {
  role: { label: 'Role', icon: <SafetyCertificateOutlined /> },
  position: { label: 'Vị trí', icon: <IdcardOutlined /> },
  department: { label: 'Phòng ban', icon: <ApartmentOutlined /> },
};

/** 1 tag màu cho role / vị trí / phòng ban (icon phân biệt loại, màu lấy từ cấu hình của chính mục đó). */
export function AudienceTag({
  kind,
  item,
  closable,
  onClose,
}: {
  kind: AudienceKind;
  item: AudienceItem;
  closable?: boolean;
  onClose?: () => void;
}) {
  const meta = AUDIENCE_META[kind];
  return (
    <Tooltip title={`${meta.label}: ${item.name}`}>
      <Tag
        data-testid={`audience-${kind}`}
        color={item.color}
        icon={meta.icon}
        closable={closable}
        onClose={onClose}
        style={{ marginInlineEnd: 4 }}
      >
        {item.name}
      </Tag>
    </Tooltip>
  );
}

/** Quá số này thì gộp phần còn lại thành "+N quyền" (tooltip liệt kê đủ). */
const PERMISSION_TAGS_SHOWN = 3;

interface Props {
  roles: AudienceItem[];
  positions: AudienceItem[];
  departments: AudienceItem[];
  /** Các permission key yêu cầu - phải có TẤT CẢ (rỗng/bỏ trống = không yêu cầu). */
  requiredPermissions?: string[];
}

/**
 * Hiển thị "ai được xem" của 1 hướng dẫn. Chiều nào để trống = không giới hạn chiều đó;
 * cả 3 chiều trống và không yêu cầu quyền = mọi người đăng nhập đều xem được.
 */
export function GuideAudienceTags({ roles, positions, departments, requiredPermissions = [] }: Props) {
  if (roles.length + positions.length + departments.length === 0 && requiredPermissions.length === 0) {
    return <Tag color="geekblue">Mọi người</Tag>;
  }
  return (
    <>
      {roles.map((r) => (
        <AudienceTag key={`r${r.id}`} kind="role" item={r} />
      ))}
      {positions.map((p) => (
        <AudienceTag key={`p${p.id}`} kind="position" item={p} />
      ))}
      {departments.map((d) => (
        <AudienceTag key={`d${d.id}`} kind="department" item={d} />
      ))}
      {requiredPermissions.slice(0, PERMISSION_TAGS_SHOWN).map((key) => (
        <Tooltip key={key} title={`Chỉ người đang có quyền "${key}" mới thấy`}>
          <Tag data-testid="audience-permission" icon={<KeyOutlined />} color="gold" style={{ marginInlineEnd: 4 }}>
            {key}
          </Tag>
        </Tooltip>
      ))}
      {requiredPermissions.length > PERMISSION_TAGS_SHOWN && (
        <Tooltip title={`Cần có TẤT CẢ: ${requiredPermissions.join(', ')}`}>
          <Tag data-testid="audience-permission-more" color="gold" style={{ marginInlineEnd: 4 }}>
            +{requiredPermissions.length - PERMISSION_TAGS_SHOWN} quyền
          </Tag>
        </Tooltip>
      )}
    </>
  );
}
