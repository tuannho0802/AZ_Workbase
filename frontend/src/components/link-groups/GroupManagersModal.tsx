'use client';

import { useState } from 'react';
import { Modal, Avatar, Tag, Button, Typography, App, Popconfirm, Divider } from 'antd';
import { UserOutlined, DeleteOutlined, PlusOutlined, CrownOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/stores/auth.store';
import { usersApi } from '@/lib/api/users.api';
import {
  useGroupManagers,
  useAddSecondaryManager,
  useRemoveSecondaryManager,
  useAddContentStaff,
  useRemoveContentStaff,
} from '@/lib/hooks/useLinkGroups';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { SimpleList } from '@/components/common/SimpleList';
import { useAssignmentGroupUsers } from '@/lib/hooks/useAssignmentGroups';
import { SalesUserSelect, type UserOption } from '@/components/customers/SalesUserSelect';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  groupId: number | null;
  groupName?: string;
}

/**
 * Xem Quản lý chính + phụ + Nhân viên Content của 1 nhóm, và thêm/xoá
 * Quản lý phụ / Nhân viên Content.
 * - Quản lý CHÍNH của nhóm KHÔNG đổi được ở đây (chỉ admin đổi được, qua
 *   form Sửa nhóm ở trang "Quản lý nhóm liên kết" - PATCH /link-groups/:id).
 * - Thêm/xoá Quản lý phụ VÀ Nhân viên Content: CÙNG 1 rule - chỉ admin hoặc
 *   chính Quản lý chính của nhóm đó (khớp
 *   `LinkGroupAccessHelper.canEditSecondaryManagers()` ở BE, tái dùng cho cả
 *   2 tính năng - xem JSDoc `LinkGroupManagersService.addContentStaff()`).
 *   Ở đây chỉ ẩn/hiện UI cho gọn, quyền thật sự vẫn do BE chặn (403 nếu cố
 *   gọi sai).
 * - 1 người CÓ THỂ vừa là Quản lý phụ vừa là Nhân viên Content của cùng 1
 *   nhóm (2 vai trò không loại trừ nhau) - nên 2 danh sách chọn bên dưới
 *   ĐỘC LẬP với nhau, chỉ loại người đã có trong CHÍNH danh sách đang thao
 *   tác (và luôn loại Quản lý chính khỏi cả 2, vì không được vừa là chính
 *   vừa là phụ/Content).
 *
 * ⚠️ SỬA (2026-09-10, rà soát): 2 dropdown chọn người để thêm trước đây là
 * `<Select>` trơn chỉ hiện `name || email`, thiếu hẳn avatar/role/department/
 * vị trí như dropdown "Sales/Marketing phụ trách" ở form Khách hàng. Đổi
 * sang dùng LẠI đúng `SalesUserSelect` (component `CustomerForm.tsx` đang
 * dùng) qua prop `users` (danh sách candidate đã lọc sẵn theo đúng nghiệp vụ
 * riêng của từng dropdown - xem 2 biến `secondaryManagerOptions` và
 * `contentStaffOptions` bên dưới) thay vì viết lại UI riêng.
 *  - "Quản lý phụ": nguồn dữ liệu VẪN LÀ toàn bộ nhân viên (`usersApi.
 *    getAllForSelect()`, KHÔNG lọc theo Assignment Group Config như Content
 *    Staff) - chỉ loại người đã là Quản lý chính/phụ của CHÍNH nhóm này.
 *    Đây là nghiệp vụ đã có TỪ TRƯỚC (ai cũng có thể được gán làm Quản lý
 *    phụ 1 nhóm liên kết, không giới hạn phòng ban/vị trí) - giữ nguyên,
 *    KHÔNG áp thêm bộ lọc Assignment Group vào đây.
 *  - "Nhân viên Content": nguồn dữ liệu là `useAssignmentGroupUsers
 *    ('content_staff')` (đã lọc đúng Phòng Marketing + Vị trí `content` qua
 *    trang "Quản lý phụ trách", xem migration CreateAssignmentGroupConfigs)
 *    - route `resolveUsers()` BE giờ trả đủ field email/role/department/
 *    position (trước đây chỉ `select: ['id','name']`) để dropdown vẽ được
 *    đầy đủ như customer.
 */
