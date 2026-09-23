'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Table, Card, Typography, Select, Space, Button, Alert, Tag, Input, Tooltip } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { customersApi } from '@/lib/api/customers.api';
import { Customer } from '@/lib/types/customer.types';
import dayjs from 'dayjs';
import { ReloadOutlined, WarningOutlined, ClearOutlined } from '@ant-design/icons';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useRoleColorMap, useRoleColors } from '@/lib/hooks/useRoleColorMap';
import { useCustomerStatuses } from '@/lib/hooks/useCustomerStatuses';
import { StatusTag } from '@/components/customers/StatusTag';
import { UserMiniCard } from '@/app/(dashboard)/attendance-device/UserMiniCard';

const { Title, Text } = Typography;

// Loại nào là 2 loại cảnh báo TRÙNG LẶP (khác nhóm "thiếu/sai dữ liệu" -
// có UI riêng: Alert cảnh báo + gộp nhóm trực quan trên bảng).
const DUPLICATE_TYPES = ['duplicate_phone', 'duplicate_email'] as const;
type DuplicateType = (typeof DUPLICATE_TYPES)[number];
const isDuplicateType = (t: string): t is DuplicateType =>
  (DUPLICATE_TYPES as readonly string[]).includes(t);

// ⚠️ MỚI (yêu cầu người dùng: "dropdown có đủ các emoji khác nhau") - mỗi
// loại kiểm tra có 1 emoji riêng để phân biệt nhanh bằng mắt ngay trong ô
// Select (kể cả khi đã đóng dropdown), không chỉ 2 loại trùng lặp như trước.
const TYPE_META: Record<string, { emoji: string; label: string }> = {
  future_date: { emoji: '📅', label: 'Ngày nhập lớn hơn hiện tại' },
  missing_phone: { emoji: '📵', label: 'Thiếu số điện thoại' },
  missing_email: { emoji: '📭', label: 'Thiếu email' },
  duplicate_phone: { emoji: '⚠️📞', label: 'Trùng số điện thoại' },
  duplicate_email: { emoji: '⚠️✉️', label: 'Trùng email' },
};
const TYPE_OPTIONS = Object.entries(TYPE_META).map(([value, m]) => ({
  value,
  label: `${m.emoji} ${m.label}`,
}));

// Bảng màu cố định để tô Tag theo nhóm trùng (SĐT/Email giống nhau -> cùng
// màu) - lặp vòng khi hết màu, đủ dùng cho vài chục nhóm/trang (pageSize
// mặc định 20, nhóm trùng thường chỉ 2-3 dòng nên số nhóm/trang không lớn).
const GROUP_COLORS = [
  'magenta', 'volcano', 'gold', 'lime', 'cyan', 'blue', 'purple', 'geekblue',
];

/** Hash chuỗi đơn giản (djb2) -> chọn màu ỔN ĐỊNH cho cùng 1 group key,
 * không đổi màu lung tung giữa các lần render/đổi trang. */
function colorForGroupKey(key: string): string {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 33) ^ key.charCodeAt(i);
  }
  const idx = Math.abs(hash) % GROUP_COLORS.length;
  return GROUP_COLORS[idx];
}

/**
 * ⚠️ FIX BUG THẬT (rà soát permission 2026-09): trước đây trang này KHÔNG
 * check `customers.invalid_report` gì cả dù nav-config đã gate mục sidebar
 * theo đúng permission này từ lâu - gõ thẳng URL vẫn vào được, `fetchData()`
 * gọi API ngay lúc mount -> 403 -> axios interceptor tự bắn toast lỗi, bảng
 * hiện trống trơn không rõ vì sao, không điều hướng đi đâu. Mirror ĐÚNG
 * pattern route-guard đã dùng ở mọi trang khác (vd `quan-ly-status-khach`).
 */
