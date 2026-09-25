'use client';

import { useMemo, useState } from 'react';
import { App, Alert, Button, Card, Col, Empty, Input, Progress, Row, Select, Space, Statistic, Table, Tag, Tooltip, Typography, DatePicker } from 'antd';
import { BarChartOutlined, InfoCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useDepartments } from '@/lib/hooks/useDepartments';
import { usePeriodicTaskPerformanceSummary } from '@/lib/hooks/usePeriodicTaskPerformance';
import { LATE_GRACE_DAYS, type PerformanceUserRow } from '@/lib/api/periodic-task-performance.api';
import { PERIOD_TYPE_LABELS, type PeriodType } from '@/lib/api/periodic-tasks.api';
import { aggregateRows, completionColor, lateRateColor, percentOf } from '@/lib/utils/periodicTaskPerformance';
import { clampRange, getMonthRange, getThisWeekRange, MAX_TASK_RANGE_DAYS } from '@/lib/utils/periodicTaskRange';
import { resolveEntityColor } from '@/lib/utils/entityColor';
import { PerformanceStackedChart, CHART_MAX_USERS } from '@/components/periodic-tasks/PerformanceStackedChart';
import { PerformanceUserTasksDrawer } from '@/components/periodic-tasks/PerformanceUserTasksDrawer';
import { OwnPerformanceDetail } from '@/components/periodic-tasks/OwnPerformanceDetail';
import { useAuthStore } from '@/lib/stores/auth.store';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const PERMISSION_KEY = 'periodic_tasks.performance_view';

const SCOPE_META = {
  own: { label: 'Chỉ của tôi', color: 'default' },
  department: { label: 'Theo phòng ban', color: 'blue' },
  all: { label: 'Toàn bộ', color: 'green' },
} as const;

type QuickKey = 'thisWeek' | 'thisMonth' | 'lastMonth' | 'last90';
const QUICK_RANGES: { key: QuickKey; label: string }[] = [
  { key: 'thisWeek', label: 'Tuần này' },
  { key: 'thisMonth', label: 'Tháng này' },
  { key: 'lastMonth', label: 'Tháng trước' },
  { key: 'last90', label: '90 ngày gần đây' },
];
const getQuickRange = (key: QuickKey): [Dayjs, Dayjs] => {
  const now = dayjs();
  switch (key) {
    case 'thisWeek':
      return getThisWeekRange(now);
    case 'thisMonth':
      return getMonthRange(now);
    case 'lastMonth':
      return getMonthRange(now.subtract(1, 'month'));
    case 'last90':
      return [now.subtract(89, 'day').startOf('day'), now.endOf('day')];
  }
};

const FMT = 'YYYY-MM-DD';

