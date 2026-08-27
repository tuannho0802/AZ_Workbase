'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal, Input, Checkbox, Tag, Empty, Spin, Typography, Button, Space } from 'antd';
import { LinkOutlined, SearchOutlined } from '@ant-design/icons';
import { LinkGroup } from '@/lib/api/link-groups.api';

const { Text } = Typography;

interface GroupPickerModalProps {
  open: boolean;
  loading?: boolean;
  /** TẤT CẢ group đang active, không lọc theo category nào cả - người dùng
   * tự do chọn nhóm ở BẤT KỲ category nào (Nguồn khách là Facebook nhưng vẫn
   * chọn được nhóm Zalo, v.v. - không còn ràng buộc trùng tên category/nguồn). */
  allGroups: LinkGroup[];
  value: Set<number>;
  onOk: (nextValue: Set<number>) => void;
  onCancel: () => void;
}

/**
 * Modal phụ để chọn nhóm tham gia (checklist) khi tạo/sửa khách hàng.
 *
 * ⚠️ TRƯỚC ĐÂY: chỉ hiện được nhóm thuộc Category có TÊN TRÙNG với Nguồn
 * (media source) đã chọn ở form - hạn chế thực tế: 1 khách hàng đến từ
 * Facebook (Nguồn) hoàn toàn có thể được mời vào 1 nhóm Zalo (category khác)
 * để chăm sóc. Backend KHÔNG hề bắt buộc quan hệ này (đã kiểm tra
 * `CustomerGroupMembershipsService.setMembership()` - chỉ validate customer
 * và group tồn tại, không có check chéo category/source nào) - ràng buộc cũ
 * hoàn toàn do FE tự áp đặt, nên gỡ bỏ an toàn, không cần đổi gì ở BE.
 *
 * => Giờ hiện TẤT CẢ nhóm đang active, gom theo category (mỗi category 1
 * Tag màu riêng để dễ phân biệt), có ô tìm kiếm theo tên nhóm/category.
 */
export const GroupPickerModal = ({
  open,
  loading,
  allGroups,
  value,
  onOk,
  onCancel,
}: GroupPickerModalProps) => {
  const [search, setSearch] = useState('');
  // Bản nháp chỉnh trong modal - chỉ áp dụng ra ngoài khi bấm "Xác nhận",
  // bấm "Huỷ"/đóng modal thì KHÔNG ảnh hưởng gì tới lựa chọn đã có trước đó.
  const [draft, setDraft] = useState<Set<number>>(value);

  // Đồng bộ lại draft mỗi khi modal MỞ (không đồng bộ liên tục để tránh ghi
  // đè lựa chọn đang dở dang của người dùng trong lúc modal đang mở).
  useEffect(() => {
    if (open) {
      setDraft(new Set(value));
      setSearch('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? allGroups.filter(
          (g) =>
            g.name.toLowerCase().includes(q) ||
            (g.category?.name ?? '').toLowerCase().includes(q),
        )
      : allGroups;

    const map = new Map<number, { category: LinkGroup['category']; groups: LinkGroup[] }>();
    for (const g of filtered) {
      const catId = g.categoryId;
      if (!map.has(catId)) {
        map.set(catId, { category: g.category, groups: [] });
      }
      map.get(catId)!.groups.push(g);
    }
    return Array.from(map.values()).sort(
      (a, b) => (a.category?.sortOrder ?? 0) - (b.category?.sortOrder ?? 0),
    );
  }, [allGroups, search]);

  const toggle = (groupId: number, checked: boolean) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (checked) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  };

  return (
    <Modal
      title="Chọn nhóm tham gia"
      open={open}
      onCancel={onCancel}
      onOk={() => onOk(draft)}
      okText={`Xác nhận${draft.size > 0 ? ` (${draft.size} nhóm)` : ''}`}
      cancelText="Huỷ"
      width={560}
      destroyOnHidden
      // Modal phụ đứng TRÊN CustomerForm (cũng là 1 Modal) VÀ trên
      // CustomerDetailDrawer (Drawer bọc ngoài CustomerForm) - cả Drawer lẫn
      // Modal của antd đều mặc định zIndex quanh mốc 1000, xếp chồng nhiều
      // lớp (Drawer -> Modal chính -> Modal phụ) có thể khiến modal phụ bị
      // che khuất nếu chỉ nhích nhẹ (1050 không đủ). Đặt hẳn 2000 - cao hơn
      // chắc chắn mọi lớp Drawer/Modal thông thường của app, không phụ thuộc
      // modal phụ này được mở từ ngữ cảnh lồng bao nhiêu tầng.
      zIndex={2000}
    >
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Tìm theo tên nhóm hoặc category..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : grouped.length === 0 ? (
          <Empty
            description={search ? 'Không tìm thấy nhóm nào khớp' : 'Chưa có nhóm nào đang hoạt động'}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          // antd 6.x: `direction` đã deprecated, dùng `orientation` thay thế.
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            {grouped.map(({ category, groups }) => (
              <div key={category?.id ?? 'unknown'}>
                <Tag color={category?.color ?? 'default'} style={{ marginBottom: 8 }}>
                  {category?.name ?? 'Khác'}
                </Tag>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 4 }}>
                  {groups.map((g) => (
                    <Checkbox
                      key={g.id}
                      checked={draft.has(g.id)}
                      onChange={(e) => toggle(g.id, e.target.checked)}
                    >
                      <Text>{g.name}</Text>
                      <a
                        href={g.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ marginLeft: 6, fontSize: 12 }}
                      >
                        <LinkOutlined />
                      </a>
                    </Checkbox>
                  ))}
                </div>
              </div>
            ))}
          </Space>
        )}
      </div>

      {draft.size > 0 && (
        <div style={{ marginTop: 12 }}>
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={() => setDraft(new Set())}
          >
            Bỏ chọn tất cả
          </Button>
        </div>
      )}
    </Modal>
  );
};