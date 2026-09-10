'use client';
import { Select, Avatar, Typography, Space, Tag, Card } from 'antd';
import { UserOutlined, SearchOutlined } from '@ant-design/icons';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/lib/api/users.api';

const { Text } = Typography;

// Màu theo role
const roleColor: Record<string, string> = {
  admin: 'red',
  manager: 'blue', 
  assistant: 'cyan',
  employee: 'green',
};

interface UserOption {
  id: number;
  name: string;
  email: string;
  role: string;
  department?: {
    id: number;
    name: string;
  };
  // ⚠️ MỚI - rà soát Vị trí 2026-09-10: BE (users.service.ts
  // findEmployees(), nguồn dữ liệu của GET /users/all) giờ đã JOIN
  // 'position' đối xứng 'department'.
  position?: {
    name: string;
  };
}

interface SalesUserSelectProps {
  value?: number;           // userId đang được chọn
  onChange?: (userId: number | null, user: UserOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  // ⚠️ MỚI - rà soát 2026-09-10: BUG THẬT phát hiện qua ảnh chụp màn hình
  // người dùng - Modal Thêm/Sửa khách hàng (CustomerForm.tsx) dùng chung 1
  // component này cho CẢ "Sales phụ trách" LẪN "Marketing phụ trách", nhưng
  // không hề lọc theo phòng ban -> dropdown "Marketing phụ trách" hiện ra cả
  // Admin/Manager/Sales (toàn "Phòng Kinh doanh"), không giới hạn đúng
  // "Phòng Marketing" như 2 dropdown filter ở bảng danh sách khách hàng
  // (page.tsx đã lọc đúng qua salesUsersInDept/marketingUsersInDept, nhưng
  // filter đó CHƯA BAO GIỜ được truyền xuống modal này). Khi truyền
  // departmentId, chỉ hiện user thuộc đúng phòng ban đó; để trống (undefined)
  // giữ nguyên hành vi cũ (hiện TẤT CẢ) cho các nơi khác đang dùng component
  // này mà không cần lọc.
  departmentId?: number;
}

export const SalesUserSelect = ({ 
  value, onChange, placeholder = 'Chọn sales đang hoạt động...', disabled, departmentId,
}: SalesUserSelectProps) => {
  const [searchText, setSearchText] = useState('');

  // Fetch tất cả users
  const { data: allUsers = [], isLoading } = useQuery<UserOption[]>({
    queryKey: ['users-for-select'],
    queryFn: () => usersApi.getAllForSelect(),
    staleTime: 5 * 60 * 1000, // cache 5 phút
  });

  const users = useMemo(
    () => (departmentId == null ? allUsers : allUsers.filter((u) => u.department?.id === departmentId)),
    [allUsers, departmentId],
  );

  // User đang được chọn hiện tại
  const selectedUser = useMemo(
    () => users.find(u => u.id === value) ?? null,
    [users, value]
  );

  // Filter realtime theo searchText
  const filteredOptions = useMemo(() => {
    if (!searchText.trim()) return users;
    const q = searchText.toLowerCase();
    return users.filter(u => 
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  }, [users, searchText]);

  return (
    <div className="sales-user-select-container">
      {/* --- SELECT COMBOBOX --- */}
      <Select
        allowClear
        value={value ?? null}
        placeholder={placeholder}
        disabled={disabled}
        loading={isLoading}
        showSearch={{
          filterOption: false, // tắt filter mặc định, dùng onSearch
          onSearch: setSearchText,
        }}
        onChange={(val) => {
          const numericVal = val ? Number(val) : null;
          const user = users.find(u => u.id === numericVal) ?? null;
          onChange?.(numericVal, user);
          setSearchText('');     // reset search sau khi chọn
        }}
        onClear={() => onChange?.(null, null)}
        style={{ width: '100%' }}
        suffixIcon={<SearchOutlined />}
        notFoundContent={
          isLoading ? 'Đang tải...' : 'Không tìm thấy nhân viên'
        }
        optionLabelProp="label"  // hiện label đơn giản khi đã chọn
        // options + optionRender thay cho <Select.Option> (deprecated ở antd
        // 6). "label" giữ text đơn giản hiện trong ô khi đã chọn (nhờ
        // optionLabelProp ở trên); optionRender mới là nơi vẽ đầy đủ
        // avatar/tag/email cho từng dòng trong dropdown khi đang mở.
        options={filteredOptions.map(user => ({
          key: user.id,
          value: user.id,
          label: user.name || user.email,
          user,
        }))}
        optionRender={(option) => {
          const user = (option.data as { user: UserOption }).user;
          return (
            <Space align="center">
              <Avatar
                size="small"
                icon={<UserOutlined />}
                style={{
                  backgroundColor: roleColor[user.role] ?? '#ccc',
                  flexShrink: 0
                }}
              >
                {user.name?.[0]?.toUpperCase()}
              </Avatar>
              <div style={{ lineHeight: 1.4 }}>
                <div>
                  <Text strong style={{ fontSize: 13 }}>
                    {user.name || '(Chưa đặt tên)'}
                  </Text>
                  <Tag
                    color={roleColor[user.role]}
                    style={{ marginLeft: 6, fontSize: 10 }}
                  >
                    {user.role}
                  </Tag>
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {user.email}
                  {user.department?.name ? ` · ${user.department.name}` : ''}
                  {user.position?.name ? ` · ${user.position.name}` : ''}
                </Text>
              </div>
            </Space>
          );
        }}
      />
      {/* filteredOptions render moved into `options` + `optionRender` above */}

      {/* --- PREVIEW CARD — hiện khi đã chọn user --- */}
      {selectedUser && (
        <Card
          size="small"
          style={{ 
            marginTop: 8, 
            borderRadius: 8,
            border: '1px solid #e6f4ff',
            backgroundColor: '#f0f9ff',
          }}
          styles={{ body: { padding: '8px 12px' } }}
        >
          <Space align="center" style={{ width: '100%' }}>
            <Avatar
              icon={<UserOutlined />}
              style={{ backgroundColor: roleColor[selectedUser.role] ?? '#ccc' }}
            >
              {selectedUser.name?.[0]?.toUpperCase()}
            </Avatar>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size={4}>
                  <Text strong>{selectedUser.name}</Text>
                  <Tag color={roleColor[selectedUser.role]} style={{ fontSize: 10, margin: 0 }}>
                    {selectedUser.role.toUpperCase()}
                  </Tag>
                </Space>
                {selectedUser.department?.name && (
                   <Tag color="default" style={{ fontSize: 10, margin: 0 }}>
                    {selectedUser.department.name}
                  </Tag>
                )}
                {selectedUser.position?.name && (
                  <Tag color="default" style={{ fontSize: 10, margin: 0 }}>
                    {selectedUser.position.name}
                  </Tag>
                )}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {selectedUser.email}
              </Text>
            </div>
          </Space>
        </Card>
      )}
    </div>
  );
};