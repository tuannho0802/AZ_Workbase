'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card, Tag, Button, Space, Row, Col, Typography,
  Tooltip, Input, Select, Cascader, DatePicker, Drawer, App,
  Badge, Avatar, Divider, Switch, InputNumber, Alert, Tabs
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, InfoCircleOutlined,
  UserOutlined, FileTextOutlined,
  DeleteOutlined, SettingOutlined, ClearOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useRouter } from 'next/navigation';
import { auditApi } from '@/lib/api/audit.api';
import { AuditLog, AuditFilters, AuditSettings } from '@/lib/types/audit.types';
import dayjs from 'dayjs';
import { AuditDiffViewer } from '@/components/audit/AuditDiffViewer';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useRoleColorMap } from '@/lib/hooks/useRoleColorMap';
import { SalesUserSelect } from '@/components/customers/SalesUserSelect';
import { WeeklyCollapseSection } from '@/components/common/WeeklyCollapseSection';
import {
  ACTION_META,
  ACTION_GROUP_LABELS,
  ACTION_GROUP_ORDER,
  ENTITY_TYPE_LABELS,
  getActionMeta,
  getEntitySummary,
} from '@/lib/api/audit-meta';

const { Text, Title, Link } = Typography;
const { RangePicker } = DatePicker;

// ─── Cascader "Loại hành động" (2 cấp: Nhóm nghiệp vụ -> Hành động cụ thể) ──
// ~94 action nếu để phẳng 1 dropdown rất khó dò (yêu cầu người dùng: "dropdown
// khá dài, cần filter dễ tìm hơn"). Cascader cho phép: (1) thu gọn theo nhóm,
// chỉ mở nhóm cần xem, (2) gõ tìm - antd tự khớp trên CẢ 2 cấp (tên nhóm lẫn
// tên action) khi bật `showSearch`, nên gõ "chấm công" hay gõ "khớp lại" đều
// ra kết quả. Tính 1 lần ở module scope (không đổi theo state) - phần action
// BE có thật nhưng FE chưa kịp gắn nhãn được gộp thêm động trong component
// (phụ thuộc `availableActions` fetch từ API).
const BASE_ACTION_CASCADER_OPTIONS = ACTION_GROUP_ORDER.filter((g) => g !== 'audit').map((groupKey) => ({
  value: groupKey,
  label: ACTION_GROUP_LABELS[groupKey],
  children: Object.entries(ACTION_META)
    .filter(([k, v]) => v.group === groupKey && k !== 'USER_LOGIN')
    .map(([k, v]) => ({ value: k, label: v.label })),
}));
const UNKNOWN_ACTION_GROUP_VALUE = '__unknown__';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  assistant: 'Assistant',
  employee: 'Employee',
};

