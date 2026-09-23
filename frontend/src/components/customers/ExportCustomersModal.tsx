'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Button, App, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { CustomerFilters } from './CustomerFilters';
import { customersExportApi } from '@/lib/api/customers-export.api';

const { Text } = Typography;

interface FilterUserOption {
  id: number;
  name: string;
  role?: string;
  department?: { name: string; color?: string } | null;
  position?: { name: string; color?: string } | null;
}

export interface ExportFilterState {
  search?: string;
  source?: string;
  status?: string;
  salesUserId?: number;
  marketingUserId?: number;
  creatorId?: number;
  dateFrom?: string;
  dateTo?: string;
  joinedGroups?: 'joined' | 'not_joined';
}

interface ExportCustomersModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Bộ filter ĐANG áp dụng trên bảng chính (trang /customers) tại thời
   * điểm mở Modal - yêu cầu tường minh của chủ dự án: "nếu trước đó
   * customer đã có filter trong page thì sync vào modal luôn, nếu chưa
   * thì không sync" -> Modal chỉ tự điền sẵn khi page ĐANG lọc ít nhất 1
   * tiêu chí, ngược lại mở ra TRỐNG (không tự áp bất kỳ filter mặc định
   * nào), xem `hasActiveFilters()` bên dưới.
   */
  pageFilters: ExportFilterState;
  /**
   * sortField/sortOrder ĐANG áp dụng trên bảng chính - KHÔNG hiển thị
   * trong Modal này (yêu cầu chỉ nói tới "các filter"), nhưng vẫn được
   * gửi kèm khi export để thứ tự dòng trong Excel khớp với thứ tự đang
   * xem trên bảng.
   */
  sortField: string;
  sortOrder: 'ASC' | 'DESC';
  salesUsers: FilterUserOption[];
  marketingUsers: FilterUserOption[];
  creatorUsers: FilterUserOption[];
  hideSalesFilter?: boolean;
  hideMarketingFilter?: boolean;
}

const hasActiveFilters = (f: ExportFilterState): boolean =>
  Object.values(f).some((v) => v !== undefined && v !== null && v !== '');

export const ExportCustomersModal: React.FC<ExportCustomersModalProps> = ({
  open,
  onClose,
  pageFilters,
  sortField,
  sortOrder,
  salesUsers,
  marketingUsers,
  creatorUsers,
  hideSalesFilter,
  hideMarketingFilter,
}) => {
  const { message } = App.useApp();
  const [filters, setFilters] = useState<ExportFilterState>({});
  const [isExporting, setIsExporting] = useState(false);

  // Mỗi lần Modal MỞ LẠI: đồng bộ lại từ đầu theo đúng rule ở JSDoc
  // `pageFilters` - KHÔNG giữ lựa chọn của lần mở Modal trước đó (tránh
  // trường hợp người dùng tưởng Modal đang trống nhưng thực ra vẫn còn sót
  // lựa chọn cũ từ lần xuất trước).
  useEffect(() => {
    if (open) {
      setFilters(hasActiveFilters(pageFilters) ? { ...pageFilters } : {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await customersExportApi.exportCustomers({
        ...filters,
        sortField,
        sortOrder,
      });
      onClose();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể xuất Excel');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal
      title="Xuất Excel danh sách khách hàng"
      open={open}
      onCancel={onClose}
      width={900}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose}>
          Huỷ
        </Button>,
        <Button
          key="export"
          type="primary"
          icon={<DownloadOutlined />}
          loading={isExporting}
          onClick={handleExport}
        >
          Xuất Excel
        </Button>,
      ]}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Chọn bộ lọc áp dụng cho file xuất ra - để trống 1 tiêu chí nghĩa là
        không lọc theo tiêu chí đó (xuất toàn bộ khách hàng bạn được phép
        xem).
      </Text>
      <CustomerFilters
        filters={filters}
        salesUsers={salesUsers}
        marketingUsers={marketingUsers}
        creatorUsers={creatorUsers}
        onFiltersChange={(next) => setFilters(next)}
        hideSalesFilter={hideSalesFilter}
        hideMarketingFilter={hideMarketingFilter}
      />
    </Modal>
  );
};