export const GroupManagersModal = ({ open, onClose, groupId, groupName }: Props) => {
  const { message } = App.useApp();
  const currentUser = useAuthStore((s) => s.user);
  const { managers, isLoading } = useGroupManagers(groupId ?? undefined);
  const addMutation = useAddSecondaryManager();
  const removeMutation = useRemoveSecondaryManager();
  const addContentStaffMutation = useAddContentStaff();
  const removeContentStaffMutation = useRemoveContentStaff();
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  const [selectedContentStaffId, setSelectedContentStaffId] = useState<number | undefined>(undefined);

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ['users-for-select'],
    queryFn: () => usersApi.getAllForSelect(),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });
  const userList = users ?? [];

  const isAdmin = currentUser?.role === 'admin';
  const isPrimary = !!managers?.primaryManager && managers.primaryManager.id === currentUser?.id;
  const canEdit = isAdmin || isPrimary;

  const primaryId = managers?.primaryManager?.id;
  const secondaryIds = new Set((managers?.secondaryManagers ?? []).map((m) => m.id));
  const contentStaffIds = new Set((managers?.contentStaff ?? []).map((m) => m.id));

  // Loại người đã là chính/phụ rồi khỏi danh sách chọn - tránh gọi API rồi
  // ăn lỗi 400/409 (Người này đang là Quản lý chính.../Đã là Quản lý phụ rồi)
  const secondaryManagerOptions: UserOption[] = userList.filter(
    (u) => u.id !== primaryId && !secondaryIds.has(u.id),
  );

  // Danh sách chọn cho Nhân viên Content - CHỈ loại Quản lý chính + người
  // đã là Content rồi, KHÔNG loại Quản lý phụ (được phép trùng, xem JSDoc).
  // ⚠️ SỬA (2026-09-10, thay bản lọc client-side `position.code==='content'`
  // cũ) - giờ dùng "Quản lý phụ trách" (Assignment Group Config, config
  // hệ thống `content_staff` = Phòng Marketing + Vị trí `content`, xem
  // migration CreateAssignmentGroupConfigs) qua
  // `GET /assignment-groups/content_staff/users`. Ưu điểm so với lọc cứng
  // theo Position: Admin có thể mở rộng/đổi Phòng ban+Vị trí hợp lệ qua
  // trang `/quan-ly-phu-trach` mà KHÔNG cần sửa code component này.
  const { users: contentStaffCandidates } = useAssignmentGroupUsers('content_staff');
  const contentStaffOptions: UserOption[] = contentStaffCandidates
    .filter((u) => u.id !== primaryId && !contentStaffIds.has(u.id))
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department ?? undefined,
      position: u.position ?? undefined,
    }));

  const resetAndClose = () => {
    setSelectedUserId(undefined);
    setSelectedContentStaffId(undefined);
    onClose();
  };

  const handleAdd = () => {
    if (!groupId || !selectedUserId) return;
    addMutation.mutate(
      { groupId, userId: selectedUserId },
      {
        onSuccess: () => {
          message.success('Đã thêm Quản lý phụ');
          setSelectedUserId(undefined);
        },
        onError: (err) => message.error(getApiErrorMessage(err, 'Thêm Quản lý phụ thất bại')),
      },
    );
  };

  const handleRemove = (userId: number, name: string) => {
    if (!groupId) return;
    removeMutation.mutate(
      { groupId, userId },
      {
        onSuccess: () => message.success(`Đã gỡ "${name}" khỏi Quản lý phụ`),
        onError: (err) => message.error(getApiErrorMessage(err, 'Gỡ Quản lý phụ thất bại')),
      },
    );
  };

  const handleAddContentStaff = () => {
    if (!groupId || !selectedContentStaffId) return;
    addContentStaffMutation.mutate(
      { groupId, userId: selectedContentStaffId },
      {
        onSuccess: () => {
          message.success('Đã thêm Nhân viên Content');
          setSelectedContentStaffId(undefined);
        },
        onError: (err) => message.error(getApiErrorMessage(err, 'Thêm Nhân viên Content thất bại')),
      },
    );
  };

  const handleRemoveContentStaff = (userId: number, name: string) => {
    if (!groupId) return;
    removeContentStaffMutation.mutate(
      { groupId, userId },
      {
        onSuccess: () => message.success(`Đã gỡ "${name}" khỏi Nhân viên Content`),
        onError: (err) => message.error(getApiErrorMessage(err, 'Gỡ Nhân viên Content thất bại')),
      },
    );
  };

  return (
    <Modal
      title={`Quản lý chính/phụ & Nhân viên Content - ${groupName ?? managers?.groupName ?? ''}`}
      open={open}
      onCancel={resetAndClose}
      footer={
        <Button onClick={resetAndClose}>Đóng</Button>
      }
      destroyOnHidden
    >
      <div style={{ marginBottom: 16 }}>
        <Text strong>Quản lý chính:</Text>{' '}
        {managers?.primaryManager ? (
          <Tag color="gold" icon={<CrownOutlined />}>
            {managers.primaryManager.name}
          </Tag>
        ) : (
          <Text type="secondary">
            Chưa gán - chỉ admin gán được (ở trang &quot;Quản lý nhóm liên kết&quot;)
          </Text>
        )}
      </div>

      <div style={{ marginBottom: 8 }}>
        <Text strong>Quản lý phụ ({managers?.secondaryManagers.length ?? 0}):</Text>
      </div>
      <SimpleList
        loading={isLoading}
        size="small"
        dataSource={managers?.secondaryManagers ?? []}
        rowKey={(m) => m.id}
        emptyText="Chưa có Quản lý phụ nào"
        renderMeta={(m) => ({
          avatar: <Avatar size="small" icon={<UserOutlined />} />,
          title: m.name,
          description: m.email,
        })}
        renderActions={(m) =>
          canEdit
            ? [
                <Popconfirm
                  key="remove"
                  title={`Gỡ "${m.name}" khỏi Quản lý phụ?`}
                  onConfirm={() => handleRemove(m.id, m.name)}
                  okText="Gỡ"
                  cancelText="Huỷ"
                >
                  <Button
                    size="small"
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    loading={removeMutation.isPending && removeMutation.variables?.userId === m.id}
                  />
                </Popconfirm>,
              ]
            : []
        }
      />

      {canEdit ? (
        <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <SalesUserSelect
              users={secondaryManagerOptions}
              value={selectedUserId}
              onChange={(userId) => setSelectedUserId(userId ?? undefined)}
              placeholder="Chọn nhân viên để thêm làm Quản lý phụ"
              hidePreviewCard
            />
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!selectedUserId}
            loading={addMutation.isPending}
            onClick={handleAdd}
          >
            Thêm
          </Button>
        </div>
      ) : (
        <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
          Chỉ Quản lý chính (hoặc admin) mới có quyền thêm/xoá Quản lý phụ. Bạn đang xem với quyền
          Quản lý phụ.
        </Text>
      )}

      <Divider style={{ margin: '20px 0 12px' }} />

      <div style={{ marginBottom: 8 }}>
        <Text strong>Nhân viên Content ({managers?.contentStaff.length ?? 0}):</Text>
      </div>
      <SimpleList
        loading={isLoading}
        size="small"
        dataSource={managers?.contentStaff ?? []}
        rowKey={(m) => m.id}
        emptyText="Chưa có Nhân viên Content nào"
        renderMeta={(m) => ({
          avatar: <Avatar size="small" icon={<EditOutlined />} />,
          title: m.name,
          description: m.email,
        })}
        renderActions={(m) =>
          canEdit
            ? [
              <Popconfirm
                key="remove-content-staff"
                title={`Gỡ "${m.name}" khỏi Nhân viên Content?`}
                onConfirm={() => handleRemoveContentStaff(m.id, m.name)}
                okText="Gỡ"
                cancelText="Huỷ"
              >
                <Button
                  size="small"
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  loading={
                    removeContentStaffMutation.isPending &&
                    removeContentStaffMutation.variables?.userId === m.id
                  }
                />
              </Popconfirm>,
            ]
            : []
        }
      />

      {canEdit ? (
        <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <SalesUserSelect
              users={contentStaffOptions}
              value={selectedContentStaffId}
              onChange={(userId) => setSelectedContentStaffId(userId ?? undefined)}
              placeholder="Chọn nhân viên để thêm làm Nhân viên Content"
              hidePreviewCard
            />
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!selectedContentStaffId}
            loading={addContentStaffMutation.isPending}
            onClick={handleAddContentStaff}
          >
            Thêm
          </Button>
        </div>
      ) : (
        <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
          Chỉ Quản lý chính (hoặc admin) mới có quyền thêm/xoá Nhân viên Content.
        </Text>
      )}
    </Modal>
  );
};