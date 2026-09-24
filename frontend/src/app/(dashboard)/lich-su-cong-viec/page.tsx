'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card, Tag, Button, Space, Row, Col, Typography,
  Input, Select, DatePicker, App, Badge, Avatar,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, UserOutlined, HistoryOutlined,
  DeleteOutlined, ClearOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useRouter } from 'next/navigation';
import { periodicTaskAuditLogsApi } from '@/lib/api/periodic-task-audit-logs.api';
import {
  PeriodicTaskAuditLogGlobal,
  PeriodicTaskAuditLogFilters,
  PERIODIC_TASK_AUDIT_ACTION_META,
} from '@/lib/types/periodic-task-audit.types';
import { PERIODIC_TASK_FIELD_LABELS } from '@/components/periodic-tasks/TaskAuditLogsModal';
import { LazyAuditDiff } from '@/components/audit/LazyAuditDiff';
import { WeeklyLazySection, type WeekBucketDto } from '@/components/common/WeeklyLazySection';
import dayjs from 'dayjs';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useRoleColorMap } from '@/lib/hooks/useRoleColorMap';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  assistant: 'Assistant',
  employee: 'Employee',
};

const TaskHistoryMobileCard = ({ record }: { record: PeriodicTaskAuditLogGlobal }) => {
  const meta = PERIODIC_TASK_AUDIT_ACTION_META[record.action];
  const { getRoleColor } = useRoleColorMap();
  const [showDiff, setShowDiff] = useState(false);

  return (
    <Card size="small" variant="outlined" style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        {meta ? <Tag color={meta.color} style={{ fontSize: 11 }}>{meta.label}</Tag> : <Tag style={{ fontSize: 11 }}>{record.action}</Tag>}
        <Text type="secondary" style={{ fontSize: 11 }}>
          {dayjs(record.createdAt).format('HH:mm:ss DD/MM/YYYY')}
        </Text>
      </div>

      <div style={{ marginBottom: 6 }}>
        <Text strong style={{ fontSize: 13, color: '#1890ff' }}>{record.task.title}</Text>
        {record.task.deletedAt && <Tag color="error" style={{ fontSize: 10, marginLeft: 6 }}>Task đã xoá</Tag>}
      </div>

      <Space>
        <Avatar size={18} icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
        <Text style={{ fontSize: 12 }}>{record.user?.name ?? `User #${record.userId}`}</Text>
        {record.user?.role && (
          <Tag color={getRoleColor(record.user.role)} style={{ fontSize: 9, margin: 0 }}>
            {ROLE_LABELS[record.user.role] || record.user.role}
          </Tag>
        )}
      </Space>

      <div style={{ marginTop: 8 }}>
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setShowDiff((v) => !v)}>
          {showDiff ? 'Ẩn chi tiết' : 'Xem chi tiết'}
        </Button>
        {showDiff && (
          <LazyAuditDiff
            logId={record.id}
            action={record.action}
            scope="task-audit"
            fetchDetail={periodicTaskAuditLogsApi.getGlobalDetail}
            extraFieldLabels={PERIODIC_TASK_FIELD_LABELS}
          />
        )}
      </div>
    </Card>
  );
};

/**
 * Trang "Lịch sử Công việc định kỳ" - mirror ĐÚNG `/audit-logs` (Nhật ký hệ
 * thống chung, `audit.controller.ts`) nhưng nguồn dữ liệu là
 * `periodic_task_audit_logs` (RIÊNG của module "Công việc định kỳ"). Trước
 * đây lịch sử CHỈ xem được theo TỪNG Task (`TaskAuditLogsModal`, `GET /:id/
 * audit-logs`) - trang này gộp log của MỌI Task trong phạm vi scope người
 * xem (BE tự lọc qua `PeriodicTaskAccessHelper.applyViewFilter()`, FE không
 * cần tự lọc), có filter đủ bộ + bulk xoá/dọn dẹp theo khoảng ngày.
 *
 * Permission: `periodic_tasks.audit_view` để xem (permission RIÊNG, đã tách
 * khỏi `periodic_tasks.view` qua migration `SplitPeriodicTasksAuditViewPermission`
 * - trước đây tái dùng chung với trang "Công việc định kỳ" nên Admin không
 * bật/tắt độc lập được), `periodic_tasks.delete` (vốn chỉ seed Admin, xem
 * PERMISSIONS.md) để bulk xoá/dọn dẹp - mirror `audit.manage` của trang
 * `/audit-logs`.
 */
