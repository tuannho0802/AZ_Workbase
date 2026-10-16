'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Descriptions, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import { ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { systemApi, type HealthCacheItem, type HealthTableItem, type SystemHealth } from '@/lib/api/system.api';
import { formatBytes } from '@/lib/api/storage.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { canSeeSystemReset } from '@/components/common/SystemResetButton';
import { CRON_STATUS_LABEL, CRON_WARN_LABEL, formatDurationVi, formatRowsEstimate } from '@/lib/utils/system-health-format';

const { Text } = Typography;

/** Phần lỗi riêng lẻ: các phần khác của trang vẫn hiển thị bình thường. */
function SectionError({ title }: { title: string }) {
  return (
    <Card title={title}>
      <Alert type="warning" showIcon message="Không đọc được phần này" description="Các phần khác vẫn có số liệu. Bấm “Làm mới” để thử lại." />
    </Card>
  );
}

const tableColumns: ColumnsType<HealthTableItem> = [
  {
    title: 'Bảng',
    dataIndex: 'name',
    render: (name: string, r) => (
      <Space size={6}>
        <Text code>{name}</Text>
        {r.watched && <Tag>log</Tag>}
      </Space>
    ),
  },
  { title: 'Số dòng (ước lượng)', dataIndex: 'rowsEstimate', align: 'right', render: (n: number) => formatRowsEstimate(n) },
  { title: 'Dung lượng', dataIndex: 'sizeBytes', align: 'right', render: (n: number) => formatBytes(n) },
  {
    title: 'Trạng thái',
    dataIndex: 'warn',
    width: 120,
    render: (warn: boolean) => (warn ? <Tag color="warning" icon={<WarningOutlined />}>Cần dọn</Tag> : <Tag color="success">Bình thường</Tag>),
  },
];

const cacheColumns: ColumnsType<HealthCacheItem> = [
  { title: 'Cache', dataIndex: 'label' },
  { title: 'TTL', dataIndex: 'ttlSeconds', align: 'right', width: 90, render: (n: number) => `${n} giây` },
  { title: 'Số mục (instance này)', dataIndex: 'entries', align: 'right', width: 170, render: (n: number | null) => (n === null ? '—' : n) },
];

