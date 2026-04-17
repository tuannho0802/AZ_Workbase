'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Tag, Button, Space, Row, Col, Typography,
  Tooltip, Input, Select, DatePicker, Drawer, App,
  Badge, Avatar, Divider, Empty, Checkbox, Modal, Switch, InputNumber, Alert, Tabs
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, InfoCircleOutlined,
  UserOutlined, FileTextOutlined, ClockCircleOutlined,
  DeleteOutlined, SettingOutlined, ClearOutlined,
  ArrowRightOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useRouter } from 'next/navigation';
import { auditApi } from '@/lib/api/audit.api';
import { AuditLog, AuditFilters, AuditSettings } from '@/lib/types/audit.types';
import dayjs from 'dayjs';
import { AuditDiffViewer } from '@/components/audit/AuditDiffViewer';

const { Text, Title, Link } = Typography;
const { RangePicker } = DatePicker;

// ─── Constants & Metadata ──────────────────────────────────────────────────
const ACTION_META: Record<string, { label: string; color: string }> = {
  CREATE_CUSTOMER: { label: 'Tạo khách hàng', color: 'green' },
  UPDATE_CUSTOMER: { label: 'Sửa khách hàng', color: 'blue' },
  DELETE_CUSTOMER: { label: 'Xóa khách hàng', color: 'red' },
  ASSIGN_CUSTOMER: { label: 'Chia data', color: 'purple' },
  CREATE_DEPOSIT: { label: 'Nạp tiền', color: 'gold' },
  DELETE_DEPOSIT: { label: 'Xóa phiếu nạp tiền', color: 'red' },
  CREATE_NOTE: { label: 'Tạo ghi chú', color: 'cyan' },
  CREATE_USER: { label: 'Tạo nhân viên', color: 'green' },
  UPDATE_USER: { label: 'Sửa nhân viên', color: 'blue' },
  RESET_PASSWORD: { label: 'Đặt lại mật khẩu', color: 'orange' },
  USER_LOGIN: { label: 'Đăng nhập', color: 'default' },
  UPDATE_AUDIT_SETTINGS: { label: 'Cập nhập cấu hình Audit', color: 'gray' },
  ADMIN_CLEANUP_AUDIT_LOGS: { label: 'Admin dọn dẹp log', color: 'volcano' },
  ADMIN_BULK_DELETE_AUDIT_LOGS: { label: 'Admin xóa log hàng loạt', color: 'volcano' },
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  customer: 'Khách hàng',
  deposit: 'Phiếu nạp tiền',
  user: 'Nhân viên',
  auth: 'Hệ thống',
  customer_note: 'Ghi chú',
  setting: 'Cấu hình',
  audit_log: 'Nhật ký',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'red',
  manager: 'blue',
  assistant: 'purple',
  employee: 'default',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  assistant: 'Assistant',
  employee: 'Employee',
};

