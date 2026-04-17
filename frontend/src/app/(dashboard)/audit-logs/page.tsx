'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Tag, Button, Space, Row, Col, Typography,
  Tooltip, Input, Select, DatePicker, Drawer, App,
  Badge, Avatar, Divider, Empty
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, InfoCircleOutlined,
  UserOutlined, FileTextOutlined, ClockCircleOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useRouter } from 'next/navigation';
import { auditApi } from '@/lib/api/audit.api';
import { AuditLog, AuditFilters } from '@/lib/types/audit.types';
import dayjs from 'dayjs';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

// ─── Action metadata mapping ────────────────────────────────────────────────
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
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  customer: 'Khách hàng',
  deposit: 'Phiếu nạp tiền',
  user: 'Nhân viên',
  auth: 'Hệ thống',
  customer_note: 'Ghi chú',
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

// ─── Component ──────────────────────────────────────────────────────────────
export default function AuditLogsPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const { message } = App.useApp();

  // ── State ──────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [availableActions, setAvailableActions] = useState<string[]>([]);

  // ── Filters ────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState<string | undefined>();
  const [filterEntityType, setFilterEntityType] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  // ── Auth guard ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (user && !['admin', 'manager'].includes(user.role)) {
      message.warning('Bạn không có quyền truy cập trang này');
      router.replace('/customers');
    }
  }, [user, router, message]);

  // ── Load actions for dropdown ──────────────────────────────────────────
  useEffect(() => {
    auditApi.getActions().then(actions => setAvailableActions(actions)).catch(() => { });
  }, []);

  // ── Fetch logs ─────────────────────────────────────────────────────────
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
      setLogs(res.data);
      setTotal(res.total);
    } catch {
      message.error('Không thể tải nhật ký hệ thống');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, filterAction, filterEntityType, dateRange, message]);

  useEffect(() => {
    if (user && ['admin', 'manager'].includes(user.role)) {
      fetchLogs(page, pageSize);
    }
  }, [page, pageSize, fetchLogs, user]);

  const handleSearch = () => {
    setPage(1);
    fetchLogs(1, pageSize);
  };

  const handleReset = () => {
    setSearch('');
    setFilterAction(undefined);
    setFilterEntityType(undefined);
    setDateRange(null);
    setPage(1);
    setTimeout(() => fetchLogs(1, pageSize), 0);
  };

  // ── Table columns ──────────────────────────────────────────────────────
  const columns: ColumnsType<AuditLog> = [
    {
      title: 'Thời gian',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (val: string) => (
        <Space orientation={"vertical" as any} size={0}>
          <Text style={{ fontSize: 13, fontWeight: 500 }}>
            {dayjs(val).format('HH:mm:ss')}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {dayjs(val).format('DD/MM/YYYY')}
          </Text>
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
            <Space orientation="vertical" size={0}>
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
        return meta
          ? <Tag color={meta.color}>{meta.label}</Tag>
          : <Tag>{record.action}</Tag>;
      },
    },
    {
      title: 'Đối tượng',
      key: 'entity',
      width: 150,
      render: (_, record) => (
        <Space orientation={"vertical" as any} size={0}>
          <Text style={{ fontSize: 12 }}>
            {ENTITY_TYPE_LABELS[record.entityType] || record.entityType}
          </Text>
          {record.entityType !== 'auth' && (
            <Text type="secondary" style={{ fontSize: 11 }}>#{record.entityId}</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'IP',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      width: 120,
      render: (val: string | null) => (
        <Text type="secondary" style={{ fontSize: 12 }}>{val || '—'}</Text>
      ),
    },
    {
      title: 'Chi tiết',
      key: 'detail',
      width: 80,
      align: 'center',
      render: (_, record) => {
        const hasData = record.oldData || record.newData;
        return (
          <Tooltip title={hasData ? 'Xem chi tiết' : 'Không có dữ liệu chi tiết'}>
            <Button
              type="link"
              size="small"
              icon={<InfoCircleOutlined />}
              disabled={!hasData}
              onClick={() => { setSelectedLog(record); setDrawerOpen(true); }}
            />
          </Tooltip>
        );
      },
    },
  ];

  // ── Detail drawer ──────────────────────────────────────────────────────
  const renderJsonBlock = (label: string, data: any) => {
    if (!data) return null;
    // Filter sensitive fields
    const safe = { ...data };
    delete safe.password;
    delete safe.hashedRefreshToken;
    return (
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>{label}</Text>
        <pre
          style={{
            background: '#0d1117',
            color: '#c9d1d9',
            padding: '12px 16px',
            borderRadius: 6,
            fontSize: 12,
            overflowX: 'auto',
            maxHeight: 320,
            overflowY: 'auto',
            margin: 0,
            border: '1px solid #30363d',
          }}
        >
          {JSON.stringify(safe, null, 2)}
        </pre>
      </div>
    );
  };

  if (!user || !['admin', 'manager'].includes(user.role)) return null;

  return (
    <div>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <FileTextOutlined style={{ marginRight: 8, color: '#1890ff' }} />
            Nhật ký hệ thống
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Toàn bộ hành động của người dùng trong hệ thống
          </Text>
        </Col>
        <Col>
          <Badge count={total} overflowCount={99999} color="#1890ff">
            <ClockCircleOutlined style={{ fontSize: 20, color: '#8c8c8c' }} />
          </Badge>
        </Col>
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: 16, borderRadius: 8 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <Input
              placeholder="Tìm theo tên người thực hiện..."
              prefix={<SearchOutlined />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Select
              placeholder="Lọc theo hành động"
              value={filterAction}
              onChange={setFilterAction}
              allowClear
              style={{ width: '100%' }}
              options={[
                ...Object.entries(ACTION_META).map(([k, v]) => ({ label: v.label, value: k })),
                // Add any DB actions not in our map
                ...availableActions
                  .filter(a => !ACTION_META[a])
                  .map(a => ({ label: a, value: a })),
              ]}
            />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Select
              placeholder="Lọc theo đối tượng"
              value={filterEntityType}
              onChange={setFilterEntityType}
              allowClear
              style={{ width: '100%' }}
              options={Object.entries(ENTITY_TYPE_LABELS).map(([k, v]) => ({ label: v, value: k }))}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <RangePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              value={dateRange}
              onChange={(vals) => setDateRange(vals as any)}
            />
          </Col>
          <Col xs={24} sm={24} md={2}>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                Lọc
              </Button>
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
          locale={{ emptyText: <Empty description="Không có nhật ký nào" /> }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (t) => `Tổng cộng ${t.toLocaleString()} bản ghi`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
          rowClassName={(_, idx) => idx % 2 === 0 ? '' : 'ant-table-row-striped'}
        />
      </Card>

      {/* Detail Drawer */}
      <Drawer
        title={
          <Space>
            <InfoCircleOutlined style={{ color: '#1890ff' }} />
            Chi tiết hành động
          </Space>
        }
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedLog(null); }}
        size={560 as any}
        destroyOnClose
      >
        {selectedLog && (
          <div>
            {/* Meta info */}
            <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
              <Space orientation={"vertical" as any} size={6} style={{ width: '100%' }}>
                <Row justify="space-between">
                  <Text type="secondary">Thời gian:</Text>
                  <Text strong>{dayjs(selectedLog.createdAt).format('HH:mm:ss DD/MM/YYYY')}</Text>
                </Row>
                <Row justify="space-between">
                  <Text type="secondary">Người thực hiện:</Text>
                  <Space>
                    <Text strong>{selectedLog.user?.name}</Text>
                    <Tag color={ROLE_COLORS[selectedLog.user?.role] || 'default'} style={{ margin: 0 }}>
                      {ROLE_LABELS[selectedLog.user?.role] || selectedLog.user?.role}
                    </Tag>
                  </Space>
                </Row>
                <Row justify="space-between">
                  <Text type="secondary">Hành động:</Text>
                  {(() => {
                    const m = ACTION_META[selectedLog.action];
                    return m ? <Tag color={m.color}>{m.label}</Tag> : <Tag>{selectedLog.action}</Tag>;
                  })()}
                </Row>
                <Row justify="space-between">
                  <Text type="secondary">Đối tượng:</Text>
                  <Text>
                    {ENTITY_TYPE_LABELS[selectedLog.entityType] || selectedLog.entityType}
                    {selectedLog.entityType !== 'auth' && ` #${selectedLog.entityId}`}
                  </Text>
                </Row>
                {selectedLog.ipAddress && (
                  <Row justify="space-between">
                    <Text type="secondary">IP:</Text>
                    <Text code>{selectedLog.ipAddress}</Text>
                  </Row>
                )}
              </Space>
            </Card>

            <Divider titlePlacement="left" style={{ fontSize: 13 }}>Dữ liệu thay đổi</Divider>

            {renderJsonBlock('📋 Dữ liệu mới (New Data)', selectedLog.newData)}
            {renderJsonBlock('📂 Dữ liệu cũ (Old Data)', selectedLog.oldData)}

            {!selectedLog.newData && !selectedLog.oldData && (
              <Empty description="Không có dữ liệu chi tiết" />
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