export default function SystemHealthPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const allowed = canSeeSystemReset(user);
  const freshRef = useRef(false);

  // Chỉ là lớp ẩn UI - chặn thật ở BE (RootAdminGuard trên GET /system/health).
  useEffect(() => {
    if (user && !allowed) router.replace('/');
  }, [user, allowed, router]);

  const { data, isLoading, isFetching, isError, refetch } = useQuery<SystemHealth>({
    queryKey: ['system', 'health'],
    queryFn: () => systemApi.getHealth(freshRef.current),
    enabled: allowed,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  if (!allowed) return null;

  const onRefresh = () => {
    freshRef.current = true;
    void refetch().finally(() => {
      freshRef.current = false;
    });
  };

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Text type="secondary">
          {data ? `Cập nhật lúc ${dayjs(data.generatedAt).format('HH:mm:ss DD/MM/YYYY')}` : 'Chỉ-đọc, không có thao tác nguy hiểm.'}
        </Text>
        <Button icon={<ReloadOutlined spin={isFetching} />} onClick={onRefresh} disabled={isFetching}>
          Làm mới
        </Button>
      </Space>

      {isError && <Alert type="error" showIcon message="Không tải được dữ liệu sức khoẻ hệ thống" />}
      {isLoading && <Card loading />}

      {data && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              {data.app.error ? (
                <SectionError title="Ứng dụng" />
              ) : (
                <Card title="Ứng dụng">
                  <Descriptions size="small" column={1}>
                    <Descriptions.Item label="Phiên bản">{data.app.version}{data.app.commit ? ` (${data.app.commit})` : ''}</Descriptions.Item>
                    <Descriptions.Item label="Môi trường">{data.app.nodeEnv}{data.app.region ? ` · ${data.app.region}` : ''}</Descriptions.Item>
                    <Descriptions.Item label="Node">{data.app.nodeVersion}</Descriptions.Item>
                    <Descriptions.Item label="Instance chạy được">{formatDurationVi(data.app.uptimeSeconds)}</Descriptions.Item>
                  </Descriptions>
                </Card>
              )}
            </Col>
            <Col xs={24} md={12}>
              {data.database.error ? (
                <SectionError title="Cơ sở dữ liệu" />
              ) : (
                <Card title="Cơ sở dữ liệu">
                  <Row gutter={16}>
                    <Col span={12}>
                      <Statistic title="Phản hồi" value={data.database.pingMs} suffix="ms" />
                    </Col>
                    <Col span={12}>
                      <Statistic title="Máy chủ" value={data.database.serverVersion ?? '—'} valueStyle={{ fontSize: 18 }} />
                    </Col>
                  </Row>
                </Card>
              )}
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              {data.sessions.error ? (
                <SectionError title="Phiên đăng nhập" />
              ) : (
                <Card title="Phiên đăng nhập đang có">
                  <Row gutter={16}>
                    <Col span={12}><Statistic title="Tổng số phiên" value={data.sessions.totalSessions} /></Col>
                    <Col span={12}><Statistic title="Số tài khoản có phiên" value={data.sessions.usersWithSessions} /></Col>
                  </Row>
                </Card>
              )}
            </Col>
            <Col xs={24} md={12}>
              {data.security.error ? (
                <SectionError title="Bảo mật đăng nhập" />
              ) : (
                <Card title="Bảo mật đăng nhập">
                  <Row gutter={16}>
                    <Col span={12}><Statistic title="IP đang bị khoá tạm" value={data.security.activeIpLocks} /></Col>
                    <Col span={12}><Statistic title="IP đang bị chặn chủ động" value={data.security.activeIpBans} /></Col>
                  </Row>
                </Card>
              )}
            </Col>
          </Row>

          {data.cron.error ? (
            <SectionError title="Cron dọn dữ liệu (retention)" />
          ) : (
            <Card title="Cron dọn dữ liệu (retention)">
              {data.cron.warn && data.cron.warnReason && (
                <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={CRON_WARN_LABEL[data.cron.warnReason]} />
              )}
              <Descriptions size="small" column={{ xs: 1, md: 2 }}>
                <Descriptions.Item label="Chu kỳ đang cài">{data.cron.intervalDays} ngày</Descriptions.Item>
                <Descriptions.Item label="Lần chạy gần nhất">
                  {data.cron.lastRun
                    ? `${CRON_STATUS_LABEL[data.cron.lastRun.status] ?? data.cron.lastRun.status} · ${formatDurationVi(data.cron.lastRun.ageSeconds)} trước · xoá ${data.cron.lastRun.affected.toLocaleString('vi-VN')} dòng`
                    : 'Chưa chạy'}
                </Descriptions.Item>
                <Descriptions.Item label="Lần chạy tiếp theo">
                  {data.cron.dueNow ? 'Đã đến hạn — chạy ở lần kích hoạt kế tiếp' : `Sau ${formatDurationVi(data.cron.nextDueInSeconds)}`}
                </Descriptions.Item>
                {data.cron.lastRun?.message && <Descriptions.Item label="Ghi chú">{data.cron.lastRun.message}</Descriptions.Item>}
              </Descriptions>
            </Card>
          )}

          {data.tables.error ? (
            <SectionError title="Dung lượng bảng" />
          ) : (
            <Card
              title="Dung lượng bảng"
              extra={
                <Text type="secondary">
                  Tổng {formatBytes(data.tables.totalBytes)} · {data.tables.warnCount} bảng cần chú ý · số liệu từ{' '}
                  {dayjs(data.tables.cachedAt).format('HH:mm:ss')}
                  {data.tables.fromCache ? ' (cache, tối đa 5 phút)' : ''}
                </Text>
              }
            >
              <Table<HealthTableItem> size="small" rowKey="name" columns={tableColumns} dataSource={data.tables.items} pagination={{ pageSize: 15, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} />
            </Card>
          )}

          {data.caches.error ? (
            <SectionError title="Cache bộ nhớ" />
          ) : (
            <Card title="Cache bộ nhớ" extra={<Text type="secondary">Chỉ của instance đang trả lời request này (serverless: mỗi instance có cache riêng)</Text>}>
              <Table<HealthCacheItem> size="small" rowKey="key" columns={cacheColumns} dataSource={data.caches.items} pagination={false} scroll={{ x: 'max-content' }} />
            </Card>
          )}
        </>
      )}
    </Space>
  );
}
