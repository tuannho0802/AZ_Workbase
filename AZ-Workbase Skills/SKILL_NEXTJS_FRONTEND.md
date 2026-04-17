# Next.js Frontend Development Skill - AZWorkbase

## Skill Purpose
Guide development of Next.js frontend for AZWorkbase project with focus on Ant Design components, TypeScript best practices, state management, and performance optimization.

## When to Use This Skill
- Creating Next.js pages, components, or layouts
- Implementing UI with Ant Design
- Managing state with Zustand
- Calling backend APIs
- Implementing authentication flow
- Building forms with validation

## Core Principles

### 1. Project Structure (MANDATORY)

```
frontend/
├── public/
│   ├── images/
│   └── icons/
├── src/
│   ├── app/                      # Next.js 14 App Router
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── customers/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── deposits/
│   │   │   └── layout.tsx
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/               # Reusable components
│   │   ├── common/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── LoadingSkeleton.tsx
│   │   │   └── ErrorBoundary.tsx
│   │   ├── customers/
│   │   │   ├── CustomerTable.tsx
│   │   │   ├── CustomerFilters.tsx
│   │   │   ├── CustomerDetailModal.tsx
│   │   │   └── CustomerForm.tsx
│   │   └── deposits/
│   │       ├── DepositHistoryTable.tsx
│   │       └── AddDepositForm.tsx
│   ├── lib/                      # Utilities
│   │   ├── api/
│   │   │   ├── axios-instance.ts
│   │   │   ├── customers.api.ts
│   │   │   └── auth.api.ts
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useCustomers.ts
│   │   │   └── usePermissions.ts
│   │   ├── stores/
│   │   │   ├── auth.store.ts
│   │   │   └── ui.store.ts
│   │   ├── types/
│   │   │   ├── customer.types.ts
│   │   │   └── user.types.ts
│   │   └── utils/
│   │       ├── formatters.ts
│   │       └── validators.ts
│   ├── middleware.ts
│   └── constants/
│       ├── routes.ts
│       └── roles.ts
├── .env.local
├── .env.production
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

### 2. TypeScript Types (MANDATORY)

**Define types for all data structures:**

```typescript
// lib/types/customer.types.ts
export interface Customer {
  id: number;
  name: string;
  phone: string;
  email?: string;
  source: 'Facebook' | 'TikTok' | 'Google' | 'Instagram' | 'Other';
  campaign?: string;
  salesUser: {
    id: number;
    name: string;
  };
  status: 'closed' | 'pending' | 'potential' | 'lost';
  broker?: string;
  closedDate?: string;
  department: {
    id: number;
    name: string;
  };
  note?: string;
  latestFTD?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerDto {
  name: string;
  phone: string;
  email?: string;
  source: string;
  campaign?: string;
  salesUserId: number;
  status?: string;
  broker?: string;
  closedDate?: string;
  departmentId: number;
  note?: string;
}

export interface CustomerFilters {
  page?: number;
  limit?: number;
  departmentId?: number;
  salesUserId?: number;
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// lib/types/user.types.ts
export type UserRole = 'admin' | 'manager' | 'assistant' | 'employee';

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  department?: {
    id: number;
    name: string;
  };
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}
```

### 3. API Client Setup (CRITICAL)

**Axios instance with JWT interceptor:**

```typescript
// lib/api/axios-instance.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { message } from 'antd';
import { useAuthStore } from '../stores/auth.store';

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add JWT token
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Handle 401 - Token expired
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        const response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
          { refreshToken }
        );

        const { accessToken } = response.data;
        useAuthStore.getState().setTokens(accessToken, refreshToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // Handle other errors
    const errorMessage = error.response?.data?.message || 'Đã có lỗi xảy ra';
    message.error(errorMessage);

    return Promise.reject(error);
  }
);