const AuditLogMobileCard = ({ record, onShowDetail }: { record: AuditLog; onShowDetail: () => void }) => {
  const meta = getActionMeta(record.action);
  const u = record.user;
  const isCustomer = record.entityType === 'customer';
  const customer = record.targetCustomer;
  // Với customer, ưu tiên tên khách hàng thật (đã có API trả kèm) - các
  // entityType còn lại (link_group, media_source, storage_media...) dùng
  // `getEntitySummary` để suy ra tên/ngữ cảnh từ oldData/newData.
  const summary = getEntitySummary(record);
  const { getRoleColor } = useRoleColorMap();

  return (
    <Card
      size="small"
      variant="outlined"
      style={{ marginBottom: 8, cursor: 'pointer' }}
      onClick={onShowDetail}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Tag color={meta.color} style={{ fontSize: 11 }}>{meta.label}</Tag>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {dayjs(record.createdAt).format('HH:mm:ss DD/MM/YYYY')}
        </Text>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        {u ? (
          <Space>
            <Avatar size={20} icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
            <Text strong style={{ fontSize: 12 }}>{u.name}</Text>
            <Tag color={getRoleColor(u.role)} style={{ fontSize: 9, margin: 0, padding: '0 4px', lineHeight: '14px' }}>
              {ROLE_LABELS[u.role] || u.role}
            </Tag>
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>
            {ENTITY_TYPE_LABELS[record.entityType] || record.entityType}
          </Text>
          {isCustomer ? (
            customer ? (
              <Text style={{ fontSize: 12, fontWeight: 500, color: '#1890ff' }}>
                {customer.name} {customer.deletedAt && '(Đã xóa)'}
              </Text>
            ) : (
              <Text type="secondary" italic style={{ fontSize: 12 }}>(Khách hàng đã xóa)</Text>
            )
          ) : (
              <>
                {summary.name && <Text style={{ fontSize: 12, fontWeight: 500 }}>{summary.name}</Text>}
                {summary.subtitle && <Text type="secondary" style={{ fontSize: 11 }}>{summary.subtitle}</Text>}
                {!summary.name && !summary.subtitle && summary.idLabel && (
                  <Text style={{ fontSize: 12 }}>{summary.idLabel}</Text>
                )}
              </>
          )}
        </div>
        
        <Button
          type="text"
          size="small"
          icon={<InfoCircleOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            onShowDetail();
          }}
        />
      </div>
    </Card>
  );
};

export default function AuditLogsPage() {
  const { can, isLoading: permissionsLoading } = useMyPermissions();

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
  // ⚠️ FIX BUG THẬT (rà soát permission): trước đây hardcode
  // `role==='admin'||'assistant'` với lý do "seed mặc định audit.manage chỉ
  // cấp cho 2 role này, không phân biệt gì thêm". Nhưng đây CHÍNH LÀ module
  // Admin có thể đổi qua trang Phân quyền - nếu Admin thu hồi `audit.manage`
  // của assistant (chỉ giữ `audit.view`), assistant vẫn thấy nút xoá/dọn dẹp
  // do hardcode không biết, bấm vào sẽ dính 403 (đúng lỗi cần tránh). Đổi
  // sang permission ĐỘNG, tách đúng 2 quyền theo BE (`audit.view` khác
  // `audit.manage` - xem audit.controller.ts).
  const canManageAudit = can('audit.manage');

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
  // ⚠️ Tách từ 1 ô "Tìm tên người thực hiện/khách hàng" (search mờ, OR cả 2)
  // thành 2 filter riêng biệt theo yêu cầu người dùng: `filterUserId` lọc
  // CHÍNH XÁC người thực hiện qua dropdown (chọn từ danh sách User thật,
  // không gõ tay), `filterCustomerSearch` tìm theo tên khách hàng (vẫn gõ
  // tay vì khách hàng không có sẵn dropdown ở trang này).
  const [filterUserId, setFilterUserId] = useState<number | undefined>();
  const [filterCustomerSearch, setFilterCustomerSearch] = useState('');
  const [filterAction, setFilterAction] = useState<string | undefined>();
  const [filterEntityType, setFilterEntityType] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  // Cascader value là 1 mảng path [group, action] - suy ra từ `filterAction`
  // (state canonical vẫn chỉ lưu action lá, dùng chung với `fetchLogs`/query params).
  const actionCascaderValue = useMemo(() => {
    if (!filterAction) return undefined;
    const group = ACTION_META[filterAction]?.group ?? UNKNOWN_ACTION_GROUP_VALUE;
    return [group, filterAction];
  }, [filterAction]);

  // Action BE có thật nhưng FE chưa kịp gắn nhãn - gộp thêm 1 nhóm "Khác"
  // vào cuối danh sách Cascader, không để biến mất khỏi bộ lọc.
  const actionCascaderOptions = useMemo(() => {
    const unknownActions = availableActions.filter((a) => a !== 'USER_LOGIN' && !ACTION_META[a]);
    if (!unknownActions.length) return BASE_ACTION_CASCADER_OPTIONS;
    return [
      ...BASE_ACTION_CASCADER_OPTIONS,
      {
        value: UNKNOWN_ACTION_GROUP_VALUE,
        label: 'Khác (chưa có nhãn)',
        children: unknownActions.map((a) => ({ value: a, label: a })),
      },
    ];
  }, [availableActions]);

  // ⚠️ Tab "Đăng nhập" tách riêng (yêu cầu người dùng: log đăng nhập gây
  // nhiễu tab chính, không filter/xử lý được gì thêm ở đó). State/pagination
  // độc lập hoàn toàn với tab "Danh sách nhật ký" - 2 request khác nhau, 2
  // trang khác nhau, không dùng chung `page`/`pageSize`/`logs` ở trên.
  const [loginLogs, setLoginLogs] = useState<AuditLog[]>([]);
  const [loginTotal, setLoginTotal] = useState(0);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginPage, setLoginPage] = useState(1);
  const [loginPageSize, setLoginPageSize] = useState(20);
  // ⚠️ Đổi từ Input gõ tên -> dropdown chọn User (đồng bộ cách làm với tab
  // chính) - lọc CHÍNH XÁC qua `userId`, không còn phụ thuộc field `search`
  // cũ (đã bỏ, xem `customerSearch` mới chỉ dành cho tên khách hàng).
  const [loginUserId, setLoginUserId] = useState<number | undefined>();
  const [loginDateRange, setLoginDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [loginTabLoaded, setLoginTabLoaded] = useState(false);

  // ── Effects ────────────────────────────────────────────────────────────
  useEffect(() => {
    // Khớp PERMISSIONS.md §2.7: CHỈ admin/assistant - Manager 403 tuyệt đối
    // (không có ngoại lệ theo phòng ban cho module này, khác Customer/Users/
    // ZK Device). Trước đây gate này cho Manager vào - SAI, đã sửa.
    if (!permissionsLoading && user && !can('audit.view')) {
      message.warning('Bạn không có quyền truy cập trang này');
      router.replace('/customers');
    }
  }, [user, router, message]);

  useEffect(() => {
    auditApi.getActions().then(setAvailableActions).catch(() => {});
    if (canManageAudit) {
      auditApi.getSettings().then(setSettings).catch(() => {});
    }
  }, [canManageAudit]);

  const fetchLogs = useCallback(async (pg = page, ps = pageSize) => {
    setLoading(true);
    try {
      const filters: AuditFilters = {
        page: pg,
        limit: ps,
        userId: filterUserId,
        customerSearch: filterCustomerSearch || undefined,
        action: filterAction,
        entityType: filterEntityType,
        // Tab chính luôn ẩn log đăng nhập - xem riêng ở tab "Đăng nhập".
        excludeEntityType: 'auth',
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
  }, [page, pageSize, filterUserId, filterCustomerSearch, filterAction, filterEntityType, dateRange, message]);

  const fetchLoginLogs = useCallback(async (pg = loginPage, ps = loginPageSize) => {
    setLoginLoading(true);
    try {
      const filters: AuditFilters = {
        page: pg,
        limit: ps,
        userId: loginUserId,
        entityType: 'auth',
        fromDate: loginDateRange?.[0]?.startOf('day').toISOString(),
        toDate: loginDateRange?.[1]?.endOf('day').toISOString(),
      };
      const res = await auditApi.getLogs(filters);
      if (res && res.data) {
        setLoginLogs(res.data);
        setLoginTotal(res.total || 0);
      } else {
        setLoginLogs([]);
        setLoginTotal(0);
      }
    } catch (error) {
      console.error('Fetch login logs error:', error);
      message.error('Không thể tải nhật ký đăng nhập');
      setLoginLogs([]);
    } finally {
      setLoginLoading(false);
    }
  }, [loginPage, loginPageSize, loginUserId, loginDateRange, message]);

  useEffect(() => {
    // ⚠️ FIX BUG THẬT (rà soát UI Permission): trước đây check cứng
    // ['admin','manager'] - lệch với chính đoạn code fix ngay phía trên
    // (dòng 187, đã đổi đúng sang `can('audit.view')`, Manager PHẢI bị chặn
    // theo PERMISSIONS.md §2.7). Hậu quả thực tế của bug cũ: nếu Admin cấp
    // audit.view cho Assistant/role tuỳ chỉnh, trang qua được redirect-gate
    // nhưng KHÔNG BAO GIỜ fetch được log (điều kiện ở đây vẫn false mãi) -
    // trang trống vĩnh viễn dù có quyền. Dùng lại đúng 1 nguồn permission
    // duy nhất cho cả 2 chỗ.
    if (user && can('audit.view')) {
      fetchLogs(page, pageSize);
    }
  }, [page, pageSize, fetchLogs, user]);

  // Tab "Đăng nhập" chỉ fetch LẦN ĐẦU khi người dùng thực sự mở tab đó (lazy)
  // - tránh gọi thêm 1 API không cần thiết mỗi lần trang audit-logs mount,
  // vì phần lớn người dùng chỉ xem tab chính.
  useEffect(() => {
    if (loginTabLoaded && user && can('audit.view')) {
      fetchLoginLogs(loginPage, loginPageSize);
    }
  }, [loginPage, loginPageSize, loginTabLoaded, fetchLoginLogs, user]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleSearch = () => { setPage(1); fetchLogs(1, pageSize); };
  const handleReset = () => {
    setFilterUserId(undefined); setFilterCustomerSearch('');
    setFilterAction(undefined); setFilterEntityType(undefined);
    setDateRange(null); setPage(1);
    setTimeout(() => fetchLogs(1, pageSize), 0);
  };

  const handleLoginSearch = () => { setLoginPage(1); fetchLoginLogs(1, loginPageSize); };
  const handleLoginReset = () => {
    setLoginUserId(undefined); setLoginDateRange(null); setLoginPage(1);
    setTimeout(() => fetchLoginLogs(1, loginPageSize), 0);
  };
  const handleTabChange = (key: string) => {
    if (key === '2' && !loginTabLoaded) {
      setLoginTabLoaded(true);
    }
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
        const meta = getActionMeta(record.action);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: 'Đối tượng',
      key: 'entity',
      width: 220,
      render: (_, record) => {
        const isCustomer = record.entityType === 'customer';
        const customer = record.targetCustomer;
        // Ngoài customer (có API trả kèm tên thật), mọi entityType khác
        // (link_group, media_source, storage_media, role UI-visibility...)
        // suy ra tên/ngữ cảnh từ oldData/newData qua `getEntitySummary` -
        // trước đây chỉ hiện "#id" trơ, giờ hiện đúng tên đối tượng.
        const summary = getEntitySummary(record);

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
            ) : record.entityType === 'auth' ? null : (
              <>
                <Text style={{ fontSize: 13, fontWeight: 500 }}>
                  {summary.name || summary.idLabel || <Text type="secondary" italic>(Không xác định)</Text>}
                </Text>
                {summary.subtitle && (
                  <Text type="secondary" style={{ fontSize: 11 }}>{summary.subtitle}</Text>
                )}
                {summary.name && summary.idLabel && (
                  <Text type="secondary" style={{ fontSize: 11 }}>{summary.idLabel}</Text>
                )}
              </>
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

  const rowSelection = canManageAudit ? {
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
            {canManageAudit && (
              <>
                <Button 
                  danger 
                  icon={<ClearOutlined />} 
                  onClick={handleCleanupRange}
                >
                  Dọn dẹp theo thời gian
                </Button>
                {selectedRowKeys.length > 0 && !isMobile && (
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

      <Tabs defaultActiveKey="1" onChange={handleTabChange} items={[
        {
          key: '1',
          label: <span><FileTextOutlined /> Danh sách nhật ký</span>,
          children: (
            <>
              {/* Filters */}
              <Card variant="outlined" style={{ marginBottom: 16, borderRadius: 8 }}>
                <Row gutter={[12, 12]} align="middle">
                  {/* ⚠️ Tách từ 1 ô "Tìm tên người thực hiện/khách hàng" thành 2 ô riêng
                      theo yêu cầu người dùng: người thực hiện lọc CHÍNH XÁC qua dropdown
                      chọn User (tái dùng SalesUserSelect - đã có sẵn showSearch theo
                      tên/email + avatar/role tag), khách hàng vẫn gõ tay tìm theo tên. */}
                  <Col xs={24} md={5}>
                    <SalesUserSelect
                      value={filterUserId}
                      onChange={(userId) => setFilterUserId(userId ?? undefined)}
                      placeholder="Người thực hiện..."
                      hidePreviewCard
                    />
                  </Col>
                  <Col xs={24} md={5}>
                    <Input placeholder="Tìm tên khách hàng..." prefix={<SearchOutlined />}
                      value={filterCustomerSearch} onChange={e => setFilterCustomerSearch(e.target.value)} onPressEnter={handleSearch} allowClear />
                  </Col>
                  <Col xs={24} md={5}>
                    {/* Cascader 2 cấp (Nhóm -> Hành động) thay Select phẳng cũ - yêu
                        cầu người dùng: "dropdown khá dài, cần filter dễ tìm hơn".
                        `showSearch` khớp trên cả nhãn nhóm lẫn nhãn action, gõ
                        "chấm công" hay gõ đúng tên action đều ra kết quả ngay,
                        không cần cuộn qua hết ~94 dòng. */}
                    <Cascader
                      placeholder="Loại hành động"
                      value={actionCascaderValue}
                      onChange={(value) => setFilterAction(value ? (value[value.length - 1] as string) : undefined)}
                      options={actionCascaderOptions}
                      allowClear
                      showSearch={{
                        filter: (inputValue, path) =>
                          path.some((option) => String(option.label ?? '').toLowerCase().includes(inputValue.toLowerCase())),
                      }}
                      displayRender={(labels) => labels[labels.length - 1]}
                      style={{ width: '100%' }}
                      expandTrigger="hover"
                    />
                  </Col>
                  <Col xs={24} md={4}>
                    <Select placeholder="Đối tượng" value={filterEntityType} onChange={setFilterEntityType} allowClear style={{ width: '100%' }}
                      options={Object.entries(ENTITY_TYPE_LABELS).map(([k, v]) => ({ label: v, value: k }))} />
                  </Col>
                  <Col xs={24} md={3}>
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

              {/* ⚠️ MỚI (yêu cầu người dùng: "gom thành 1 ant-collapse-item tính
                  bằng tuần, vẫn có phân trang") - thay Table/list phẳng bằng
                  `WeeklyCollapseSection`: gom TRANG hiện tại (đã phân trang từ
                  server, không đổi logic fetch) thành các Collapse item theo
                  tuần của `createdAt`; phân trang thật vẫn render y hệt cũ ở
                  dưới Collapse (page/pageSize không đổi state/API). */}
              {isMobile ? (
                <div style={{ padding: '0 4px' }}>
                  <WeeklyCollapseSection<AuditLog>
                    records={logs}
                    getDate={(r) => r.createdAt}
                    rowKey="id"
                    columns={columns}
                    isMobile
                    loading={loading}
                    emptyText="Chưa có nhật ký ghi nhận"
                    renderMobileCard={(record) => (
                      <AuditLogMobileCard
                        key={record.id}
                        record={record}
                        onShowDetail={() => { setSelectedLog(record); setDrawerOpen(true); }}
                      />
                    )}
                    pagination={{
                      current: page, pageSize, total,
                      onChange: (p, ps) => { setPage(p); setPageSize(ps || pageSize); },
                    }}
                  />
                </div>
              ) : (
                <Card variant="outlined" style={{ borderRadius: 8 }}>
                    <WeeklyCollapseSection<AuditLog>
                      records={logs}
                      getDate={(r) => r.createdAt}
                      rowKey="id"
                      columns={columns}
                    loading={loading}
                    size="middle"
                    rowSelection={rowSelection}
                      emptyText="Chưa có nhật ký ghi nhận"
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
              )}
            </>
          )
        },
        {
          key: '2',
          label: <span><UserOutlined /> Đăng nhập</span>,
          children: (
            <>
              {/* Filters - ít field hơn tab chính (không cần Loại hành động/Đối tượng vì luôn là "Đăng nhập") */}
              <Card variant="outlined" style={{ marginBottom: 16, borderRadius: 8 }}>
                <Row gutter={[12, 12]} align="middle">
                  <Col xs={24} md={8}>
                    {/* Đổi từ Input gõ tên -> dropdown chọn User, đồng bộ cách làm với
                        tab chính (lọc chính xác qua userId thay vì gõ tay). */}
                    <SalesUserSelect
                      value={loginUserId}
                      onChange={(userId) => setLoginUserId(userId ?? undefined)}
                      placeholder="Người đăng nhập..."
                      hidePreviewCard
                    />
                  </Col>
                  <Col xs={24} md={8}>
                    <RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" value={loginDateRange} onChange={v => setLoginDateRange(v as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)} />
                  </Col>
                  <Col xs={24} md={4}>
                    <Space>
                      <Button type="primary" onClick={handleLoginSearch}>Lọc</Button>
                      <Button icon={<ReloadOutlined />} onClick={handleLoginReset} />
                    </Space>
                  </Col>
                </Row>
              </Card>

              {/* ⚠️ MỚI - đồng bộ gom theo tuần với tab "Danh sách nhật ký" ở
                  trên (`WeeklyCollapseSection`), phân trang thật giữ nguyên. */}
              {isMobile ? (
                <div style={{ padding: '0 4px' }}>
                  <WeeklyCollapseSection<AuditLog>
                    records={loginLogs}
                    getDate={(r) => r.createdAt}
                    rowKey="id"
                    columns={columns.filter(c => c.key !== 'entity')}
                    isMobile
                    loading={loginLoading}
                    emptyText="Chưa có lượt đăng nhập nào"
                    renderMobileCard={(record) => (
                      <AuditLogMobileCard
                        key={record.id}
                        record={record}
                        onShowDetail={() => { setSelectedLog(record); setDrawerOpen(true); }}
                      />
                    )}
                    pagination={{
                      current: loginPage, pageSize: loginPageSize, total: loginTotal,
                      onChange: (p, ps) => { setLoginPage(p); setLoginPageSize(ps || loginPageSize); },
                    }}
                  />
                </div>
              ) : (
                <Card variant="outlined" style={{ borderRadius: 8 }}>
                    <WeeklyCollapseSection<AuditLog>
                      records={loginLogs}
                      getDate={(r) => r.createdAt}
                      rowKey="id"
                      columns={columns.filter(c => c.key !== 'entity')}
                    loading={loginLoading}
                    size="middle"
                      emptyText="Chưa có lượt đăng nhập nào"
                    pagination={{
                      current: loginPage, pageSize: loginPageSize, total: loginTotal, showSizeChanger: true,
                      pageSizeOptions: ['20', '50', '100'],
                      showTotal: (t) => `Tổng cộng ${t.toLocaleString()} lượt đăng nhập`,
                      onChange: (p, ps) => { setLoginPage(p); setLoginPageSize(ps); },
                    }}
                  />
                </Card>
              )}
            </>
          )
        },
        ...(canManageAudit ? [{
          key: '3',
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
        destroyOnHidden
      >
        {selectedLog && (
          <div style={{ padding: 16 }}>
            <Title level={5}>Ngữ cảnh</Title>
            <Card size="small" style={{ marginBottom: 24, background: '#f5f5f5' }}>
              <Space orientation={"vertical" as any} style={{ width: '100%' }}>
                {selectedLog.targetCustomer && (
                  <Text><b>Khách hàng:</b> {selectedLog.targetCustomer.name} (ID: #{selectedLog.targetCustomer.id})</Text>
                )}
                <Text><b>Hành động:</b> {getActionMeta(selectedLog.action).label}</Text>
                {(() => {
                  const s = getEntitySummary(selectedLog);
                  if (selectedLog.entityType === 'customer' || selectedLog.entityType === 'auth') return null;
                  return (
                    <Text>
                      <b>Đối tượng:</b> {ENTITY_TYPE_LABELS[selectedLog.entityType] || selectedLog.entityType}
                      {s.name ? ` — ${s.name}` : ''}
                      {s.subtitle ? ` (${s.subtitle})` : ''}
                      {s.idLabel ? ` ${s.idLabel}` : ''}
                    </Text>
                  );
                })()}
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