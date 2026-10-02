'use client';

import type { ReactNode } from 'react';
import { Tag, Tooltip } from 'antd';
import { ApartmentOutlined, IdcardOutlined, SafetyCertificateOutlined } from '@ant-design/icons';

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

interface Props {
  roles: AudienceItem[];
  positions: AudienceItem[];
  departments: AudienceItem[];
}

/**
 * Hiển thị "ai được xem" của 1 hướng dẫn. Chiều nào để trống = không giới hạn chiều đó;
 * cả 3 chiều trống = mọi người đăng nhập đều xem được.
 */
export function GuideAudienceTags({ roles, positions, departments }: Props) {
  if (roles.length + positions.length + departments.length === 0) {
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
    </>
  );
}