export default axiosInstance;
```

**API Service Example:**

```typescript
// lib/api/customers.api.ts
import axiosInstance from './axios-instance';
import {
  Customer,
  CreateCustomerDto,
  CustomerFilters,
  PaginatedResponse,
} from '../types/customer.types';

export const customersApi = {
  // Get all customers with filters
  getCustomers: async (
    filters: CustomerFilters
  ): Promise<PaginatedResponse<Customer>> => {
    const response = await axiosInstance.get('/customers', { params: filters });
    return response.data;
  },

  // Get single customer
  getCustomer: async (id: number): Promise<Customer> => {
    const response = await axiosInstance.get(`/customers/${id}`);
    return response.data;
  },

  // Create customer
  createCustomer: async (data: CreateCustomerDto): Promise<Customer> => {
    const response = await axiosInstance.post('/customers', data);
    return response.data;
  },

  // Update customer
  updateCustomer: async (
    id: number,
    data: Partial<CreateCustomerDto>
  ): Promise<Customer> => {
    const response = await axiosInstance.patch(`/customers/${id}`, data);
    return response.data;
  },

  // Delete customer
  deleteCustomer: async (id: number): Promise<void> => {
    await axiosInstance.delete(`/customers/${id}`);
  },

  // Share customer
  shareCustomer: async (
    customerId: number,
    sharedWithUserId: number,
    permission: 'view' | 'edit'
  ): Promise<void> => {
    await axiosInstance.post(`/customers/${customerId}/share`, {
      sharedWithUserId,
      permission,
    });
  },
};
```

### 4. State Management with Zustand

**Auth Store:**

```typescript
// lib/stores/auth.store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types/user.types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  
  setUser: (user: User) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: true }),
      
      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken, isAuthenticated: true }),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'auth-storage',
    }
  )
);
```

**UI Store (for modal states, filters, etc.):**

```typescript
// lib/stores/ui.store.ts
import { create } from 'zustand';

interface UIState {
  customerDetailModalOpen: boolean;
  selectedCustomerId: number | null;
  sidebarCollapsed: boolean;

  openCustomerDetailModal: (customerId: number) => void;
  closeCustomerDetailModal: () => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  customerDetailModalOpen: false,
  selectedCustomerId: null,
  sidebarCollapsed: false,

  openCustomerDetailModal: (customerId) =>
    set({ customerDetailModalOpen: true, selectedCustomerId: customerId }),

  closeCustomerDetailModal: () =>
    set({ customerDetailModalOpen: false, selectedCustomerId: null }),

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
```

### 5. Custom Hooks

**useAuth Hook:**

```typescript
// lib/hooks/useAuth.ts
import { useAuthStore } from '../stores/auth.store';
import { UserRole } from '../types/user.types';

export const useAuth = () => {
  const { user, isAuthenticated, logout } = useAuthStore();

  const hasRole = (roles: UserRole[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const isAdmin = (): boolean => user?.role === 'admin';
  const isManager = (): boolean => user?.role === 'manager';
  const isAssistant = (): boolean => user?.role === 'assistant';
  const isEmployee = (): boolean => user?.role === 'employee';

  const canViewAll = (): boolean => {
    return hasRole(['admin', 'manager', 'assistant']);
  };

  const canEditAll = (): boolean => {
    return hasRole(['admin', 'manager', 'assistant']);
  };

  return {
    user,
    isAuthenticated,
    logout,
    hasRole,
    isAdmin,
    isManager,
    isAssistant,
    isEmployee,
    canViewAll,
    canEditAll,
  };
};
```

**useCustomers Hook with React Query:**

```typescript
// lib/hooks/useCustomers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { customersApi } from '../api/customers.api';
import { CustomerFilters, CreateCustomerDto } from '../types/customer.types';

export const useCustomers = (filters: CustomerFilters) => {
  const queryClient = useQueryClient();

  // Fetch customers
  const { data, isLoading, error } = useQuery({
    queryKey: ['customers', filters],
    queryFn: () => customersApi.getCustomers(filters),
    staleTime: 30000, // 30 seconds
  });

  // Create customer
  const createMutation = useMutation({
    mutationFn: (data: CreateCustomerDto) => customersApi.createCustomer(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      message.success('Đã thêm khách hàng thành công');
    },
    onError: () => {
      message.error('Không thể thêm khách hàng');
    },
  });

  // Update customer
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateCustomerDto> }) =>
      customersApi.updateCustomer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      message.success('Đã cập nhật khách hàng thành công');
    },
    onError: () => {
      message.error('Không thể cập nhật khách hàng');
    },
  });

  // Delete customer
  const deleteMutation = useMutation({
    mutationFn: (id: number) => customersApi.deleteCustomer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      message.success('Đã xóa khách hàng thành công');
    },
    onError: () => {
      message.error('Không thể xóa khách hàng');
    },
  });

  return {
    customers: data?.data || [],
    total: data?.total || 0,
    page: data?.page || 1,
    totalPages: data?.totalPages || 1,
    isLoading,
    error,
    createCustomer: createMutation.mutate,
    updateCustomer: updateMutation.mutate,
    deleteCustomer: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
};
```

### 6. Component Development Patterns

**Customer Table Component:**

```typescript
// components/customers/CustomerTable.tsx
'use client';

