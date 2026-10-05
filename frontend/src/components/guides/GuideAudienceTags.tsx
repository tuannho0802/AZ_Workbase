'use client';

import type { ReactNode } from 'react';
import { Tag, Tooltip } from 'antd';
import { ApartmentOutlined, IdcardOutlined, KeyOutlined, SafetyCertificateOutlined, StopOutlined } from '@ant-design/icons';

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
  excluded,
}: {
  kind: AudienceKind;
  item: AudienceItem;
  closable?: boolean;
  onClose?: () => void;
  /** true = tag LOẠI TRỪ (đỏ, chữ "Loại trừ: <tên>") để không nhầm với tag "được xem". */
  excluded?: boolean;
}) {
  const meta = AUDIENCE_META[kind];
  if (excluded) {
    return (
      <Tooltip title={`${meta.label} bị loại trừ: ${item.name} (không xem được bài này)`}>
        <Tag
          data-testid={`audience-excluded-${kind}`}
          color="error"
          icon={<StopOutlined />}
          closable={closable}
          onClose={onClose}
          style={{ marginInlineEnd: 4 }}
        >
          Loại trừ: {item.name}
        </Tag>
      </Tooltip>
    );
  }
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
  /** LOẠI TRỪ (thắng "được xem"): hiện tag đỏ "Loại trừ: <tên>". Rỗng/bỏ trống = không loại trừ ai. */
  excludedRoles?: AudienceItem[];
  excludedPositions?: AudienceItem[];
  excludedDepartments?: AudienceItem[];
  /** Các permission key yêu cầu - phải có TẤT CẢ (rỗng/bỏ trống = không yêu cầu). */
  requiredPermissions?: string[];
}

/**
 * Hiển thị "ai được xem" của 1 hướng dẫn. Chiều nào để trống = không giới hạn chiều đó;
 * cả 3 chiều trống và không yêu cầu quyền = mọi người đăng nhập đều xem được.
 */
export function GuideAudienceTags({
  roles,
  positions,
  departments,
  excludedRoles = [],
  excludedPositions = [],
  excludedDepartments = [],
  requiredPermissions = [],
}: Props) {
  const hasExclusions = excludedRoles.length + excludedPositions.length + excludedDepartments.length > 0;
  const everyone = roles.length + positions.length + departments.length === 0 && requiredPermissions.length === 0;
  if (everyone && !hasExclusions) {
    return <Tag color="geekblue">Mọi người</Tag>;
  }
  return (
    <>
      {everyone && <Tag color="geekblue">Mọi người</Tag>}
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
      {excludedRoles.map((r) => (
        <AudienceTag key={`xr${r.id}`} kind="role" item={r} excluded />
      ))}
      {excludedPositions.map((p) => (
        <AudienceTag key={`xp${p.id}`} kind="position" item={p} excluded />
      ))}
      {excludedDepartments.map((d) => (
        <AudienceTag key={`xd${d.id}`} kind="department" item={d} excluded />
      ))}
    </>
  );
}