export default function AuditLogsPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const { message, modal } = App.useApp();
  const isAdmin = user?.role === 'admin';

  // ── State ──────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  
  // Selection
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  
  // Settings
  const [settings, setSettings] = useState<AuditSettings>({ enabled: false, retentionDays: 90 });
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState<string | undefined>();
  const [filterEntityType, setFilterEntityType] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  // ── Effects ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (user && !['admin', 'manager'].includes(user.role)) {
      message.warning('Bạn không có quyền truy cập trang này');
      router.replace('/customers');
    }
  }, [user, router, message]);

  useEffect(() => {
    auditApi.getActions().then(setAvailableActions).catch(() => {});
    if (isAdmin) {
      auditApi.getSettings().then(setSettings).catch(() => {});
    }
  }, [isAdmin]);

  const fetchLogs = useCallback(async (pg = page, ps = pageSize) => {
    setLoading(true);
    try {
      const filters: AuditFilters = {
        page: pg,
        limit: ps,
        search: search || undefined,
        action: filterAction,
        entityType: filterEntityType,
        fromDate: dateRange?.[0]?.startOf('day').toISOString(),
        toDate: dateRange?.[1]?.endOf('day').toISOString(),
      };
      const res = await auditApi.getLogs(filters);
      if (res && res.data) {
        setLogs(res.data);
        setTotal(res.total || 0);
      } else {
        setLogs([]);
        setTotal(0);
      }
    } catch (error) {
      console.error('Fetch logs error:', error);
      message.error('Không thể tải nhật ký hệ thống');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, filterAction, filterEntityType, dateRange, message]);

  useEffect(() => {
    if (user && ['admin', 'manager'].includes(user.role)) {
      fetchLogs(page, pageSize);
    }
  }, [page, pageSize, fetchLogs, user]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleSearch = () => { setPage(1); fetchLogs(1, pageSize); };
  const handleReset = () => {
    setSearch(''); setFilterAction(undefined); setFilterEntityType(undefined);
    setDateRange(null); setPage(1);
    setTimeout(() => fetchLogs(1, pageSize), 0);
  };

  const handleUpdateSettings = async () => {
    modal.confirm({
      title: 'Cập nhật cấu hình dọn dẹp',
      content: 'Bạn có chắc muốn thay đổi cấu hình dọn dẹp tự động? Hệ thống sẽ định kỳ xóa các bản ghi cũ hơn số ngày quy định.',
      onOk: async () => {
        setSettingsLoading(true);
        try {
          await auditApi.updateSettings(settings);
          message.success('Đã cập nhật cấu hình thành công');
        } catch {
          message.error('Lỗi khi cập nhật cấu hình');
        } finally {
          setSettingsLoading(false);
        }
      }
    });
  };

  const handleBulkDelete = () => {
    if (selectedRowKeys.length === 0) return;

    modal.confirm({
      title: 'Xác nhận xóa hàng loạt',
      icon: <ExclamationCircleOutlined color="red" />,
      content: (
        <div>
          <Text>Bạn có chắc chắn muốn xóa <b>{selectedRowKeys.length}</b> bản ghi đã chọn?</Text>
          <p style={{ marginTop: 8, color: 'red' }}>Hành động này không thể hoàn tác. Vui lòng nhập "XÁC NHẬN" để tiếp tục:</p>
          <Input id="confirm-input" placeholder="XÁC NHẬN" />
        </div>
      ),
      onOk: async () => {
        const inputEl = document.getElementById('confirm-input') as HTMLInputElement;
        const input = inputEl ? inputEl.value : '';

        if (input !== 'XÁC NHẬN') {
          message.error('Mã xác nhận không đúng');
          return Promise.reject();
        }

        try {
          const idsToDelete = [...selectedRowKeys] as number[];
          await auditApi.bulkDelete(idsToDelete);

          message.success(`Đã xóa thành công ${idsToDelete.length} bản ghi`);
          setSelectedRowKeys([]);

          // Filter logs locally first for immediate UI update and to prevent undefined issues
          setLogs(prev => prev ? prev.filter(log => !idsToDelete.includes(log.id)) : []);

          // Refresh to sync with server pagination
          fetchLogs();
        } catch (error) {
          console.error('Bulk delete error:', error);
        // Error message is handled by axios interceptor
        }
      }
    });
  };

  const handleCleanupRange = () => {
    let range: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null = null;
    modal.confirm({
      title: 'Xóa log theo khoảng thời gian',
      content: (
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">Vui lòng chọn khoảng thời gian cần dọn dẹp:</Text>
          <div style={{ marginTop: 8 }}>
            <RangePicker onChange={(v) => { range = v as any; }} />
          </div>
          <p style={{ marginTop: 16, color: 'red' }}>Vui lòng nhập "XÁC NHẬN" để thực hiện xóa:</p>
          <Input id="cleanup-confirm" placeholder="XÁC NHẬN" />
        </div>
      ),
      onOk: async () => {
        if (!range || !range[0] || !range[1]) {
          message.error('Vui lòng chọn khoảng thời gian');
          return Promise.reject();
        }

        const inputEl = document.getElementById('cleanup-confirm') as HTMLInputElement;
        const input = inputEl ? inputEl.value : '';

        if (input !== 'XÁC NHẬN') {
          message.error('Mã xác nhận không đúng');
          return Promise.reject();
        }

        try {
          const res = await auditApi.cleanupByRange(range[0].toISOString(), range[1].toISOString());
          const count = res?.count ?? 0;
          message.success(`Đã dọn dẹp thành công ${count} bản ghi`);
          fetchLogs();
        } catch (error) {
          console.error('Cleanup error:', error);
        }
      }
    });
  };

  // ── Table definitions ──────────────────────────────────────────────────
  const columns: ColumnsType<AuditLog> = [
    {
      title: 'Thời gian',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (val: string) => (
        <Space orientation={"vertical" as any} size={0}>
          <Text style={{ fontSize: 13, fontWeight: 500 }}>{dayjs(val).format('HH:mm:ss')}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(val).format('DD/MM/YYYY')}</Text>
        </Space>
      ),
    },
    {
      title: 'Người thực hiện',
      key: 'user',
      width: 200,
      render: (_, record) => {
        const u = record.user;
        if (!u) return <Text type="secondary">—</Text>;
        return (
          <Space>
            <Avatar size={28} icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
            <Space orientation={"vertical" as any} size={0}>
              <Text strong style={{ fontSize: 13 }}>{u.name}</Text>
              <Tag color={ROLE_COLORS[u.role] || 'default'} style={{ fontSize: 10, margin: 0 }}>
                {ROLE_LABELS[u.role] || u.role}
              </Tag>
            </Space>
          </Space>
        );
      },
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 180,
      render: (_, record) => {
        const meta = ACTION_META[record.action];
        return meta ? <Tag color={meta.color}>{meta.label}</Tag> : <Tag>{record.action}</Tag>;
      },
    },
    {
      title: 'Đối tượng',
      key: 'entity',
      width: 200,
      render: (_, record) => {
        const isCustomer = record.entityType === 'customer';
        const customer = record.targetCustomer;

        return (
          <Space orientation={"vertical" as any} size={0}>
            <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>
              {ENTITY_TYPE_LABELS[record.entityType] || record.entityType}
            </Text>
            {isCustomer ? (
              customer ? (
                <Space size={4}>
                  <Link onClick={() => router.push(`/customers?id=${customer.id}`)} style={{ fontSize: 13, fontWeight: 500 }}>
                    {customer.name}
                  </Link>
                  {customer.deletedAt && <Tag color="error" style={{ fontSize: 10 }}>Đã xóa</Tag>}
                </Space>
              ) : (
                <Text type="secondary" italic style={{ fontSize: 13 }}>(Khách hàng đã xóa)</Text>
              )
            ) : (
              record.entityType !== 'auth' && <Text style={{ fontSize: 13 }}>#{record.entityId}</Text>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Chi tiết',
      key: 'detail',
      width: 80,
      align: 'center',
      render: (_, record) => (
        <Tooltip title="Xem thay đổi">
          <Button
            type="text"
            size="small"
            icon={<InfoCircleOutlined />}
            onClick={() => { setSelectedLog(record); setDrawerOpen(true); }}
          />
        </Tooltip>
      ),
    },
  ];

  const rowSelection = isAdmin ? {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  } : undefined;

  // ── UI ────────────────────────────────────────────────────────────────
  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <FileTextOutlined style={{ marginRight: 8, color: '#1890ff' }} />
            Nhật ký hệ thống
          </Title>
        </Col>
        <Col>
          <Space>
            {isAdmin && (
              <>
                <Button 
                  danger 
                  icon={<ClearOutlined />} 
                  onClick={handleCleanupRange}
                >
                  Dọn dẹp theo thời gian
                </Button>
                {selectedRowKeys.length > 0 && (
                  <Button 
                    type="primary" 
                    danger 
                    icon={<DeleteOutlined />} 
                    onClick={handleBulkDelete}
                  >
                    Xóa đã chọn ({selectedRowKeys.length})
                  </Button>
                )}
              </>
            )}
            <Badge count={total} overflowCount={99999} color="#1890ff" />
          </Space>
        </Col>
      </Row>

      <Tabs defaultActiveKey="1" items={[
        {
          key: '1',
          label: <span><FileTextOutlined /> Danh sách nhật ký</span>,
          children: (
            <>
              {/* Filters */}
              <Card style={{ marginBottom: 16, borderRadius: 8 }}>
                <Row gutter={[12, 12]} align="middle">
                  <Col xs={24} md={6}>
                    <Input placeholder="Tìm tên người thực hiện/khách hàng..." prefix={<SearchOutlined />} 
                      value={search} onChange={e => setSearch(e.target.value)} onPressEnter={handleSearch} allowClear />
                  </Col>
                  <Col xs={24} md={5}>
                    <Select placeholder="Loại hành động" value={filterAction} onChange={setFilterAction} allowClear style={{ width: '100%' }}
                      options={[...Object.entries(ACTION_META).map(([k, v]) => ({ label: v.label, value: k })), 
                               ...availableActions.filter(a => !ACTION_META[a]).map(a => ({ label: a, value: a }))]} />
                  </Col>
                  <Col xs={24} md={5}>
                    <Select placeholder="Đối tượng" value={filterEntityType} onChange={setFilterEntityType} allowClear style={{ width: '100%' }}
                      options={Object.entries(ENTITY_TYPE_LABELS).map(([k, v]) => ({ label: v, value: k }))} />
                  </Col>
                  <Col xs={24} md={6}>
                    <RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" value={dateRange} onChange={v => setDateRange(v as any)} />
                  </Col>
                  <Col xs={24} md={2}>
                    <Space>
                      <Button type="primary" onClick={handleSearch}>Lọc</Button>
                      <Button icon={<ReloadOutlined />} onClick={handleReset} />
                    </Space>
                  </Col>
                </Row>
              </Card>

              {/* Table */}
              <Card style={{ borderRadius: 8 }}>
                <Table<AuditLog>
                  columns={columns}
                  dataSource={logs}
                  rowKey="id"
                  loading={loading}
                  size="middle"
                  rowSelection={rowSelection}
                  expandable={{
                    expandedRowRender: (record) => (
                      <div style={{ padding: '0 48px 16px' }}>
                        <AuditDiffViewer oldData={record.oldData} newData={record.newData} action={record.action} />
                      </div>
                    ),
                    rowExpandable: (record) => !!(record.oldData || record.newData) || record.action === 'USER_LOGIN',
                  }}
                  pagination={{
                    current: page, pageSize, total, showSizeChanger: true,
                    pageSizeOptions: ['20', '50', '100'],
                    showTotal: (t) => `Tổng cộng ${t.toLocaleString()} bản ghi`,
                    onChange: (p, ps) => { setPage(p); setPageSize(ps); },
                  }}
                />
              </Card>
            </>
          )
        },
        ...(isAdmin ? [{
          key: '2',
          label: <span><SettingOutlined /> Cài đặt dọn dẹp</span>,
          children: (
            <Card title="Cài đặt dọn dẹp tự động" style={{ maxWidth: 600, borderRadius: 8 }}>
              <Space orientation={"vertical" as any} size={24} style={{ width: '100%' }}>
                <Alert
                  title="Lưu ý về dọn dẹp hệ thống"
                  description="Khi bật tự động dọn dẹp, hệ thống sẽ chạy một tiến trình xóa các bản ghi cũ hàng ngày vào lúc 3:00 AM."
                  type="info"
                  showIcon
                />
                
                <Row align="middle">
                  <Col span={12}><Text strong>Tự động dọn dẹp:</Text></Col>
                  <Col span={12}>
                    <Switch checked={settings.enabled} onChange={v => setSettings({ ...settings, enabled: v })} />
                    <Text style={{ marginLeft: 8 }}>{settings.enabled ? 'Đang bật' : 'Đang tắt'}</Text>
                  </Col>
                </Row>

                <Row align="middle">
                  <Col span={12}><Text strong>Thời gian lưu giữ (ngày):</Text></Col>
                  <Col span={12}>
                    <InputNumber min={0} value={settings.retentionDays} onChange={v => setSettings({ ...settings, retentionDays: v || 0 })} />
                    <Text type="secondary" style={{ marginLeft: 8 }}>Mặc định: 90 ngày</Text>
                  </Col>
                </Row>

                <Divider />
                
                <Button type="primary" icon={<SettingOutlined />} loading={settingsLoading} onClick={handleUpdateSettings}>
                  Lưu cấu hình
                </Button>
              </Space>
            </Card>
          )
        }] : [])
      ]} />

      {/* Drawer for legacy view support */}
      <Drawer
        title="Chi tiết hành động"
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedLog(null); }}
        size={640 as any}
        destroyOnClose
      >
        {selectedLog && (
          <div style={{ padding: 16 }}>
            <Title level={5}>Ngữ cảnh</Title>
            <Card size="small" style={{ marginBottom: 24, background: '#f5f5f5' }}>
              <Space orientation={"vertical" as any} style={{ width: '100%' }}>
                {selectedLog.targetCustomer && (
                  <Text><b>Khách hàng:</b> {selectedLog.targetCustomer.name} (ID: #{selectedLog.targetCustomer.id})</Text>
                )}
                <Text><b>Hành động:</b> {ACTION_META[selectedLog.action]?.label || selectedLog.action}</Text>
                <Text><b>Thời gian:</b> {dayjs(selectedLog.createdAt).format('HH:mm:ss DD/MM/YYYY')}</Text>
              </Space>
            </Card>
            
            <Title level={5}>Dữ liệu thay đổi</Title>
            <AuditDiffViewer oldData={selectedLog.oldData} newData={selectedLog.newData} action={selectedLog.action} />
          </div>
        )}
      </Drawer>
    </div>
  );
}
