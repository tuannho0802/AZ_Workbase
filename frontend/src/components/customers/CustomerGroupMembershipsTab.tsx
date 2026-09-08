'use client';

import { useEffect, useState, useMemo } from 'react';
import { App, Spin, Empty, Switch, Tag, Typography, Avatar } from 'antd';
import { LinkOutlined, CheckCircleFilled } from '@ant-design/icons';
import { customerGroupMembershipsApi, GroupMembershipRow } from '@/lib/api/link-groups.api';
import { SimpleList } from '@/components/common/SimpleList';

const { Text, Link: TypoLink } = Typography;

interface Props {
  customerId: number;
}

/**
 * Checklist "đã tham gia nhóm" của 1 customer, nhóm theo Category (Zalo/FB/
 * Threads...) - mỗi category 1 Tag màu riêng, mỗi group hiện Switch bật/tắt
 * "đã join" + tên nhóm + URL. Dùng LEFT JOIN từ BE nên group nào customer
 * CHƯA từng có row membership vẫn hiện ra với joined=false (không bị thiếu
 * khỏi checklist) - xem CustomerGroupMembershipsService.getMembershipsForCustomer().
 *
 * ⚠️ Phạm vi quyền: `GET .../group-memberships` (danh sách - tab này) chỉ
 * cần `customers.view`; `PATCH .../group-memberships/:groupId` (bật/tắt)
 * cần `customer_group_memberships.set` - 2 quyền RIÊNG BIỆT (xem
 * customer-group-memberships.controller.ts). Role chỉ có `view` (không có
 * quyền set, vd Employee tuỳ cấu hình) VẪN xem được đầy đủ checklist - chỉ
 * ẩn Switch bật/tắt, không ẩn/chặn cả tab. Trước đây Switch hiện vô điều
 * kiện, bấm vào role chỉ có `view` sẽ luôn nhận 403 từ PATCH.
 *
 * ⚠️ SỬA BUG THẬT #1 (2026-09-08): trước đây check `can('customers.manage')` -
 * permission LEGACY từ trước khi tách `customers.create`/`customers.edit`,
 * không còn khớp với bất kỳ quyền nào Backend thực sự enforce ở route PATCH
 * này.
 *
 * ⚠️ SỬA BUG THẬT #2 (2026-09-08, tiếp): sau khi đổi sang
 * `can('customer_group_memberships.set')`, vẫn còn 1 lỗi khác - `can()` chỉ
 * biết "role NÀY nói chung có quyền set hay không", KHÔNG biết "CÓ được set
 * ĐÚNG khách hàng đang xem hay không" khi scope='own'/'department'. Hậu quả
 * thật: Employee scope='own' vẫn thấy Switch bấm được ở data KHÔNG PHẢI của
 * mình (dù bấm vào bị 403 + rollback đúng - nhưng UI không "render dynamic
 * theo scope" như yêu cầu, gây hiểu nhầm). CHỐT: không tự tính `canToggle` ở
 * FE nữa - đọc THẲNG field `canManage` mà BE trả kèm response
 * (`GET .../group-memberships`), BE đã tính đúng theo CHÍNH khách hàng này
 * bằng `CustomerAccessHelper.applyViewFilter()` (xem
 * `CustomerGroupMembershipsService.canManageMembership()`) - nguồn chân lý
 * DUY NHẤT, FE không tự suy luận gì thêm.
 */
export const CustomerGroupMembershipsTab = ({ customerId }: Props) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<GroupMembershipRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  // Đang lưu riêng từng groupId (không phải 1 boolean chung) - để chỉ đúng
  // 1 Switch đang thao tác hiện loading, các Switch khác vẫn bấm được bình
  // thường trong lúc chờ.
  const [savingGroupId, setSavingGroupId] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { items, canManage: manage } = await customerGroupMembershipsApi.getForCustomer(customerId);
      setRows(items);
      setCanManage(manage);
    } catch (err) {
      console.error(err);
      message.error('Lấy checklist nhóm thất bại');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const handleToggle = async (row: GroupMembershipRow, joined: boolean) => {
    setSavingGroupId(row.groupId);
    // Optimistic update - UI phản hồi ngay, rollback nếu API lỗi.
    setRows((prev) =>
      prev.map((r) => (r.groupId === row.groupId ? { ...r, joined } : r)),
    );
    try {
      await customerGroupMembershipsApi.setMembership(customerId, row.groupId, joined);
      message.success(
        joined ? `Đã đánh dấu tham gia "${row.groupName}"` : `Đã bỏ đánh dấu "${row.groupName}"`,
      );
    } catch (err) {
      console.error(err);
      message.error('Cập nhật thất bại, đã khôi phục trạng thái cũ');
      setRows((prev) =>
        prev.map((r) => (r.groupId === row.groupId ? { ...r, joined: !joined } : r)),
      );
    } finally {
      setSavingGroupId(null);
    }
  };

  // Nhóm các row theo categoryId, giữ đúng thứ tự BE đã trả (đã ORDER BY
  // sort_order ở query) - không tự sort lại ở FE.
  const grouped = useMemo(() => {
    const map = new Map<number, { categoryName: string; categoryColor: string; rows: GroupMembershipRow[] }>();
    for (const row of rows) {
      if (!map.has(row.categoryId)) {
        map.set(row.categoryId, {
          categoryName: row.categoryName,
          categoryColor: row.categoryColor,
          rows: [],
        });
      }
      map.get(row.categoryId)!.rows.push(row);
    }
    return Array.from(map.values());
  }, [rows]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <Empty description="Chưa có nhóm liên kết nào được cấu hình. Vào 'Quản lý nhóm liên kết' để thêm Category/Group." />
    );
  }

  return (
    <div>
      {grouped.map((group) => (
        <div key={group.categoryName} style={{ marginBottom: 24 }}>
          <Tag color={group.categoryColor} style={{ fontSize: 13, padding: '4px 10px', marginBottom: 8 }}>
            {group.categoryName}
          </Tag>
          <SimpleList
            bordered
            dataSource={group.rows}
            rowKey={(row) => row.groupId}
            renderMeta={(row) => ({
              avatar: row.joined ? (
                <Avatar style={{ backgroundColor: '#52c41a' }} icon={<CheckCircleFilled />} />
              ) : (
                <Avatar style={{ backgroundColor: '#d9d9d9' }} />
              ),
              title: <Text strong>{row.groupName}</Text>,
              description: (
                <TypoLink href={row.groupUrl} target="_blank" rel="noopener noreferrer">
                  <LinkOutlined /> {row.groupUrl}
                </TypoLink>
              ),
            })}
            renderActions={(row) => [
              canManage ? (
                <Switch
                  key="toggle"
                  checked={row.joined}
                  loading={savingGroupId === row.groupId}
                  onChange={(checked) => handleToggle(row, checked)}
                  checkedChildren="Đã join"
                  unCheckedChildren="Chưa join"
                />
              ) : (
                  // Khách hàng này ngoài phạm vi (scope) của permission
                  // `customer_group_memberships.set`, hoặc role không có quyền
                  // này - hiện trạng thái read-only thay vì Switch (bấm vào sẽ
                  // luôn 403 nếu để Switch hoạt động).
                <Tag key="status" color={row.joined ? 'success' : 'default'}>
                  {row.joined ? 'Đã join' : 'Chưa join'}
                </Tag>
              ),
            ]}
          />
        </div>
      ))}
    </div>
  );
};