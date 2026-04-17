'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Table, Select, Button, Modal, Tag, Space, Input,
  Typography, Row, Col, Statistic, Divider, Tabs,
  Avatar, Tooltip, Badge, Form, App
} from 'antd';
import {
  UserAddOutlined, ReloadOutlined, SearchOutlined,
  CheckCircleOutlined, TeamOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axiosInstance from '@/lib/api/axios-instance';
import { useAuthStore } from '@/lib/stores/auth.store';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

// ── TYPES ──────────────────────────────────────────────
interface Customer {
  id: number;
  name: string | null;
  phone: string | null;
  source: string | null;
  campaign: string | null;
  inputDate: string | null;
  salesUser: { id: number; name: string; fullName?: string } | null;
  createdBy: { id: number; name: string; fullName?: string } | null;
  updatedBy?: { id: number; name: string; fullName?: string } | null;
  createdAt: string;
  updatedAt?: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

// ── API CALLS (inline để tránh import lỗi) ─────────────
const api = {
  getUnassigned: (p: any) => 
    axiosInstance.get('/customers/unassigned', { params: p }),
  getAssigned: (p: any) => 
    axiosInstance.get('/customers/assigned', { params: p }),
  bulkAssign: (body: any) => 
    axiosInstance.patch('/customers/bulk-assign', body),
  getUsers: () => 
    axiosInstance.get('/users/all'),
};

// ── MAIN COMPONENT ─────────────────────────────────────
export default function ChiaDataPage() {
  const qc = useQueryClient();
  const { message: antdMessage } = App.useApp();

  // State: filters cho bảng Chưa assign
  const [unassignedPage, setUnassignedPage] = useState(1);
  const [unassignedSearch, setUnassignedSearch] = useState('');
  const [filterSource, setFilterSource] = useState<string | null>(null);
  const [filterDataOwner, setFilterDataOwner] = useState<number | null>(null);

  // State: filters cho bảng Đã assign
  const [assignedPage, setAssignedPage] = useState(1);
  const [assignedSearch, setAssignedSearch] = useState('');
  const [filterAssignedTo, setFilterAssignedTo] = useState<number | null>(null);

  // State: selection + modal
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [targetSalesIds, setTargetSalesIds] = useState<number[]>([]);

  // Auth State
  const router = useRouter();
  const { user, isAuthenticated, isHydrated } = useAuthStore();

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.push('/login');
    }
  }, [isHydrated, isAuthenticated, router]);

  // ── QUERIES ────────────────────────────────────────────
  const { data: unassignedData, isLoading: loadingUnassigned } = useQuery({
    queryKey: ['unassigned', unassignedPage, unassignedSearch, 
                filterSource, filterDataOwner],
    queryFn: () => api.getUnassigned({
      page: unassignedPage, limit: 20,
      search: unassignedSearch || undefined,
      source: filterSource || undefined,
      creatorId: filterDataOwner || undefined,
    }).then(r => r.data),
    staleTime: 30_000,
    enabled: isHydrated && isAuthenticated, // Chỉ chạy khi đã nạp xong token
  });

  const { data: assignedData, isLoading: loadingAssigned } = useQuery({
    queryKey: ['assigned', assignedPage, assignedSearch, filterAssignedTo],
    queryFn: () => api.getAssigned({
      page: assignedPage, limit: 20,
      search: assignedSearch || undefined,
      salesUserId: filterAssignedTo || undefined,
    }).then(r => r.data),
    staleTime: 30_000,
    enabled: isHydrated && isAuthenticated,
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => api.getUsers().then(r => r.data),
    staleTime: 5 * 60_000,
    enabled: isHydrated && isAuthenticated,
  });

  // ── MUTATION: Bulk Assign ───────────────────────────────
  const { mutate: doAssign, isPending: assigning } = useMutation({
    mutationFn: () => api.bulkAssign({
      customerIds: selectedIds,
      salesUserIds: targetSalesIds,
      reason: 'Redesigned Chia Data Page Assignment',
    }).then(r => r.data),
    onSuccess: (result) => {
      antdMessage.success(
        `✅ Đã chia ${result.success} khách cho ${targetSalesIds.length} Sales`
      );
      if (result.failed > 0) {
        antdMessage.warning(`Có ${result.failed} khách không thể chia (đã có sales hoặc lỗi)`);
      }
      // Reset và refresh
      setSelectedIds([]);
      setTargetSalesIds([]);
      setModalOpen(false);
      qc.invalidateQueries({ queryKey: ['unassigned'] });
      qc.invalidateQueries({ queryKey: ['assigned'] });
    },
    onError: (err: any) => {
      console.log('Assignment error:', err);
      antdMessage.error('Lỗi: ' + (err.response?.data?.message || err.message));
    },
  });

  // ── HELPERS ──────────────────────────────────────────
  const renderAuditTrail = (record: Customer | any) => {
    console.log('Tooltip record:', record);
    console.log('Tooltip updatedBy:', record.updatedBy);
    const creatorName = record.createdBy?.fullName || record.createdBy?.name || 'Không xác định';
    const updaterName = record.updatedBy?.fullName || record.updatedBy?.name;
    const createdAt = record.createdAt ? dayjs(record.createdAt).format('HH:mm DD/MM/YYYY') : '—';
    const updatedAt = record.updatedAt ? dayjs(record.updatedAt).format('HH:mm DD/MM/YYYY') : null;

    return (
      <div style={{ minWidth: 200, padding: '4px' }}>
        <div>
          <strong>Tạo bởi:</strong> {creatorName}
          <br />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
            {createdAt}
          </span>
        </div>
        <Divider style={{ margin: '8px 0', borderColor: 'rgba(255,255,255,0.2)' }} />
        {record.updatedBy ? (
          <div>
            <strong>Sửa cuối:</strong> {updaterName}
            <br />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
              {updatedAt}
            </span>
          </div>
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.45)', fontStyle: 'italic' }}>Chưa có chỉnh sửa</div>
        )}
      </div>
    );
  };

  // ── COLUMNS: Bảng Chưa assign ──────────────────────────
  const unassignedColumns = [
    {
      title: '#', width: 50,
      render: (_: any, __: any, i: number) =>
        (unassignedPage - 1) * 20 + i + 1,
    },
    {
      title: 'Tên khách hàng', dataIndex: 'name', width: 200,
      render: (v: string | null, r: Customer) => {
        const isMyPrimary = r.salesUser?.id === user?.id;
        return (
          <Space>
            {isMyPrimary && (
              <Tooltip title="Bạn đang là Sales phụ trách chính">
                <Tag color="green" style={{ margin: 0 }}>👤</Tag>
              </Tooltip>
            )}
            {v ? (
              <Space size={4}>
                <Text strong style={{ color: '#1890ff' }}>{v}</Text>
                <Tooltip title={renderAuditTrail(r)} mouseEnterDelay={0.3}>
                  <InfoCircleOutlined style={{ color: '#1890ff', cursor: 'help', fontSize: '12px' }} />
                </Tooltip>
              </Space>
            ) : <Text type="secondary" italic>Chưa có tên</Text>}
          </Space>
        );
      }
    },
    {
      title: 'SĐT', dataIndex: 'phone', width: 130,
      render: (v: string | null) => v
        ? v
        : <Text type="secondary">Chưa có</Text>,
    },
    {
      title: 'Nguồn', dataIndex: 'source', width: 110,
      render: (v: string | null) => v
        ? <Tag color="blue">{v}</Tag>
        : <Text type="secondary">-</Text>,
    },
    {
      title: 'Campaign', dataIndex: 'campaign', width: 160,
      ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    {
      title: 'Người tạo', width: 130,
      render: (_: any, r: Customer) => (
        <Tooltip title={renderAuditTrail(r)}>
          <span style={{ cursor: 'help' }}>{r.createdBy?.name || 'Hệ thống'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Ngày nhập', dataIndex: 'inputDate', width: 110,
      render: (v: string | null) => v
        ? dayjs(v).format('DD/MM/YYYY')
        : '-',
    },
  ];

  // ── COLUMNS: Bảng Đã assign ────────────────────────────
  const assignedColumns = [
    {
      title: '#', width: 50,
      render: (_: any, __: any, i: number) =>
        (assignedPage - 1) * 20 + i + 1,
    },
    {
      title: 'Tên khách hàng', dataIndex: 'name', width: 200,
      render: (v: string | null, r: Customer) => (
        v ? (
          <Space size={4}>
            <Text strong style={{ color: '#1890ff' }}>{v}</Text>
            <Tooltip title={renderAuditTrail(r)} mouseEnterDelay={0.3}>
              <InfoCircleOutlined style={{ color: '#1890ff', cursor: 'help', fontSize: '12px' }} />
            </Tooltip>
          </Space>
        ) : <Text type="secondary" italic>Chưa có tên</Text>
      ),
    },
    {
      title: 'SĐT', dataIndex: 'phone', width: 130,
      render: (v: string | null) => v || 
        <Text type="secondary">Chưa có</Text>,
    },
    {
      title: 'Sales Phụ trách chính', width: 180,
      render: (_: any, r: any) => {
        const primarySales = r.salesUser;
        const allAssignees = r.activeAssignees || [];
        const sharedSales = allAssignees.filter((a: any) => a.id !== primarySales?.id);

        if (!primarySales && sharedSales.length === 0) {
          return <Text type="secondary">-</Text>;
        }

        return (
          <Space size={[0, 4]} align="center" wrap>
            {primarySales ? <Tag color="blue" title="Sales phụ trách chính">{primarySales.name}</Tag> : <Text type="secondary">Chưa có Primary</Text>}
            {sharedSales.length > 0 && (
              <Tooltip title={`Sales được chia:\n${sharedSales.map((a: any) => a.name).join(', ')}`}>
                <Tag color="cyan">+{sharedSales.length}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Nguồn', dataIndex: 'source', width: 100,
      render: (v: string | null) => v
        ? <Tag color="blue">{v}</Tag> : '-',
    },
    {
      title: 'Người tạo', width: 130,
      render: (_: any, r: Customer) => (
        <Tooltip title={renderAuditTrail(r)}>
          <span style={{ cursor: 'help' }}>{r.createdBy?.name || 'Hệ thống'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Ngày nhập', dataIndex: 'inputDate', width: 110,
      render: (v: string | null) => v
        ? dayjs(v).format('DD/MM/YYYY') : '-',
    },
  ];

  // ── USER OPTIONS cho Select ────────────────────────────
  const userOptions = (usersData || []).map((u: User) => ({
    value: u.id,
    label: (
      <Space>
        <Avatar size="small" style={{ 
          backgroundColor: u.role === 'admin' ? '#f5222d' 
            : u.role === 'manager' ? '#1890ff' : '#52c41a' 
        }}>
          {u.name?.[0]?.toUpperCase()}
        </Avatar>
        <span>{u.name || u.email}</span>
        <Tag style={{ fontSize: 10 }}>{u.role}</Tag>
      </Space>
    ),
  }));

  // ── RENDER ─────────────────────────────────────────────
  if (!isHydrated || !isAuthenticated) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Typography.Title level={4}>Đang kiểm tra quyền truy cập...</Typography.Title>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      
      {/* HEADER STATS */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <div style={{ 
            background: '#fff', padding: 20, borderRadius: 8,
            border: '1px solid #f0f0f0' 
          }}>
            <Statistic
              title="Có thể chia"
              value={unassignedData?.pagination?.total ?? 0}
              prefix={<TeamOutlined style={{ color: '#faad14' }} />}
              styles={{ content: { color: '#faad14', fontSize: 28 } }}
            />
          </div>
        </Col>
        <Col span={6}>
          <div style={{ 
            background: '#fff', padding: 20, borderRadius: 8,
            border: '1px solid #f0f0f0' 
          }}>
            <Statistic
              title="Đã assign"
              value={assignedData?.pagination?.total ?? 0}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              styles={{ content: { color: '#52c41a', fontSize: 28 } }}
            />
          </div>
        </Col>
      </Row>

      {/* TABS: 2 bảng */}
      <Tabs
        defaultActiveKey="unassigned"
        items={[
          {
            key: 'unassigned',
            label: (
              <Badge 
                count={unassignedData?.pagination?.total ?? 0}
                overflowCount={9999}
                color="#faad14"
              >
                <span style={{ paddingRight: 8 }}>📋 Có thể chia</span>
              </Badge>
            ),
            children: (
              <>
                {/* FILTER ROW */}
                <Row gutter={12} style={{ marginBottom: 16 }} align="middle">
                  <Col flex="280px">
                    <Input
                      prefix={<SearchOutlined />}
                      placeholder="Tên, SĐT..."
                      allowClear
                      value={unassignedSearch}
                      onChange={e => {
                        setUnassignedSearch(e.target.value);
                        setUnassignedPage(1);
                      }}
                    />
                  </Col>
                  <Col flex="180px">
                    <Select
                      allowClear
                      placeholder="Nguồn"
                      style={{ width: '100%' }}
                      options={['Facebook','TikTok','Google',
                        'Instagram','Other'].map(s => ({ 
                          value: s, label: s 
                        }))}
                      onChange={v => { 
                        setFilterSource(v ?? null); 
                        setUnassignedPage(1); 
                      }}
                    />
                  </Col>
                  <Col flex="180px">
                    <Select
                      allowClear
                      placeholder="Data Owner"
                      style={{ width: '100%' }}
                      options={(usersData || []).map((u: User) => ({
                        value: u.id,
                        label: u.name || u.email,
                      }))}
                      onChange={v => { 
                        setFilterDataOwner(v ?? null); 
                        setUnassignedPage(1); 
                      }}
                    />
                  </Col>
                  <Col flex="auto" />
                  {/* NÚT CHIA — chỉ hiện khi đã chọn */}
                  {selectedIds.length > 0 && (
                    <Col>
                      <Button
                        type="primary"
                        icon={<UserAddOutlined />}
                        onClick={() => setModalOpen(true)}
                        style={{ background: '#1890ff' }}
                      >
                        Chia {selectedIds.length} khách →
                      </Button>
                    </Col>
                  )}
                  <Col>
                    <Tooltip title="Làm mới">
                      <Button
                        icon={<ReloadOutlined />}
                        onClick={() => 
                          qc.invalidateQueries({ 
                            queryKey: ['unassigned'] 
                          })
                        }
                      />
                    </Tooltip>
                  </Col>
                </Row>

                {/* SELECTION INFO */}
                {selectedIds.length > 0 && (
                  <div style={{
                    background: '#e6f7ff', border: '1px solid #91d5ff',
                    borderRadius: 6, padding: '8px 16px',
                    marginBottom: 12, display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <Text>
                      Đã chọn <Text strong>{selectedIds.length}</Text> khách hàng
                    </Text>
                    <Button 
                      size="small" 
                      onClick={() => setSelectedIds([])}
                    >
                      Bỏ chọn tất cả
                    </Button>
                  </div>
                )}

                {/* TABLE */}
                <Table
                  rowSelection={{
                    selectedRowKeys: selectedIds,
                    onChange: keys => setSelectedIds(keys as number[]),
                    preserveSelectedRowKeys: true,
                  }}
                  columns={unassignedColumns}
                  dataSource={unassignedData?.customers ?? []}
                  rowKey="id"
                  loading={loadingUnassigned}
                  size="small"
                  pagination={{
                    current: unassignedPage,
                    pageSize: 20,
                    total: unassignedData?.pagination?.total ?? 0,
                    onChange: p => setUnassignedPage(p),
                    showTotal: t => `Tổng ${t.toLocaleString()} khách chưa assign`,
                    showSizeChanger: false,
                  }}
                  locale={{ emptyText: '✅ Không còn khách chưa assign' }}
                />
              </>
            ),
          },
          {
            key: 'assigned',
            label: (
              <Badge
                count={assignedData?.pagination?.total ?? 0}
                overflowCount={9999}
                color="#52c41a"
              >
                <span style={{ paddingRight: 8 }}>✅ Đã assign</span>
              </Badge>
            ),
            children: (
              <>
                {/* FILTER */}
                <Row gutter={12} style={{ marginBottom: 16 }}>
                  <Col flex="280px">
                    <Input
                      prefix={<SearchOutlined />}
                      placeholder="Tên, SĐT khách..."
                      allowClear
                      value={assignedSearch}
                      onChange={e => {
                        setAssignedSearch(e.target.value);
                        setAssignedPage(1);
                      }}
                    />
                  </Col>
                  <Col flex="220px">
                    <Select
                      allowClear
                      placeholder="Lọc theo Sales"
                      style={{ width: '100%' }}
                      options={(usersData || []).map((u: User) => ({
                        value: u.id,
                        label: u.name || u.email,
                      }))}
                      onChange={v => {
                        setFilterAssignedTo(v ?? null);
                        setAssignedPage(1);
                      }}
                    />
                  </Col>
                  <Col>
                    <Tooltip title="Làm mới">
                      <Button
                        icon={<ReloadOutlined />}
                        onClick={() => 
                          qc.invalidateQueries({ 
                            queryKey: ['assigned'] 
                          })
                        }
                      />
                    </Tooltip>
                  </Col>
                </Row>

                {/* TABLE */}
                <Table
                  columns={assignedColumns}
                  dataSource={assignedData?.customers ?? []}
                  rowKey="id"
                  loading={loadingAssigned}
                  size="small"
                  pagination={{
                    current: assignedPage,
                    pageSize: 20,
                    total: assignedData?.pagination?.total ?? 0,
                    onChange: p => setAssignedPage(p),
                    showTotal: t => `Tổng ${t.toLocaleString()} khách đã assign`,
                    showSizeChanger: false,
                  }}
                  locale={{ emptyText: 'Chưa có khách nào được assign' }}
                />
              </>
            ),
          },
        ]}
      />

      {/* ── MODAL ASSIGN ─────────────────────────────── */}
      <Modal
        open={modalOpen}
        title={
          <Space>
            <UserAddOutlined style={{ color: '#1890ff' }} />
            <span>
              Chia <Text strong style={{ color: '#1890ff' }}>
                {selectedIds.length}
              </Text> khách hàng
            </span>
          </Space>
        }
        onCancel={() => {
          setModalOpen(false);
          setTargetSalesIds([]);
        }}
        footer={[
          <Button 
            key="cancel" 
            onClick={() => {
              setModalOpen(false);
              setTargetSalesIds([]);
            }}
          >
            Hủy
          </Button>,
          <Button
            key="confirm"
            type="primary"
            icon={<UserAddOutlined />}
            loading={assigning}
            disabled={targetSalesIds.length === 0}
            onClick={() => doAssign()}
          >
            Xác nhận chia cho {targetSalesIds.length} Sales
          </Button>,
        ]}
        width={560}
        destroyOnHidden
      >
        <div style={{ padding: '8px 0' }}>
          {/* Summary */}
          <div style={{
            background: '#f6ffed', border: '1px solid #b7eb8f',
            borderRadius: 6, padding: '10px 16px', marginBottom: 20
          }}>
            <Text>
              Sẽ chia <Text strong>{selectedIds.length}</Text> khách 
              cho <Text strong>{targetSalesIds.length || '?'}</Text> Sales
              {targetSalesIds.length > 1 && (
                <Text type="secondary">
                  {' '}(mỗi Sales nhận cả {selectedIds.length} khách)
                </Text>
              )}
            </Text>
          </div>

          {/* Select Sales */}
          <div style={{ marginBottom: 8 }}>
            <Text strong>Chọn Sales nhận data:</Text>
          </div>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="Tìm tên hoặc email sales..."
            value={targetSalesIds}
            onChange={setTargetSalesIds}
            options={userOptions}
            filterOption={(input, option) => {
              const u = (usersData || []).find(
                (u: User) => u.id === option?.value
              );
              const q = input.toLowerCase();
              return (
                u?.name?.toLowerCase().includes(q) ||
                u?.email?.toLowerCase().includes(q)
              ) ?? false;
            }}
            optionLabelProp="label"
            showSearch
            maxTagCount="responsive"
          />

          {/* Preview Sales được chọn */}
          {targetSalesIds.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Sales sẽ nhận data:
              </Text>
              <div style={{ marginTop: 8, display: 'flex', 
                flexWrap: 'wrap', gap: 8 }}>
                {targetSalesIds.map(id => {
                  const u = (usersData || []).find(
                    (u: User) => u.id === id
                  );
                  return u ? (
                    <Tag 
                      key={id}
                      color="blue"
                      closable
                      onClose={() => setTargetSalesIds(
                        prev => prev.filter(x => x !== id)
                      )}
                    >
                      {u.name || u.email}
                    </Tag>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