export default function TaskPerformancePage() {
  const { message } = App.useApp();
  const { scope: permissionScope } = useMyPermissions();
  const { departments } = useDepartments();
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Mặc định THÁNG NÀY (BE mặc định tuần này, nhưng với "hiệu suất" tuần này
  // phần lớn Task còn trong ân hạn nên số liệu gần như trống).
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(() => getMonthRange(dayjs()));
  const [periodType, setPeriodType] = useState<PeriodType | undefined>();
  const [departmentId, setDepartmentId] = useState<number | undefined>();
  const [searchText, setSearchText] = useState('');
  const [drawerUser, setDrawerUser] = useState<{ id: number; name: string } | null>(null);

  const params = useMemo(
    () => ({
      dateFrom: dateRange[0].format(FMT),
      dateTo: dateRange[1].format(FMT),
      periodType,
      departmentId,
    }),
    [dateRange, periodType, departmentId],
  );

  const { data, isLoading, isFetching, isError, refetch } = usePeriodicTaskPerformanceSummary(params);

  // Scope THẬT BE áp dụng (ưu tiên response) - fallback permission khi chưa tải xong.
  const viewScope = data?.scope ?? permissionScope(PERMISSION_KEY) ?? 'own';
  const canSeeOthers = viewScope !== 'own';

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const totals = useMemo(() => aggregateRows(rows), [rows]);

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return q ? rows.filter((r) => r.userName.toLowerCase().includes(q)) : rows;
  }, [rows, searchText]);

  const activeQuick = QUICK_RANGES.find(({ key }) => {
    const [f, t] = getQuickRange(key);
    return f.format(FMT) === dateRange[0].format(FMT) && t.format(FMT) === dateRange[1].format(FMT);
  })?.key;

  const applyRange = (from: Dayjs, to: Dayjs) => {
    const { range, clamped } = clampRange(from, to);
    if (clamped) message.warning(`Khoảng ngày tối đa ${MAX_TASK_RANGE_DAYS} ngày - đã tự cắt bớt ngày kết thúc.`);
    setDateRange(range);
  };

  const columns: ColumnsType<PerformanceUserRow> = [
    {
      title: 'Nhân viên',
      dataIndex: 'userName',
      key: 'userName',
      fixed: 'left',
      width: 180,
      sorter: (a, b) => a.userName.localeCompare(b.userName),
      render: (name: string) => <Text strong>{name}</Text>,
    },
    { title: 'Tổng Task', dataIndex: 'total', key: 'total', width: 100, align: 'right', sorter: (a, b) => a.total - b.total },
    {
      title: 'Đúng hạn',
      dataIndex: 'completedOnTime',
      key: 'completedOnTime',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.completedOnTime - b.completedOnTime,
      render: (v: number) => <Text style={{ color: '#52c41a' }}>{v}</Text>,
    },
    {
      title: 'Xong muộn',
      dataIndex: 'completedLate',
      key: 'completedLate',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.completedLate - b.completedLate,
      render: (v: number) => (v > 0 ? <Text style={{ color: '#d48806' }}>{v}</Text> : v),
    },
    {
      title: 'Quá hạn chưa xong',
      dataIndex: 'overdueNotCompleted',
      key: 'overdueNotCompleted',
      width: 150,
      align: 'right',
      sorter: (a, b) => a.overdueNotCompleted - b.overdueNotCompleted,
      render: (v: number) => (v > 0 ? <Text type="danger" strong>{v}</Text> : v),
    },
    {
      title: (
        <Tooltip title={`Chưa xong nhưng vẫn còn trong ${LATE_GRACE_DAYS} ngày ân hạn sau kỳ hạn - không bị tính là trễ.`}>
          Đang trong hạn <InfoCircleOutlined />
        </Tooltip>
      ),
      dataIndex: 'pendingFuture',
      key: 'pendingFuture',
      width: 150,
      align: 'right',
      sorter: (a, b) => a.pendingFuture - b.pendingFuture,
    },
    {
      title: '% Hoàn thành',
      dataIndex: 'completionRatePercent',
      key: 'completionRatePercent',
      width: 180,
      sorter: (a, b) => (a.completionRatePercent ?? -1) - (b.completionRatePercent ?? -1),
      render: (v: number | null) =>
        v == null ? '—' : <Progress percent={v} size="small" strokeColor={completionColor(v)} format={(p) => `${p}%`} />,
    },
    {
      title: '% Xong muộn',
      dataIndex: 'lateRatePercent',
      key: 'lateRatePercent',
      width: 120,
      align: 'center',
      sorter: (a, b) => (a.lateRatePercent ?? -1) - (b.lateRatePercent ?? -1),
      render: (v: number | null) => (v == null ? '—' : <Tag color={lateRateColor(v)}>{v}%</Tag>),
    },
    {
      title: (
        <Tooltip title="Số Task ĐANG có trạng thái 'Đang làm' ngay tại thời điểm xem (snapshot hiện tại) - độc lập với các cột Đúng hạn/Xong muộn/Quá hạn ở trên.">
          % Đang làm <InfoCircleOutlined />
        </Tooltip>
      ),
      dataIndex: 'inProgressRatePercent',
      key: 'inProgressRatePercent',
      width: 120,
      align: 'center',
      sorter: (a, b) => (a.inProgressRatePercent ?? -1) - (b.inProgressRatePercent ?? -1),
      render: (v: number | null, r) =>
        v == null ? '—' : (
          <Tooltip title={`${r.inProgressCount}/${r.total} Task`}>
            <Tag color="processing">{v}%</Tag>
          </Tooltip>
        ),
    },
    {
      title: (
        <Tooltip title="Số Task ĐANG có trạng thái 'Đang xem xét (In review)' ngay tại thời điểm xem (snapshot hiện tại) - độc lập với các cột Đúng hạn/Xong muộn/Quá hạn ở trên.">
          % Đang xem xét <InfoCircleOutlined />
        </Tooltip>
      ),
      dataIndex: 'inReviewRatePercent',
      key: 'inReviewRatePercent',
      width: 130,
      align: 'center',
      sorter: (a, b) => (a.inReviewRatePercent ?? -1) - (b.inReviewRatePercent ?? -1),
      render: (v: number | null, r) =>
        v == null ? '—' : (
          <Tooltip title={`${r.inReviewCount}/${r.total} Task`}>
            <Tag color="purple">{v}%</Tag>
          </Tooltip>
        ),
    },
    {
      title: 'Checklist',
      key: 'checklist',
      width: 130,
      align: 'right',
      sorter: (a, b) => (percentOf(a.checklistDone, a.checklistTotal) ?? -1) - (percentOf(b.checklistDone, b.checklistTotal) ?? -1),
      render: (_, r) =>
        r.checklistTotal === 0 ? (
          '—'
        ) : (
          <Tooltip title={`${percentOf(r.checklistDone, r.checklistTotal)}%`}>
            {r.checklistDone}/{r.checklistTotal}
          </Tooltip>
        ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      fixed: 'right',
      width: 110,
      render: (_, r) => {
        const flagged = r.completedLate + r.overdueNotCompleted;
        // MỚI (2026-09-25, yêu cầu chủ dự án): bỏ `disabled={flagged === 0}` -
        // role cao hơn (department/all) phải xem được chi tiết Task của 1
        // User BẤT KỲ LÚC NÀO, không chỉ khi User đó đang có Task "cần lưu
        // ý". Số `(N)` sau "Chi tiết" vẫn giữ làm gợi ý nhanh có bao nhiêu
        // Task muộn/quá hạn, nhưng không còn khoá nút khi N = 0.
        return (
          <Button type="link" size="small" onClick={() => setDrawerUser({ id: r.userId, name: r.userName })}>
            Chi tiết{flagged > 0 ? ` (${flagged})` : ''}
          </Button>
        );
      },
    },
  ];

  const scopeMeta = SCOPE_META[viewScope];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <Space size={12} wrap>
          <Title level={3} style={{ margin: 0 }}>
            <BarChartOutlined /> Hiệu suất công việc
          </Title>
          <Tag color={scopeMeta.color}>Phạm vi xem: {scopeMeta.label}</Tag>
        </Space>
        <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()}>
          Làm mới
        </Button>
      </div>

      {!canSeeOthers && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          title="Bạn chưa được cấp quyền xem hiệu suất của người khác - chỉ hiển thị dữ liệu của chính bạn."
        />
      )}

      <Card size="small" variant="outlined" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <RangePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              placeholder={['Từ ngày', 'Đến ngày']}
              allowClear={false}
              value={dateRange}
              onChange={(vals) => vals?.[0] && vals?.[1] && applyRange(vals[0], vals[1])}
            />
          </Col>
          <Col xs={12} md={5}>
            <Select
              allowClear
              placeholder="Loại kỳ"
              style={{ width: '100%' }}
              value={periodType}
              onChange={(v) => setPeriodType(v ?? undefined)}
              options={(Object.keys(PERIOD_TYPE_LABELS) as PeriodType[]).map((k) => ({ value: k, label: PERIOD_TYPE_LABELS[k] }))}
            />
          </Col>
          {canSeeOthers && (
            <Col xs={12} md={5}>
              <Select
                allowClear
                showSearch
                optionFilterProp="name"
                placeholder="Phòng ban"
                style={{ width: '100%' }}
                value={departmentId}
                onChange={(v) => setDepartmentId(v ?? undefined)}
                options={departments.map((d) => ({
                  value: d.id,
                  name: d.name,
                  label: <Tag color={resolveEntityColor(d.color)} style={{ marginInlineEnd: 0 }}>{d.name}</Tag>,
                }))}
              />
            </Col>
          )}
          {canSeeOthers && (
            <Col xs={24} md={6}>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Tìm tên nhân viên..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </Col>
          )}
          <Col span={24}>
            <Space size={8} wrap>
              <Text type="secondary" style={{ fontSize: 13 }}>Lọc nhanh:</Text>
              {QUICK_RANGES.map(({ key, label }) => (
                <Button
                  key={key}
                  size="small"
                  type={activeQuick === key ? 'primary' : 'default'}
                  onClick={() => applyRange(...getQuickRange(key))}
                >
                  {label}
                </Button>
              ))}
            </Space>
          </Col>
        </Row>
      </Card>

      {isError && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }} title="Không tải được dữ liệu hiệu suất. Vui lòng thử lại." />
      )}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={8} xl={5}>
          <Card size="small" variant="outlined">
            <Statistic title="Tổng Task trong kỳ" value={totals.total} loading={isLoading} />
          </Card>
        </Col>
        <Col xs={12} md={8} xl={5}>
          <Card size="small" variant="outlined">
            <Statistic
              title="% Hoàn thành"
              value={totals.completionRatePercent ?? '—'}
              suffix={totals.completionRatePercent == null ? undefined : '%'}
              styles={{ content: { color: completionColor(totals.completionRatePercent) } }}
              loading={isLoading}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {totals.completedOnTime + totals.completedLate}/{totals.total} Task
            </Text>
          </Card>
        </Col>
        <Col xs={12} md={8} xl={5}>
          <Card size="small" variant="outlined">
            <Statistic
              title="% Xong muộn"
              value={totals.lateRatePercent ?? '—'}
              suffix={totals.lateRatePercent == null ? undefined : '%'}
              styles={{ content: { color: totals.lateRatePercent ? '#d48806' : undefined } }}
              loading={isLoading}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>{totals.completedLate} Task xong muộn</Text>
          </Card>
        </Col>
        <Col xs={12} md={8} xl={5}>
          <Card size="small" variant="outlined">
            <Statistic
              title="Quá hạn chưa xong"
              value={totals.overdueNotCompleted}
              styles={{ content: { color: totals.overdueNotCompleted > 0 ? '#f5222d' : undefined } }}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col xs={24} md={8} xl={4}>
          <Card size="small" variant="outlined">
            <Statistic
              title="Checklist"
              value={totals.checklistRatePercent ?? '—'}
              suffix={totals.checklistRatePercent == null ? undefined : '%'}
              loading={isLoading}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>{totals.checklistDone}/{totals.checklistTotal} mục</Text>
          </Card>
        </Col>
        <Col xs={12} md={8} xl={5}>
          <Card size="small" variant="outlined">
            <Statistic
              title="% Đang làm"
              value={totals.inProgressRatePercent ?? '—'}
              suffix={totals.inProgressRatePercent == null ? undefined : '%'}
              styles={{ content: { color: '#1677ff' } }}
              loading={isLoading}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>{totals.inProgressCount}/{totals.total} Task</Text>
          </Card>
        </Col>
        <Col xs={12} md={8} xl={5}>
          <Card size="small" variant="outlined">
            <Statistic
              title="% Đang xem xét"
              value={totals.inReviewRatePercent ?? '—'}
              suffix={totals.inReviewRatePercent == null ? undefined : '%'}
              styles={{ content: { color: '#722ed1' } }}
              loading={isLoading}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>{totals.inReviewCount}/{totals.total} Task</Text>
          </Card>
        </Col>
      </Row>

      {canSeeOthers && rows.length > 1 && (
        <Card
          size="small"
          variant="outlined"
          style={{ marginBottom: 16 }}
          title="Phân bổ Task theo nhân viên"
          extra={rows.length > CHART_MAX_USERS ? <Text type="secondary" style={{ fontSize: 12 }}>Top {CHART_MAX_USERS} theo số Task - xem đủ ở bảng bên dưới</Text> : null}
        >
          <PerformanceStackedChart rows={rows} />
        </Card>
      )}

      <Card size="small" variant="outlined">
        <Table<PerformanceUserRow>
          rowKey="userId"
          size="middle"
          loading={isLoading}
          columns={columns}
          dataSource={filteredRows}
          scroll={{ x: 1550 }}
          pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false, showTotal: (t) => `${t} nhân viên` }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có Task nào trong khoảng đã chọn" /> }}
        />
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
          <InfoCircleOutlined /> Hiệu suất tính theo người Phụ trách chính. Task được coi là hoàn thành khi chuyển sang In review hoặc Hoàn thành;
          bị tính muộn nếu việc đó xảy ra sau kỳ hạn + {LATE_GRACE_DAYS} ngày. Task chưa xong nhưng còn trong {LATE_GRACE_DAYS} ngày ân hạn
          hiển thị ở cột &quot;Đang trong hạn&quot;. Trạng thái bị loại khỏi rollup không được tính. Cột &quot;% Đang làm&quot;/&quot;% Đang xem xét&quot;
          là snapshot trạng thái HIỆN TẠI của Task, tách biệt hoàn toàn với các cột hoàn thành/muộn/quá hạn ở trên - 1 Task có thể vừa
          &quot;Quá hạn chưa xong&quot; vừa đang &quot;Đang làm&quot; cùng lúc.
        </Text>
      </Card>

      {/* MỚI (2026-09-25, yêu cầu chủ dự án): khi `performance_view` TẮT
          (hoặc BẬT nhưng resolve về 'own' - CÙNG 1 logic, xem JSDoc
          `resolveScope()` BE) thì bảng tổng hợp phía trên gần như vô nghĩa
          (luôn đúng 1 dòng của chính mình) - hiển thị THÊM view chi tiết
          hơn, khác hẳn giao diện bảng tổng hợp, để xem trực tiếp từng Task. */}
      {!canSeeOthers && currentUserId != null && <OwnPerformanceDetail userId={currentUserId} periodType={periodType} />}

      <PerformanceUserTasksDrawer user={drawerUser} periodType={periodType} onClose={() => setDrawerUser(null)} />
    </div>
  );
}