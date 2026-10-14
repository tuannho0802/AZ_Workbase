'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, DatePicker, Form, Input, InputNumber, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { securityApi, type SecurityConfigValues, type SecurityEvent } from '@/lib/api/security.api';
import { getActionMeta } from '@/lib/api/audit-meta';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const CONFIG_FIELDS: Array<{ key: keyof SecurityConfigValues; label: string; unit: string }> = [
  { key: 'accountMaxFailedAttempts', label: 'Khoá tài khoản sau (lần sai)', unit: 'lần' },
  { key: 'accountLockMinutes', label: 'Thời gian khoá tài khoản', unit: 'phút' },
  { key: 'ipMaxFailedAttempts', label: 'Khoá IP sau (lần sai)', unit: 'lần' },
  { key: 'ipWindowMinutes', label: 'Cửa sổ đếm sai theo IP', unit: 'phút' },
  { key: 'ipLockMinutes', label: 'Thời gian khoá IP', unit: 'phút' },
  { key: 'securityEventRetentionDays', label: 'Giữ sự kiện bảo mật', unit: 'ngày' },
];

function SecurityConfigForm() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<SecurityConfigValues>();
  const [saving, setSaving] = useState(false);
  const { data } = useQuery({
    queryKey: ['security-config'],
    queryFn: securityApi.getConfig,
  });
  if (!data) return <Card loading title="Cấu hình bảo mật đăng nhập" />;

  const onFinish = async (values: SecurityConfigValues) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await securityApi.updateConfig(values);
      message.success(res.changed.length ? 'Đã lưu cấu hình (hiệu lực sau tối đa 30 giây)' : 'Không có thay đổi');
      await queryClient.invalidateQueries({ queryKey: ['security-config'] });
      await queryClient.invalidateQueries({ queryKey: ['security-events'] });
      await queryClient.invalidateQueries({ queryKey: ['system', 'retention-settings'] });
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Lưu cấu hình thất bại'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Cấu hình bảo mật đăng nhập">
      <Form form={form} layout="vertical" initialValues={data.config} onFinish={onFinish}>
        <Row gutter={16}>
          {CONFIG_FIELDS.map((f) => (
            <Col xs={24} sm={12} md={8} key={f.key}>
              <Form.Item name={f.key} label={f.label} extra={`Khoảng hợp lệ ${data.limits[f.key][0]}–${data.limits[f.key][1]}`}>
                <InputNumber min={data.limits[f.key][0]} max={data.limits[f.key][1]} precision={0} style={{ width: '100%' }} suffix={f.unit} />
              </Form.Item>
            </Col>
          ))}
        </Row>
        <Button type="primary" htmlType="submit" loading={saving} disabled={saving}>Lưu cấu hình</Button>
      </Form>
    </Card>
  );
}

export default function SecurityActivityPage() {
  const router = useRouter();
  const { can, isLoading: permLoading } = useMyPermissions();
  const [filters, setFilters] = useState<{ action?: string; ip?: string; search?: string; fromDate?: string; toDate?: string }>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const allowed = can('audit.manage');

  const summary = useQuery({ queryKey: ['security-summary'], queryFn: securityApi.getSummary, enabled: allowed, staleTime: 30_000 });
  const actions = useQuery({ queryKey: ['security-actions'], queryFn: securityApi.getActions, enabled: allowed, staleTime: 300_000 });
  const events = useQuery({
    queryKey: ['security-events', filters, page, pageSize],
    queryFn: () => securityApi.getEvents({ ...filters, page, limit: pageSize }),
    enabled: allowed,
  });

  if (permLoading) return <Card loading />;
  if (!allowed) {
    router.replace('/');
    return null;
  }

  const columns: ColumnsType<SecurityEvent> = [
    { title: 'Thời gian', dataIndex: 'createdAt', width: 150, render: (v: string) => dayjs(v).format('HH:mm DD/MM/YYYY') },
    {
      title: 'Sự kiện', dataIndex: 'action', width: 240,
      render: (a: string) => { const m = getActionMeta(a); return <Tag color={m.color}>{m.label}</Tag>; },
    },
    {
      title: 'Tài khoản / Email', key: 'who',
      render: (_: unknown, r) =>
        r.user ? (
          <span>{r.user.name} <Text type="secondary">({r.user.email})</Text></span>
        ) : (
          <span>
            <Text type="secondary">Không xác định (email chưa có trong hệ thống)</Text>
            {r.newData?.email ? <div><Text code>{r.newData.email}</Text></div> : null}
          </span>
        ),
    },
    { title: 'IP', dataIndex: 'ipAddress', width: 140, render: (v: string | null) => (v ? <Text code>{v}</Text> : '-') },
    { title: 'Thiết bị', dataIndex: 'userAgent', ellipsis: true, render: (v: string | null) => v || '-' },
  ];

  return (
    <Space orientation={'vertical' as never} size="middle" style={{ width: '100%' }}>
      <Row gutter={16}>
        <Col xs={12} md={6}><Card><Statistic title="Lần khoá hôm nay" value={summary.data?.lockedToday ?? 0} loading={summary.isLoading} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Lần đăng nhập sai hôm nay" value={summary.data?.failedToday ?? 0} loading={summary.isLoading} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="IP đang bị khoá" value={summary.data?.blockedIpsNow ?? 0} loading={summary.isLoading} /></Card></Col>
        <Col xs={12} md={6}>
          <Card title="Email lạ bị thử nhiều (7 ngày)" size="small">
            {summary.data?.topUnknownEmails.length
              ? summary.data.topUnknownEmails.map((e) => <div key={e.email}><Text code>{e.email}</Text> × {e.count}</div>)
              : <Text type="secondary">Không có</Text>}
          </Card>
        </Col>
      </Row>

      <Card title="Hoạt động bảo mật">
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            allowClear placeholder="Loại sự kiện" style={{ width: 260 }}
            options={(actions.data ?? []).map((a) => ({ value: a, label: getActionMeta(a).label }))}
            onChange={(v) => { setFilters((f) => ({ ...f, action: v })); setPage(1); }}
          />
          <Input.Search
            allowClear placeholder="IP (tiền tố)" style={{ width: 160 }}
            onSearch={(v) => { setFilters((f) => ({ ...f, ip: v || undefined })); setPage(1); }}
          />
          <Input.Search
            allowClear placeholder="Email / tên tài khoản" style={{ width: 220 }}
            onSearch={(v) => { setFilters((f) => ({ ...f, search: v || undefined })); setPage(1); }}
          />
          <RangePicker
            format="DD/MM/YYYY"
            onChange={(r) => {
              setFilters((f) => ({ ...f, fromDate: r?.[0]?.format('YYYY-MM-DD'), toDate: r?.[1]?.format('YYYY-MM-DD') }));
              setPage(1);
            }}
          />
          <Button onClick={() => { void events.refetch(); void summary.refetch(); }} loading={events.isFetching}>Làm mới</Button>
        </Space>
        <Table<SecurityEvent>
          rowKey="id" columns={columns} dataSource={events.data?.data ?? []} loading={events.isLoading}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page, pageSize, total: events.data?.total ?? 0, showSizeChanger: true,
            showTotal: (t) => `Tổng ${t} sự kiện`,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
          }}
        />
      </Card>

      <SecurityConfigForm />
    </Space>
  );
}
