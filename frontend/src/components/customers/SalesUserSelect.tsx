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
    name: string;
  };
}

interface SalesUserSelectProps {
  value?: number;           // userId đang được chọn
  onChange?: (userId: number | null, user: UserOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const SalesUserSelect = ({ 
  value, onChange, placeholder = 'Tìm kiếm nhân viên...', disabled 
}: SalesUserSelectProps) => {
  const [searchText, setSearchText] = useState('');

  // Fetch tất cả users
  const { data: users = [], isLoading } = useQuery<UserOption[]>({
    queryKey: ['users-for-select'],
    queryFn: () => usersApi.getAllForSelect(),
    staleTime: 5 * 60 * 1000, // cache 5 phút
  });

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
        showSearch
        allowClear
        value={value ?? null}
        placeholder={placeholder}
        disabled={disabled}
        loading={isLoading}
        filterOption={false}     // tắt filter mặc định, dùng onSearch
        onSearch={setSearchText}
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
      >
        {filteredOptions.map(user => (
          <Select.Option 
            key={user.id} 
            value={user.id}
            label={user.name || user.email}  // text hiện trong input sau khi chọn
          >
            {/* Dropdown item — hiện đầy đủ thông tin */}
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
                </Text>
              </div>
            </Space>
          </Select.Option>
        ))}
      </Select>

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
