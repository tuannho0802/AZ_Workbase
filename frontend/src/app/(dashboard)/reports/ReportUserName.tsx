'use client';

import { Tag, Typography } from 'antd';
import { resolveEntityColor } from '@/lib/utils/entityColor';

const { Text } = Typography;

interface Props {
  name: string;
  departmentName?: string | null;
  departmentColor?: string | null;
  /** Hiện Tag phòng ban dưới tên (mặc định) hay cùng dòng. */
  inline?: boolean;
  muted?: boolean;
}

/**
 * Tên nhân viên + Tag PHÒNG BAN đúng màu cấu hình ở /phong-ban (`resolveEntityColor` - cùng pattern
 * users/page.tsx). Dùng CHUNG cho mọi bảng/danh sách của trang /reports để đồng bộ với các trang khác.
 */
export default function ReportUserName({ name, departmentName, departmentColor, inline, muted }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: inline ? 'row' : 'column', alignItems: inline ? 'center' : 'flex-start', gap: inline ? 6 : 2 }}>
      <Text strong type={muted ? 'secondary' : undefined}>{name}</Text>
      {departmentName && (
        <Tag color={resolveEntityColor(departmentColor)} style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '18px' }}>
          {departmentName}
        </Tag>
      )}
    </div>
  );
}