export default function TaskHistoryPage() {
  const { can, scope, isLoading: permissionsLoading } = useMyPermissions();

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const { user } = useAuthStore();
  const router = useRouter();
  const { message, modal } = App.useApp();
  const { getRoleColor } = useRoleColorMap();
  // Bulk-xoá/dọn dẹp log CHỈ cho scope 'all' (BE cũng chặn) - scope 'own' chỉ để xoá Task của mình.
  const canManage = can('periodic_tasks.delete') && scope('periodic_tasks.delete') === 'all';

  useEffect(() => {
    if (!permissionsLoading && user && !can('periodic_tasks.audit_view')) {
      message.warning('Bạn không có quyền truy cập trang này');
      router.replace('/customers');
    }
    // `can` từ useMyPermissions KHÔNG memoized (hàm mới mỗi render) - thêm vào
    // deps sẽ khiến effect này chạy lại mỗi render, không infinite loop
    // nhưng dư thừa. Bỏ qua theo đúng pattern đã dùng ở effect fetchLogs bên dưới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, permissionsLoading, router, message]);

  // ── State ──────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<PeriodicTaskAuditLogGlobal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  // ⚠️ WEEK-MODE (đồng bộ `/audit-logs` - yêu cầu người dùng: "1 trang = 4
  // tuần") - thay `pageSize` (số BẢN GHI/trang) bằng `weeksPerPage` (số
  // TUẦN/trang), xem `PeriodicTaskAuditLogFilters.weeksPerPage`.
  const [weeksPerPage, setWeeksPerPage] = useState(4);
  const [totalWeeks, setTotalWeeks] = useState(0);
  const [truncated, setTruncated] = useState(false);
  // Week-mode 2 pha (xem WeeklyLazySection): PHA 1 = `weeks`, PHA 2 dùng lại `weekFilters`.
  const [weeks, setWeeks] = useState<WeekBucketDto[]>([]);
  const [weekFilters, setWeekFilters] = useState<PeriodicTaskAuditLogFilters>({});
  const [fetchToken, setFetchToken] = useState(0);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  useEffect(() => {
    periodicTaskAuditLogsApi.getActions().then(setAvailableActions).catch(() => {});
  }, []);

  const fetchLogs = useCallback(async (pg = page, wpp = weeksPerPage) => {
    setLoading(true);
    try {
      const filters: PeriodicTaskAuditLogFilters = {
        page: pg,
        weeksPerPage: wpp,
        search: search || undefined,
        action: filterAction,
        fromDate: dateRange?.[0]?.startOf('day').toISOString(),
        toDate: dateRange?.[1]?.endOf('day').toISOString(),
      };
      const res = await periodicTaskAuditLogsApi.getGlobal(filters);
      setLogs(res?.data ?? []);
      setWeeks(res?.weeks ?? []);
      setWeekFilters(filters);
      setFetchToken((t) => t + 1);
      setTotal(res?.total ?? 0);
      setTotalWeeks(res?.totalWeeks ?? 0);
      setTruncated(!!res?.truncated);
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Không thể tải lịch sử Công việc định kỳ'));
      setLogs([]);
      setWeeks([]);
    } finally {
      setLoading(false);
    }
  }, [page, weeksPerPage, search, filterAction, dateRange, message]);

  // PHA 2: lấy đúng bản ghi của 1 tuần khi panel được mở.
  const fetchWeekLogs = useCallback(
    async (weekStart: string, weekPage: number, weekLimit: number) => {
      const r = await periodicTaskAuditLogsApi.getGlobal({ ...weekFilters, weekStart, weekPage, weekLimit });
      return { data: r?.data ?? [], weekTotal: r?.weekTotal };
    },
    [weekFilters],
  );

  useEffect(() => {
    if (user && can('periodic_tasks.audit_view')) {
      fetchLogs(page, weeksPerPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, weeksPerPage, fetchLogs, user]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleSearch = () => { setPage(1); fetchLogs(1, weeksPerPage); };
  const handleReset = () => {
    setSearch(''); setFilterAction(undefined); setDateRange(null); setPage(1);
    setTimeout(() => fetchLogs(1, weeksPerPage), 0);
  };

  const handleBulkDelete = () => {
    if (selectedRowKeys.length === 0) return;

    modal.confirm({
      title: 'Xác nhận xóa hàng loạt',
      icon: <ExclamationCircleOutlined color="red" />,
      content: (
        <div>
          <Text>Bạn có chắc chắn muốn xóa <b>{selectedRowKeys.length}</b> bản ghi lịch sử đã chọn?</Text>
          <p style={{ marginTop: 8, color: 'red' }}>Hành động này không thể hoàn tác. Vui lòng nhập &quot;XÁC NHẬN&quot; để tiếp tục:</p>
          <Input id="task-history-confirm-input" placeholder="XÁC NHẬN" />
        </div>
      ),
      onOk: async () => {
        const inputEl = document.getElementById('task-history-confirm-input') as HTMLInputElement;
        const input = inputEl ? inputEl.value : '';

        if (input !== 'XÁC NHẬN') {
          message.error('Mã xác nhận không đúng');
          return Promise.reject();
        }

        try {
          const idsToDelete = [...selectedRowKeys] as number[];
          await periodicTaskAuditLogsApi.bulkDelete(idsToDelete);

          message.success(`Đã xóa thành công ${idsToDelete.length} bản ghi`);
          setSelectedRowKeys([]);
          setLogs((prev) => prev.filter((log) => !idsToDelete.includes(log.id)));
          fetchLogs();
        } catch (error) {
          message.error(getApiErrorMessage(error, 'Không thể xóa lịch sử đã chọn'));
        }
      },
    });
  };

  const handleCleanupRange = () => {
    let range: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null = null;
    modal.confirm({
      title: 'Xóa lịch sử theo khoảng thời gian',
      content: (
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">Vui lòng chọn khoảng thời gian cần dọn dẹp:</Text>
          <div style={{ marginTop: 8 }}>
            <RangePicker onChange={(v) => { range = v as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null; }} />
          </div>
          <p style={{ marginTop: 16, color: 'red' }}>Vui lòng nhập &quot;XÁC NHẬN&quot; để thực hiện xóa:</p>
          <Input id="task-history-cleanup-confirm" placeholder="XÁC NHẬN" />
        </div>
      ),
      onOk: async () => {
        if (!range || !range[0] || !range[1]) {
          message.error('Vui lòng chọn khoảng thời gian');
          return Promise.reject();
        }

        const inputEl = document.getElementById('task-history-cleanup-confirm') as HTMLInputElement;
        const input = inputEl ? inputEl.value : '';

        if (input !== 'XÁC NHẬN') {
          message.error('Mã xác nhận không đúng');
          return Promise.reject();
        }

        try {
          const res = await periodicTaskAuditLogsApi.cleanupByRange(
            range[0].toISOString(),
            range[1].toISOString(),
          );
          message.success(`Đã dọn dẹp thành công ${res?.count ?? 0} bản ghi`);
          fetchLogs();
        } catch (error) {
          message.error(getApiErrorMessage(error, 'Không thể dọn dẹp lịch sử'));
        }
      },
    });
  };

  // ── Table definitions ──────────────────────────────────────────────────
  const columns: ColumnsType<PeriodicTaskAuditLogGlobal> = [
    {
      title: 'Thời gian',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (val: string) => (
        <Space orientation="vertical" size={0}>
          <Text style={{ fontSize: 13, fontWeight: 500 }}>{dayjs(val).format('HH:mm:ss')}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(val).format('DD/MM/YYYY')}</Text>
        </Space>
      ),
    },
    {
      title: 'Công việc',
      key: 'task',
      width: 240,
      render: (_, record) => (
        <Space size={4}>
          <Text style={{ fontSize: 13, fontWeight: 500, color: '#1890ff' }}>{record.task.title}</Text>
          {record.task.deletedAt && <Tag color="error" style={{ fontSize: 10 }}>Đã xoá</Tag>}
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
              <Tag color={getRoleColor(u.role)} style={{ fontSize: 10, margin: 0 }}>
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
        const meta = PERIODIC_TASK_AUDIT_ACTION_META[record.action];
        return meta ? <Tag color={meta.color}>{meta.label}</Tag> : <Tag>{record.action}</Tag>;
      },
    },
  ];

  const rowSelection = canManage ? {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  } : undefined;

  if (permissionsLoading || !can('periodic_tasks.audit_view')) {
    return null;
  }

  // ── UI ────────────────────────────────────────────────────────────────
  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <HistoryOutlined style={{ marginRight: 8, color: '#1890ff' }} />
            Lịch sử Công việc
          </Title>
          <Text type="secondary">Toàn bộ log thay đổi của mọi Công việc định kỳ trong phạm vi quyền của bạn.</Text>
        </Col>
        <Col>
          <Space>
            {canManage && (
              <>
                <Button danger icon={<ClearOutlined />} onClick={handleCleanupRange}>
                  Dọn dẹp theo thời gian
                </Button>
                {selectedRowKeys.length > 0 && !isMobile && (
                  <Button type="primary" danger icon={<DeleteOutlined />} onClick={handleBulkDelete}>
                    Xóa đã chọn ({selectedRowKeys.length})
                  </Button>
                )}
              </>
            )}
            <Badge count={total} overflowCount={99999} color="#1890ff" />
          </Space>
        </Col>
      </Row>

      {/* Filters */}
      <Card variant="outlined" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={8}>
            <Input
              placeholder="Tìm theo tên Công việc/người thực hiện..."
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </Col>
          <Col xs={24} md={6}>
            <Select
              placeholder="Loại hành động"
              value={filterAction}
              onChange={setFilterAction}
              allowClear
              style={{ width: '100%' }}
              options={availableActions.map((a) => ({
                label: PERIODIC_TASK_AUDIT_ACTION_META[a]
                  ? <Tag color={PERIODIC_TASK_AUDIT_ACTION_META[a].color} style={{ marginInlineEnd: 0 }}>{PERIODIC_TASK_AUDIT_ACTION_META[a].label}</Tag>
                  : <Tag style={{ marginInlineEnd: 0 }}>{a}</Tag>,
                value: a,
              }))}
            />
          </Col>
          <Col xs={24} md={6}>
            <RangePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              value={dateRange}
              onChange={(v) => setDateRange(v as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
            />
          </Col>
          <Col xs={24} md={4}>
            <Space>
              <Button type="primary" onClick={handleSearch}>Lọc</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset} />
            </Space>
          </Col>
        </Row>
      </Card>

      {/* ⚠️ MỚI (yêu cầu người dùng: đồng bộ y hệt `/audit-logs` - gom theo
          tuần bằng `WeeklyCollapseSection`, phân trang thật giữ nguyên). */}
      {isMobile ? (
        <div style={{ padding: '0 4px' }}>
          <WeeklyLazySection<PeriodicTaskAuditLogGlobal>
            weeks={weeks}
            fetchWeek={fetchWeekLogs}
            resetKey={fetchToken}
            rowKey="id"
            columns={columns}
            isMobile
            loading={loading}
            emptyText="Chưa có lịch sử ghi nhận"
            renderMobileCard={(record) => <TaskHistoryMobileCard key={record.id} record={record} />}
            pagination={{
              current: page, pageSize: weeksPerPage, total: totalWeeks,
              showTotal: (t) => `${t} tuần (${total.toLocaleString()} bản ghi)`,
              onChange: (p, ps) => { setPage(p); setWeeksPerPage(ps || weeksPerPage); },
            }}
          />
        </div>
      ) : (
        <Card variant="outlined" style={{ borderRadius: 8 }}>
            <WeeklyLazySection<PeriodicTaskAuditLogGlobal>
              weeks={weeks}
              fetchWeek={fetchWeekLogs}
              resetKey={fetchToken}
              rowKey="id"
              columns={columns}
            loading={loading}
            size="middle"
            rowSelection={rowSelection}
              emptyText="Chưa có lịch sử ghi nhận"
            expandable={{
              expandedRowRender: (record) => (
                <div style={{ padding: '0 48px 16px' }}>
                  <LazyAuditDiff
                    logId={record.id}
                    action={record.action}
                    scope="task-audit"
                    fetchDetail={periodicTaskAuditLogsApi.getGlobalDetail}
                    extraFieldLabels={PERIODIC_TASK_FIELD_LABELS}
                  />
                </div>
              ),
              rowExpandable: () => true, // list không còn trả oldData/newData -> fetch lazy khi mở
            }}
            pagination={{
              current: page, pageSize: weeksPerPage, total: totalWeeks, showSizeChanger: true,
              pageSizeOptions: ['2', '4', '8'],
              showTotal: (t) => `Tổng cộng ${t} tuần (${total.toLocaleString()} bản ghi)`,
              onChange: (p, ps) => { setPage(p); setWeeksPerPage(ps); },
            }}
          />
        </Card>
      )}
    </div>
  );
}