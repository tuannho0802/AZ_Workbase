'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Table, Card, Typography, Select, Space, Button, Alert, Tag } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { customersApi } from '@/lib/api/customers.api';
import { Customer } from '@/lib/types/customer.types';
import dayjs from 'dayjs';
import { ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';

const { Title, Text } = Typography;

// Loại nào là 2 loại cảnh báo TRÙNG LẶP (khác nhóm "thiếu/sai dữ liệu" -
// có UI riêng: Alert cảnh báo + tô màu theo nhóm trùng).
const DUPLICATE_TYPES = ['duplicate_phone', 'duplicate_email'] as const;
type DuplicateType = (typeof DUPLICATE_TYPES)[number];
const isDuplicateType = (t: string): t is DuplicateType =>
  (DUPLICATE_TYPES as readonly string[]).includes(t);

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

  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [invalidType, setInvalidType] = useState<string>('future_date');
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

  const fetchData = async (type: string, page: number, limit: number) => {
    setLoading(true);
    try {
      const res = await customersApi.getInvalidDataReport({
        invalidType: type,
        page,
        limit,
      });
      setData(res.data);
      setDuplicateGroupCount(res.duplicateGroupCount);
      setPagination({
        ...pagination,
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
    fetchData(invalidType, pagination.current || 1, pagination.pageSize || 20);
  }, [invalidType, permissionsLoading]); // Refetch when type changes

  const handleTableChange = (newPagination: TablePaginationConfig) => {
    fetchData(invalidType, newPagination.current || 1, newPagination.pageSize || 20);
  };

  const isDuplicateView = isDuplicateType(invalidType);

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

  // Cột "Số điện thoại"/"Email" - ở 2 view trùng lặp, tô Tag màu theo
  // nhóm (`duplicateGroupKey` BE trả kèm) để mắt thường ghép được ngay
  // những dòng nào đang trùng nhau, kể cả khi không đứng liền kề trên UI.
  const contactColumn: ColumnsType<Customer>[number] = isDuplicateType(invalidType) && invalidType === 'duplicate_email'
    ? {
      title: 'Email (trùng lặp)',
      dataIndex: 'email',
      key: 'email',
      render: (val: string, record) => (
        <Tag color={colorForGroupKey(record.duplicateGroupKey || val || '')}>{val || '-'}</Tag>
      ),
    }
    : {
      title: isDuplicateView ? 'Số điện thoại (trùng lặp)' : 'Số điện thoại',
      dataIndex: 'phone',
      key: 'phone',
      render: (val: string, record) =>
        isDuplicateView ? (
          <Tag color={colorForGroupKey(record.duplicateGroupKey || val || '')}>{val || '-'}</Tag>
        ) : (
          val || '-'
        ),
    };

  const columns: ColumnsType<Customer> = [
    nameColumn,
    contactColumn,
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
    },
    {
      title: 'Sales',
      dataIndex: 'salesUser',
      key: 'salesUser',
      render: (_, record) => record.salesUser?.name || '-',
    },
    {
      title: 'Người tạo',
      dataIndex: 'createdBy',
      key: 'createdBy',
      render: (_, record) => record.createdBy?.name || '-',
    },
  ];

  // Số dòng thật sự đang có mặt trong data (khác `duplicateGroupCount` -
  // là số GIÁ TRỊ trùng, không phải số khách hàng) - dùng cho nội dung Alert.
  const affectedCustomerCount = pagination.total || 0;

  const duplicateLabel = invalidType === 'duplicate_email' ? 'Email' : 'Số điện thoại';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Title level={4} style={{ margin: 0 }}>Báo cáo dữ liệu không hợp lệ</Title>
          <Text type="secondary">Danh sách khách hàng có dữ liệu lỗi, thiếu sót, không hợp lệ hoặc bị trùng lặp</Text>
        </div>
      </div>

      <Card>
        <Space className="mb-4" size="middle" wrap>
          <Text strong>Loại kiểm tra:</Text>
          <Select
            value={invalidType}
            onChange={(val) => {
              setInvalidType(val);
              setPagination(prev => ({ ...prev, current: 1 }));
            }}
            style={{ width: 260 }}
            options={[
              { value: 'future_date', label: 'Ngày nhập lớn hơn hiện tại' },
              { value: 'missing_phone', label: 'Thiếu số điện thoại' },
              { value: 'missing_email', label: 'Thiếu email' },
              { value: 'duplicate_phone', label: '⚠️ Trùng số điện thoại' },
              { value: 'duplicate_email', label: '⚠️ Trùng email' },
            ]}
          />
          <Button 
            icon={<ReloadOutlined />} 
            onClick={() => fetchData(invalidType, pagination.current || 1, pagination.pageSize || 20)}
          >
            Làm mới
          </Button>
        </Space>

        {/* Banner cảnh báo riêng cho 2 loại trùng lặp - chỉ hiện sau khi đã
           fetch xong lần đầu cho loại đang chọn (tránh nháy "Không phát
           hiện" rồi đổi ngay sang có dữ liệu khi loading). Không tính
           trùng Tên - đúng yêu cầu người dùng, vì tên trùng (VD 2 khách
           tên "Ken") là chuyện bình thường, không phải dấu hiệu data lỗi. */}
        {isDuplicateView && !loading && (
          duplicateGroupCount ? (
            <Alert
              className="mb-4"
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              title={`Phát hiện ${duplicateGroupCount} ${duplicateLabel.toLowerCase()} bị trùng`}
              description={`Tổng cộng ${affectedCustomerCount} khách hàng liên quan đến ${duplicateGroupCount} ${duplicateLabel.toLowerCase()} bị lặp lại — mỗi màu Tag ở cột "${duplicateLabel}" bên dưới là 1 nhóm đang trùng nhau. Hệ thống KHÔNG chặn việc nhập trùng SĐT/Email (để không cản trở nghiệp vụ khi nhiều Sales/phòng ban cùng làm việc) — nguyên nhân phổ biến nhất là Nhân viên chỉ thấy được data của mình (phân quyền OWN) nên vô tình nhập lại khách đã có người khác thêm trước đó. Cần rà soát thủ công (gộp/xoá bớt, hoặc gán chung 1 khách cho đúng Sales phụ trách) để tránh 2 Sales cùng chăm 1 khách mà không biết.`}
            />
          ) : (
            <Alert
              className="mb-4"
              type="success"
              showIcon
                title={`Không phát hiện ${duplicateLabel.toLowerCase()} nào bị trùng`}
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
          scroll={{ x: 900 }}
        />
      </Card>
    </div>
  );
}