import React, { useState } from 'react';
import { Table, Button, Space, Tag, Tooltip } from 'antd';
import { EditOutlined, EyeOutlined, ShareAltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Customer } from '@/lib/types/customer.types';
import { useAuth } from '@/lib/hooks/useAuth';
import { useUIStore } from '@/lib/stores/ui.store';
import dayjs from 'dayjs';

interface CustomerTableProps {
  customers: Customer[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number, pageSize: number) => void;
  onEdit: (customer: Customer) => void;
  onShare: (customer: Customer) => void;
}

export const CustomerTable: React.FC<CustomerTableProps> = ({
  customers,
  total,
  page,
  pageSize,
  loading,
  onPageChange,
  onEdit,
  onShare,
}) => {
  const { canEditAll, isEmployee } = useAuth();
  const { openCustomerDetailModal } = useUIStore();

  const columns: ColumnsType<Customer> = [
    {
      title: 'STT',
      key: 'index',
      width: 60,
      fixed: 'left',
      render: (_, __, index) => (page - 1) * pageSize + index + 1,
    },
    {
      title: 'Ngày Nhập',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      sorter: true,
      render: (date: string) => dayjs(date).format('DD/MM/YYYY'),
    },
    {
      title: 'Họ và Tên',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      fixed: 'left',
      ellipsis: true,
      render: (name: string) => (
        <Tooltip title={name}>
          <span className="font-medium">{name}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Số điện thoại',
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
      render: (phone: string) => (
        <a href={`tel:${phone}`} className="text-blue-600">
          {phone}
        </a>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 200,
      ellipsis: true,
      render: (email?: string) => email || '-',
    },
    {
      title: 'Nguồn',
      dataIndex: 'source',
      key: 'source',
      width: 110,
      filters: [
        { text: 'Facebook', value: 'Facebook' },
        { text: 'TikTok', value: 'TikTok' },
        { text: 'Google', value: 'Google' },
        { text: 'Instagram', value: 'Instagram' },
      ],
      render: (source: string) => {
        const colors: Record<string, string> = {
          Facebook: 'blue',
          TikTok: 'magenta',
          Google: 'green',
          Instagram: 'purple',
        };
        return <Tag color={colors[source] || 'default'}>{source}</Tag>;
      },
    },
    {
      title: 'Chiến dịch',
      dataIndex: 'campaign',
      key: 'campaign',
      width: 150,
      ellipsis: true,
      render: (campaign?: string) => campaign || '-',
    },
    {
      title: 'Sales',
      dataIndex: ['salesUser', 'name'],
      key: 'salesUser',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      filters: [
        { text: 'Đã chốt', value: 'closed' },
        { text: 'Chờ xử lý', value: 'pending' },
        { text: 'Tiềm năng', value: 'potential' },
        { text: 'Mất', value: 'lost' },
      ],
      render: (status: string) => {
        const statusConfig: Record<
          string,
          { color: string; text: string }
        > = {
          closed: { color: 'success', text: 'Đã chốt' },
          pending: { color: 'warning', text: 'Chờ xử lý' },
          potential: { color: 'processing', text: 'Tiềm năng' },
          lost: { color: 'error', text: 'Mất' },
        };
        const config = statusConfig[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: 'FTD',
      dataIndex: 'latestFTD',
      key: 'latestFTD',
      width: 120,
      align: 'right',
      sorter: true,
      render: (amount?: number) => {
        if (!amount) return '-';
        return (
          <span className="font-semibold text-green-600">
            ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        );
      },
    },
    {
      title: 'Broker',
      dataIndex: 'broker',
      key: 'broker',
      width: 130,
      ellipsis: true,
      render: (broker?: string) => broker || '-',
    },
    {
      title: 'Ngày chốt',
      dataIndex: 'closedDate',
      key: 'closedDate',
      width: 120,
      render: (date?: string) => (date ? dayjs(date).format('DD/MM/YYYY') : '-'),
    },
    {
      title: 'Phòng ban',
      dataIndex: ['department', 'name'],
      key: 'department',
      width: 130,
      ellipsis: true,
    },
    {
      title: 'Ghi chú',
      dataIndex: 'note',
      key: 'note',
      width: 200,
      ellipsis: true,
      render: (note?: string) => {
        if (!note) return '-';
        return (
          <Tooltip title={note}>
            <span className="text-gray-600">{note}</span>
          </Tooltip>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => openCustomerDetailModal(record.id)}
          >
            Xem
          </Button>
          {canEditAll() && (
            <>
              <Button
                type="link"
                icon={<EditOutlined />}
                onClick={() => onEdit(record)}
              >
                Sửa
              </Button>
              <Button
                type="link"
                icon={<ShareAltOutlined />}
                onClick={() => onShare(record)}
              >
                Chia sẻ
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table<Customer>
      columns={columns}
      dataSource={customers}
      rowKey="id"
      loading={loading}
      scroll={{ x: 2000, y: 600 }}
      sticky={{ offsetHeader: 64 }}
      pagination={{
        current: page,
        pageSize: pageSize,
        total: total,
        showSizeChanger: true,
        showTotal: (total) => `Tổng cộng ${total} khách hàng`,
        onChange: onPageChange,
      }}
    />
  );
};
```

### 8. Ant Design Best Practices & Gotchas

#### 8.1. Fixing "Static function can not consume context" (CRITICAL)
Ant Design 5.x uses a CSS-in-JS engine. Static calls like `message.success()` outside of the component lifecycle can't access the theme context (colors, styles) and will trigger a warning. Use the `<App />` component wrapper at the top level and the `App.useApp()` hook inside components.

**Correct Implementation:**

```typescript
// app/layout.tsx or a dedicated wrapper
import { App } from 'antd';

export default function Layout({ children }) {
  return <App>{children}</App>;
}

// Inside your component
'use client';
import { App, Button } from 'antd';

export function ActionButton() {
  const { message, modal } = App.useApp(); // ✅ This hook provides the context-aware versions
  
  const handleAction = () => {
    message.success('Action completed with proper styling!');
    modal.confirm({ title: 'Are you sure?' });
  };

  return <Button onClick={handleAction}>Click Me</Button>;
}
```

#### 8.2. Preventing Double Submissions
Always use a loading state for mutation actions. This prevents users from clicking multiple times during slow network requests, which can lead to duplicate data or 401 Unauthorized race conditions during token refresh.

```typescript
const [isProcessing, setIsProcessing] = useState(false);

const handleSave = async () => {
  if (isProcessing) return; // Guard
  setIsProcessing(true);
  try {
    await api.saveData();
    message.success('Saved!');
  } catch (err) {
    // Error handled by interceptor or locally
  } finally {
    setIsProcessing(false);
  }
};

return (
  <Button 
    type="primary" 
    loading={isProcessing} 
    disabled={isProcessing} 
    onClick={handleSave}
  >
    Save Changes
  </Button>
);
```

#### 8.3. Table Performance (Scrolling & Sticky)
For tables with many columns (like Customers list), always use `scroll={{ x: 'max-content' }}` and `sticky` headers for a better user experience.

```typescript
<Table
  columns={columns}
  dataSource={data}
  scroll={{ x: 1500 }} // Enable horizontal scroll
  sticky={{ offsetHeader: 64 }} // Keep header visible while scrolling
  pagination={{ showSizeChanger: true }}
/>
```

#### 8.4. Space Component Deprecation (CRITICAL)
In recent versions of Ant Design (v6+ preparation), the `direction` prop on the `<Space />` component is deprecated and may be replaced by the `orientation` prop.
- **BAD:** `<Space direction="vertical" />`
- **GOOD:** `<Space orientation="vertical" />` (Confirm warning in console before switching)

```

**Customer Filters Component:**

```typescript
// components/customers/CustomerFilters.tsx
'use client';

import React from 'react';
import { Form, Row, Col, Select, DatePicker, Input, Button, Space } from 'antd';
import { SearchOutlined, ClearOutlined } from '@ant-design/icons';
import { CustomerFilters as FiltersType } from '@/lib/types/customer.types';

const { RangePicker } = DatePicker;
const { Option } = Select;

interface CustomerFiltersProps {
  filters: FiltersType;
  onFiltersChange: (filters: FiltersType) => void;
  departments: { id: number; name: string }[];
  salesUsers: { id: number; name: string }[];
  loading?: boolean;
}

export const CustomerFilters: React.FC<CustomerFiltersProps> = ({
  filters,
  onFiltersChange,
  departments,
  salesUsers,
  loading,
}) => {
  const [form] = Form.useForm();

  const handleSubmit = (values: any) => {
    const newFilters: FiltersType = {
      ...filters,
      departmentId: values.departmentId,
      salesUserId: values.salesUserId,
      status: values.status,
      search: values.search,
      dateFrom: values.dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: values.dateRange?.[1]?.format('YYYY-MM-DD'),
      page: 1, // Reset to first page
    };
    onFiltersChange(newFilters);
  };

  const handleReset = () => {
    form.resetFields();
    onFiltersChange({ page: 1, limit: filters.limit });
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      className="mb-4 p-4 bg-gray-50 rounded-lg"
    >
      <Row gutter={16}>
        <Col xs={24} sm={12} md={6}>
          <Form.Item name="departmentId" label="Phòng ban">
            <Select
              placeholder="Chọn phòng ban"
              allowClear
              showSearch
              filterOption={(input, option) =>
                (option?.children as string)
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
            >
              {departments.map((dept) => (
                <Option key={dept.id} value={dept.id}>
                  {dept.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Form.Item name="salesUserId" label="Sales">
            <Select
              placeholder="Chọn sales"
              allowClear
              showSearch
              filterOption={(input, option) =>
                (option?.children as string)
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
            >
              {salesUsers.map((user) => (
                <Option key={user.id} value={user.id}>
                  {user.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Form.Item name="status" label="Trạng thái">
            <Select placeholder="Chọn trạng thái" allowClear>
              <Option value="closed">Đã chốt</Option>
              <Option value="pending">Chờ xử lý</Option>
              <Option value="potential">Tiềm năng</Option>
              <Option value="lost">Mất</Option>
            </Select>
          </Form.Item>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Form.Item name="dateRange" label="Ngày nhập khách">
            <RangePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              placeholder={['Từ ngày', 'Đến ngày']}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item name="search" label="Tìm kiếm">
            <Input
              placeholder="Tìm theo tên, số điện thoại, email..."
              prefix={<SearchOutlined />}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12} className="flex items-end">
          <Form.Item className="mb-0 w-full">
            <Space className="w-full justify-end">
              <Button htmlType="button" onClick={handleReset} icon={<ClearOutlined />}>
                Xóa bộ lọc
              </Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                Tìm kiếm
              </Button>
            </Space>
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
};
```

### 7. Middleware for Route Protection

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const authStorage = request.cookies.get('auth-storage')?.value;
  
  let isAuthenticated = false;
  if (authStorage) {
    try {
      const parsed = JSON.parse(authStorage);
      isAuthenticated = parsed.state?.isAuthenticated || false;
    } catch (e) {
      // Invalid JSON, not authenticated
    }
  }

  const { pathname } = request.nextUrl;

  // Public routes
  const publicRoutes = ['/login', '/forgot-password'];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  // Redirect to login if not authenticated and trying to access protected route
  if (!isAuthenticated && !isPublicRoute) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect to dashboard if authenticated and trying to access login
  if (isAuthenticated && isPublicRoute) {
    return NextResponse.redirect(new URL('/customers', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};
```

### 8. Ant Design Theme Configuration

```typescript
// app/layout.tsx
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import 'dayjs/locale/vi';

const theme = {
  token: {
    colorPrimary: '#1890ff',
    borderRadius: 6,
    colorBgContainer: '#ffffff',
  },
  components: {
    Table: {
      headerBg: '#fafafa',
      headerColor: '#262626',
      rowHoverBg: '#f5f5f5',
    },
    Button: {
      controlHeight: 36,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        <ConfigProvider theme={theme} locale={viVN}>
          {children}
        </ConfigProvider>
      </body>
    </html>
  );
}
```

### 9. Performance Optimization

**Code Splitting:**
```typescript
// Dynamic import for heavy components
const CustomerDetailModal = dynamic(
  () => import('@/components/customers/CustomerDetailModal'),
  {
    loading: () => <Spin />,
    ssr: false,
  }
);
```

**Debounced Search:**
```typescript
import { useMemo } from 'react';
import debounce from 'lodash/debounce';

const debouncedSearch = useMemo(
  () => debounce((value: string) => {
    onFiltersChange({ ...filters, search: value, page: 1 });
  }, 300),
  [filters, onFiltersChange]
);
```

**Memoization:**
```typescript
import { useMemo } from 'react';

const sortedCustomers = useMemo(() => {
  return [...customers].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}, [customers]);
```

### 10. Error Handling

**Error Boundary Component:**
```typescript
// components/common/ErrorBoundary.tsx
'use client';

import React from 'react';
import { Button, Result } from 'antd';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title="Đã có lỗi xảy ra"
          subTitle="Xin lỗi, đã có lỗi không mong muốn. Vui lòng thử lại."
          extra={
            <Button type="primary" onClick={() => window.location.reload()}>
              Tải lại trang
            </Button>
          }
        />
      );
    }

    return this.props.children;
  }
}
```

### 11. Utility Functions

**Formatters:**
```typescript
// lib/utils/formatters.ts
import dayjs from 'dayjs';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

export const formatDate = (date: string | Date, format = 'DD/MM/YYYY'): string => {
  return dayjs(date).format(format);
};

export const formatPhone = (phone: string): string => {
  // Format: 090 123 4567
  return phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
};

export const truncateText = (text: string, maxLength = 50): string => {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
};
```

**Validators:**
```typescript
// lib/utils/validators.ts
export const isValidVietnamesePhone = (phone: string): boolean => {
  const regex = /^(09|08|07|03|05)[0-9]{8}$/;
  return regex.test(phone);
};

export const isValidEmail = (email: string): boolean => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};
```

### 12. Testing

**Component Test Example:**
```typescript
// components/customers/CustomerTable.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomerTable } from './CustomerTable';

const mockCustomers = [
  {
    id: 1,
    name: 'Test Customer',
    phone: '0901234567',
    source: 'Facebook',
    status: 'pending',
    // ... other fields
  },
];

describe('CustomerTable', () => {
  it('renders customer data correctly', () => {
    render(
      <CustomerTable
        customers={mockCustomers}
        total={1}
        page={1}
        pageSize={20}
        loading={false}
        onPageChange={jest.fn()}
        onEdit={jest.fn()}
        onShare={jest.fn()}
      />
    );

    expect(screen.getByText('Test Customer')).toBeInTheDocument();
    expect(screen.getByText('0901234567')).toBeInTheDocument();
  });

  it('calls onEdit when edit button is clicked', () => {
    const onEdit = jest.fn();
    render(
      <CustomerTable
        customers={mockCustomers}
        total={1}
        page={1}
        pageSize={20}
        loading={false}
        onPageChange={jest.fn()}
        onEdit={onEdit}
        onShare={jest.fn()}
      />
    );

    const editButton = screen.getByText('Sửa');
    fireEvent.click(editButton);

    expect(onEdit).toHaveBeenCalledWith(mockCustomers[0]);
  });
});
```

## Checklist Before Code Commit

- [ ] All types defined in TypeScript (no `any`)
- [ ] Components use Ant Design consistently
- [ ] API calls use the axios instance
- [ ] Loading states handled
- [ ] Error states handled with user-friendly messages
- [ ] Forms have validation
- [ ] Responsive design tested (mobile + desktop)
- [ ] No console.logs in production code
- [ ] Vietnamese translations used
- [ ] Performance optimization (memoization, debouncing)
- [ ] Accessibility considered (ARIA labels, keyboard navigation)

## Common Mistakes to Avoid

❌ **NEVER:**
- Store sensitive data in localStorage (use httpOnly cookies for tokens)
- Skip loading/error states
- Use inline styles (use Tailwind classes)
- Forget to cleanup useEffect dependencies
- Hardcode API URLs (use environment variables)
- Skip TypeScript types
- Ignore mobile responsive design

✅ **ALWAYS:**
- Use TypeScript strictly
- Handle loading/error states
- Use Ant Design components consistently
- Implement proper authentication flow
- Test on different screen sizes
- Use Vietnamese labels
- Follow the file structure

## References
- [Next.js Documentation](https://nextjs.org/docs)
- [Ant Design Components](https://ant.design/components/overview)
- [React Query](https://tanstack.com/query/latest)
- [Zustand](https://github.com/pmndrs/zustand)

## 13. UI Labeling & Sales Assignment Convention (MANDATORY)

To ensure clarity in ownership and data flow, follow these naming conventions across all pages:

### 13.1. User Interaction Labels
- **BAD:** "Data Owner" (Too vague)
- **GOOD:** "**Người tạo**" (Reference to the record creator/uploader)
- **GOOD:** "**Sales Phụ trách chính**" (Reference to the Primary Sales responsible for closing)
- **GOOD:** "**Sales được chia**" (Reference to Shared Sales assisting with the data)

### 13.2. Visual Hierarchy in Tables
- Display **Primary Sales** as the main name with a blue background Tag.
- Display **Shared Sales** as a count badge (e.g., `+2`) with a Tooltip containing the full list of names.

### 13.3. Customer Assignment Indication
In the Assignment/Sharing screens (e.g., `/chia-data`), use a specific icon to help the user identify their own assigned data.
- **Icon:** `👤` (User icon)
- **Color:** `green`
- **Logic:** `isMyPrimary = customer.salesUserId === currentUser.id`