export default function InvalidDataReportPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const { can, isLoading: permissionsLoading } = useMyPermissions();

  // ⚠️ MỚI (yêu cầu người dùng: "áp dụng UserMiniCard cho các table đang
  // dùng tên User") - dùng ĐÚNG nguồn màu/tên Vai trò an toàn về quyền
  // (GET /roles/colors, không đòi `roles.view`) y hệt pattern chia-data/
  // CustomerFilters, KHÔNG gọi thêm GET /roles riêng.
  const { getRoleColor } = useRoleColorMap();
  const { roleColors: allRoles } = useRoleColors();
  const roleNameMap = new Map(allRoles.map((r) => [r.code, r.name]));
  const getRoleName = (code?: string) => (code ? roleNameMap.get(code) || code : '');

  // Dropdown "Trạng thái" lấy động từ /customer-statuses (đúng nguồn thật,
  // không hardcode) - dùng CHUNG với StatusTag để tô đúng màu Admin đã cấu
  // hình ở /quan-ly-status-khach.
  const { statuses: allCustomerStatuses } = useCustomerStatuses();

  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [invalidType, setInvalidType] = useState<string>('future_date');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | undefined>(undefined);
  // Chỉ BE trả field này khi invalidType là 1 trong 2 loại trùng lặp - số
  // GIÁ TRỊ (SĐT/Email) đang bị trùng, KHÁC `pagination.total` là số DÒNG
  // khách hàng (1 giá trị trùng có thể ứng với ≥2 dòng).
  const [duplicateGroupCount, setDuplicateGroupCount] = useState<number | undefined>(undefined);

  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 20,
    total: 0,
  });

  useEffect(() => {
    if (!permissionsLoading && !can('customers.invalid_report')) {
      message.warning('Bạn không có quyền truy cập trang này');
      router.replace('/customers');
    }
  }, [permissionsLoading, router]);

  // ⚠️ MỚI - nhận đủ tham số tường minh (không đọc lại state qua closure
  // mặc định) để mỗi nơi gọi (đổi loại/đổi trạng thái/tìm kiếm/đổi trang)
  // luôn gửi ĐÚNG bộ filter đang có, tránh bug filter "cũ" do closure lỗi
  // thời khi nhiều state đổi liên tiếp trong cùng 1 lượt.
  const fetchData = async (opts: {
    type?: string;
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }) => {
    const type = opts.type ?? invalidType;
    const page = opts.page ?? (pagination.current || 1);
    const limit = opts.limit ?? (pagination.pageSize || 20);
    const s = opts.search !== undefined ? opts.search : search;
    const st = opts.status !== undefined ? opts.status : status;

    setLoading(true);
    try {
      const res = await customersApi.getInvalidDataReport({
        invalidType: type,
        page,
        limit,
        search: s || undefined,
        status: st || undefined,
      });
      setData(res.data);
      setDuplicateGroupCount(res.duplicateGroupCount);
      setPagination({
        current: res.page,
        total: res.total,
        pageSize: res.limit,
      });
    } catch (error) {
      console.error('Failed to fetch invalid data report:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Chưa xác định được quyền, hoặc đã xác định KHÔNG có quyền (đang
    // điều hướng đi ở effect phía trên) -> không tự gọi API, tránh bắn
    // 403/toast vô ích trong lúc chờ redirect áp dụng.
    if (permissionsLoading || !can('customers.invalid_report')) return;
    fetchData({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsLoading]);

  const handleTypeChange = (val: string) => {
    setInvalidType(val);
    fetchData({ type: val, page: 1 });
  };

  const handleStatusChange = (val?: string) => {
    setStatus(val);
    fetchData({ status: val, page: 1 });
  };

  const handleSearch = (val: string) => {
    setSearch(val);
    fetchData({ search: val, page: 1 });
  };

  const handleResetFilters = () => {
    setSearch('');
    setStatus(undefined);
    fetchData({ search: '', status: undefined, page: 1 });
  };

  const handleTableChange = (newPagination: TablePaginationConfig) => {
    fetchData({ page: newPagination.current, limit: newPagination.pageSize });
  };

  const isDuplicateView = isDuplicateType(invalidType);

  // ⚠️ MỚI (gộp nhóm trực quan): BE (`getDuplicateContactReport`) đã sắp
  // các dòng cùng `duplicateGroupKey` đứng LIỀN NHAU trong mỗi trang (order
  // theo dup_key trước, ngày nhập chỉ là tiêu chí phụ) - nên chỉ cần nhìn
  // vào `data` của TRANG HIỆN TẠI là đủ để: (1) merge ô SĐT/Email của cả
  // nhóm thành 1 ô (rowSpan) thay vì lặp lại từng dòng, (2) tô nền xen kẽ +
  // viền phân cách giữa 2 nhóm liền kề (xem `.dup-group-*` ở globals.css) -
  // "trùng nhau thì thành 1 group" bất kể ngày nhập/trạng thái khác nhau.
  const groupKeyAt = (index: number) => data[index]?.duplicateGroupKey ?? '';

  const getGroupRowSpan = (index: number) => {
    if (index > 0 && groupKeyAt(index) === groupKeyAt(index - 1)) return 0; // gộp vào dòng trước
    let span = 1;
    for (let i = index + 1; i < data.length; i++) {
      if (groupKeyAt(i) === groupKeyAt(index)) span++;
      else break;
    }
    return span;
  };

  const rowClassName = (record: Customer, index: number) => {
    if (!isDuplicateView) return '';
    // Đếm số lần group key đổi từ đầu bảng tới dòng này -> tô nền xen kẽ
    // theo NHÓM (không phải theo dòng lẻ) để cả nhóm cùng 1 màu nền.
    let parity = 0;
    for (let i = 1; i <= index; i++) {
      if (groupKeyAt(i) !== groupKeyAt(i - 1)) parity = parity === 0 ? 1 : 0;
    }
    const classes = [parity === 1 ? 'dup-group-odd' : 'dup-group-even'];
    if (index > 0 && groupKeyAt(index) !== groupKeyAt(index - 1)) classes.push('dup-group-start');
    return classes.join(' ');
  };

  // Cột đầu chung cho mọi loại report (không đổi theo type).
  const nameColumn: ColumnsType<Customer>[number] = {
    title: 'Khách hàng',
    dataIndex: 'name',
    key: 'name',
    render: (text, record) => (
      <Space orientation="vertical" size={0}>
        <Text strong>{text || 'Không có tên'}</Text>
        {/* Ở view trùng Email, email chính là cột nhóm bên dưới rồi -
           tránh lặp lại 2 lần, chỉ hiện email phụ khi đang xem trùng SĐT. */}
        {invalidType !== 'duplicate_email' && (
          <Text type="secondary" className="text-xs">{record.email}</Text>
        )}
      </Space>
    ),
  };

  // Cột "Số điện thoại"/"Email" - ở 2 view trùng lặp: tô Tag màu theo nhóm
  // (`duplicateGroupKey` BE trả kèm) VÀ merge (rowSpan) thành 1 ô chung cho
  // cả nhóm - để mắt thường thấy ngay đây là 1 khối đang trùng nhau, kể cả
  // khi không đứng liền kề trên UI trước đây.
  const contactDataIndex = invalidType === 'duplicate_email' ? 'email' : 'phone';
  const contactColumn: ColumnsType<Customer>[number] = {
    title: invalidType === 'duplicate_email'
      ? 'Email (trùng lặp)'
      : (isDuplicateView ? 'Số điện thoại (trùng lặp)' : 'Số điện thoại'),
    dataIndex: contactDataIndex,
    key: contactDataIndex,
    render: (val: string, record, index) => {
      if (!isDuplicateView) return val || '-';
      const tag = <Tag color={colorForGroupKey(record.duplicateGroupKey || val || '')}>{val || '-'}</Tag>;
      return { children: tag, props: { rowSpan: getGroupRowSpan(index) } };
    },
  };

  // ⚠️ MỚI (yêu cầu người dùng, hoàn thiện việc còn treo từ lượt trước) -
  // cột "Trùng với ai": BE đã trả sẵn `duplicatePeers` (id + tên các khách
  // khác đang trùng cùng SĐT/Email, đã loại trừ chính dòng này) - bấm vào
  // tên để đi thẳng `/customers?id=` (trang Khách hàng tự mở đúng modal chi
  // tiết khách đó, đã có sẵn logic đọc query `id`).
  const peersColumn: ColumnsType<Customer>[number] = {
    title: 'Trùng với ai',
    key: 'duplicatePeers',
    render: (_, record) => {
      const peers = record.duplicatePeers || [];
      if (peers.length === 0) return <Text type="secondary">-</Text>;
      const shown = peers.slice(0, 2);
      const rest = peers.slice(2);
      return (
        <Space size={4} wrap>
          {shown.map((p) => (
            <Tag
              key={p.id}
              color="processing"
              style={{ cursor: 'pointer' }}
              onClick={() => router.push(`/customers?id=${p.id}`)}
            >
              {p.name || `#${p.id}`}
            </Tag>
          ))}
          {rest.length > 0 && (
            <Tooltip title={rest.map((p) => p.name).join(', ')}>
              <Tag style={{ cursor: 'default' }}>+{rest.length}</Tag>
            </Tooltip>
          )}
        </Space>
      );
    },
  };

  const columns: ColumnsType<Customer> = [
    nameColumn,
    contactColumn,
    ...(isDuplicateView ? [peersColumn] : []),
    {
      title: 'Ngày nhập data',
      dataIndex: 'inputDate',
      key: 'inputDate',
      render: (val) => val ? dayjs(val).format('DD/MM/YYYY') : '-',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => <StatusTag code={val} fallback={<Text type="secondary">-</Text>} />,
    },
    {
      // ⚠️ MỚI - dùng CHUNG <UserMiniCard> (Avatar tô màu theo Vai trò + tên)
      // thay vì text trơn, ĐÚNG pattern cột "Người tạo" ở /chia-data.
      title: 'Sales',
      key: 'salesUser',
      render: (_, record) =>
        record.salesUser ? (
          <UserMiniCard
            name={record.salesUser.name}
            role={record.salesUser.role}
            getRoleColor={getRoleColor}
            getRoleName={getRoleName}
            hideRoleTag
            nameFontSize={12}
          />
        ) : (
          <Text type="secondary">Chưa gán</Text>
        ),
    },
    {
      title: 'Người tạo',
      key: 'createdBy',
      render: (_, record) =>
        record.createdBy ? (
          <UserMiniCard
            name={record.createdBy.name}
            role={record.createdBy.role}
            getRoleColor={getRoleColor}
            getRoleName={getRoleName}
            hideRoleTag
            nameFontSize={12}
          />
        ) : (
          <Text type="secondary">Hệ thống</Text>
        ),
    },
  ];

  // Số dòng thật sự đang có mặt trong data (khác `duplicateGroupCount` -
  // là số GIÁ TRỊ trùng, không phải số khách hàng) - dùng cho nội dung Alert.
  const affectedCustomerCount = pagination.total || 0;

  const duplicateLabel = invalidType === 'duplicate_email' ? 'Email' : 'Số điện thoại';
  const activeMeta = TYPE_META[invalidType];
  const hasActiveFilters = !!search || !!status;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Title level={4} style={{ margin: 0 }}>Báo cáo dữ liệu không hợp lệ</Title>
          <Text type="secondary">Danh sách khách hàng có dữ liệu lỗi, thiếu sót, không hợp lệ hoặc bị trùng lặp</Text>
        </div>
      </div>

      <Card
        title={
          <Space size={8}>
            <span style={{ fontSize: 16 }}>{activeMeta?.emoji}</span>
            <span>{activeMeta?.label}</span>
          </Space>
        }
        extra={
          <Space size={8} wrap>
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>{affectedCustomerCount} khách hàng</Tag>
            {isDuplicateView && duplicateGroupCount !== undefined && (
              <Tag color="orange" style={{ marginInlineEnd: 0 }}>{duplicateGroupCount} nhóm trùng</Tag>
            )}
          </Space>
        }
      >
        <Space className="mb-4" size="middle" wrap align="end">
          <div>
            <div className="mb-1"><Text strong>Loại kiểm tra</Text></div>
            <Select
              value={invalidType}
              onChange={handleTypeChange}
              style={{ width: 260 }}
              options={TYPE_OPTIONS}
            />
          </div>
          <div>
            <div className="mb-1"><Text strong>Trạng thái</Text></div>
            <Select
              value={status}
              onChange={handleStatusChange}
              allowClear
              placeholder="Tất cả trạng thái"
              style={{ width: 200 }}
              options={allCustomerStatuses.map((s) => ({ value: s.code, label: s.name }))}
            />
          </div>
          <div>
            <div className="mb-1"><Text strong>Tìm kiếm</Text></div>
            <Input.Search
              defaultValue={search}
              allowClear
              placeholder="Tên, SĐT, Email..."
              style={{ width: 240 }}
              onSearch={handleSearch}
            />
          </div>
          <Space>
            {hasActiveFilters && (
              <Button icon={<ClearOutlined />} onClick={handleResetFilters}>
                Xóa bộ lọc
              </Button>
            )}
            <Button
              icon={<ReloadOutlined />}
              onClick={() => fetchData({})}
            >
              Làm mới
            </Button>
          </Space>
        </Space>

        {/* Banner cảnh báo riêng cho 2 loại trùng lặp - chỉ hiện sau khi đã
           fetch xong lần đầu cho loại đang chọn (tránh nháy "Không phát
           hiện" rồi đổi ngay sang có dữ liệu khi loading). Không tính
           trùng Tên - đúng yêu cầu người dùng, vì tên trùng (VD 2 khách
           tên "Ken") là chuyện bình thường, không phải dấu hiệu data lỗi.
           ⚠️ FIX BUG THẬT (phát hiện qua ảnh chụp màn hình): `<Alert>` của
           antd không có prop `title` - phần tiêu đề/mô tả không hề hiển
           thị dù component vẫn render (chỉ thấy khung vàng trống). Prop
           đúng là `message` (tiêu đề) + `description` (mô tả). */}
        {isDuplicateView && !loading && (
          duplicateGroupCount ? (
            <Alert
              className="mb-4"
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              title={`Phát hiện ${duplicateGroupCount} ${duplicateLabel.toLowerCase()} bị trùng`}
              description={`Tổng cộng ${affectedCustomerCount} khách hàng liên quan đến ${duplicateGroupCount} ${duplicateLabel.toLowerCase()} bị lặp lại — các dòng cùng màu Tag ở cột "${duplicateLabel}" bên dưới đã được gộp thành 1 nhóm. Hệ thống KHÔNG chặn việc nhập trùng SĐT/Email (để không cản trở nghiệp vụ khi nhiều Sales/phòng ban cùng làm việc) — nguyên nhân phổ biến nhất là Nhân viên chỉ thấy được data của mình (phân quyền OWN) nên vô tình nhập lại khách đã có người khác thêm trước đó. Cần rà soát thủ công (gộp/xoá bớt, hoặc gán chung 1 khách cho đúng Sales phụ trách) để tránh 2 Sales cùng chăm 1 khách mà không biết.`}
            />
          ) : (
            <Alert
              className="mb-4"
              type="success"
              showIcon
                title={`Không phát hiện ${duplicateLabel.toLowerCase()} nào bị trùng${hasActiveFilters ? ' (trong phạm vi bộ lọc đang chọn)' : ''}`}
            />
          )
        )}

        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          pagination={pagination}
          loading={loading}
          onChange={handleTableChange}
          rowClassName={rowClassName}
          scroll={{ x: isDuplicateView ? 1100 : 900 }}
        />
      </Card>
    </div>
  );
}