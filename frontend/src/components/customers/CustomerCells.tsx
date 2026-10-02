'use client';

import { Space, Tag, Tooltip } from 'antd';

/**
 * Ô "trình bày thuần" của bảng Khách hàng (Sales Chính+Phụ / Marketing / Đã joined nhóm).
 * Tách khỏi `customers/page.tsx` để trang thật VÀ mẫu minh hoạ trong Hướng dẫn dùng CHUNG 1 nguồn
 * -> sửa UI ở đây thì guide tự đúng (không còn drift). Không gọi API/hook.
 */
export const renderSalesTag = (record: any) => {
  const primarySales = record.salesUser;
  const allAssignees = record.activeAssignees || [];
  const sharedSales = allAssignees.filter((a: any) => a.id !== primarySales?.id);

  if (!primarySales && sharedSales.length === 0) {
    return <span style={{ color: '#bbb', fontStyle: 'italic', fontSize: '11px' }}>Chưa gán</span>;
  }

  return (
    <Space size={[0, 4]} align="center" wrap>
      {primarySales ? <Tag color="blue" title="Sales phụ trách chính">{primarySales.name}</Tag> : <span style={{ color: '#bbb', fontStyle: 'italic', fontSize: '11px' }}>Chưa có Primary</span>}
      {sharedSales.length > 0 && (
        <Tooltip title={`Sales được chia:\n${sharedSales.map((a: any) => a.name).join(', ')}`}>
          <Tag color="cyan">+{sharedSales.length}</Tag>
        </Tooltip>
      )}
    </Space>
  );
};

export const renderMarketingTag = (record: any) => {
  const marketingUser = record.marketingUser;
  if (!marketingUser) {
    return <span style={{ color: '#bbb', fontStyle: 'italic', fontSize: '11px' }}>Chưa gán</span>;
  }
  return <Tag color="purple" title="Marketing phụ trách">{marketingUser.name}</Tag>;
};

// Cùng pattern hiển thị với renderSalesTag: nhóm ĐẦU TIÊN hiện tên thật,
// các nhóm còn lại gộp thành "+N", hover xem đủ tên qua Tooltip - áp dụng
// cho "Đã joined nhóm" y hệt "Sales chính/phụ" theo đúng yêu cầu, thay vì
// chỉ hiện số lượng trần trụi như trước.
export const renderJoinedGroupsTag = (record: any) => {
  const groups: Array<{ id: number; name: string }> = record.joinedGroups || [];

  if (groups.length === 0) {
    return <Tag color="default">Chưa join</Tag>;
  }

  const [first, ...rest] = groups;

  return (
    <Space size={[0, 4]} align="center" wrap>
      <Tag color="green" title="Nhóm đã join">{first.name}</Tag>
      {rest.length > 0 && (
        <Tooltip title={`Nhóm khác đã join:\n${rest.map((g) => g.name).join(', ')}`}>
          <Tag color="cyan">+{rest.length}</Tag>
        </Tooltip>
      )}
    </Space>
  );
};
