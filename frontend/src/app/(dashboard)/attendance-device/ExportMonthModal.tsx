'use client';

import { Modal, Typography, Space } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import { Dayjs } from 'dayjs';

const { Text } = Typography;

interface ExportMonthModalProps {
  open: boolean;
  loading?: boolean;
  month: Dayjs;
  employeeCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Modal xác nhận trước khi xuất Excel "Tổng hợp chấm công" - cùng tinh thần
 * với `ExportPeriodModal.tsx` (dùng ở tab Logs/Bảng chấm công): KHÔNG xuất
 * ngay khi bấm nút, luôn phải qua 1 bước xác nhận rõ ràng.
 *
 * ⚠️ KHÁC với `ExportPeriodModal` ở chỗ: bảng tổng hợp tháng là dữ liệu ĐÃ
 * TÍNH SẴN Ở FE cho đúng 1 tháng đang hiển thị trên bảng (`buildExportRows()`
 * gửi thẳng payload đã tính - `days`/`actualWorkDays`/`lateEntries`... -
 * KHÔNG phải yêu cầu BE query lại 1 khoảng ngày mới như 2 tab kia). Vì vậy
 * modal này CHỦ Ý KHÔNG cho chọn tháng khác (không có DatePicker/RangePicker)
 * - chọn tháng khác ở đây mà không đổi bộ lọc + đợi bảng tải lại sẽ xuất SAI
 * dữ liệu (vẫn xuất dữ liệu của tháng đang hiển thị, không phải tháng vừa
 * chọn trong modal). Muốn xuất tháng khác: đóng modal, đổi DatePicker tháng
 * ở trên, đợi bảng tải xong, rồi bấm lại "Xuất Excel".
 */
export default function ExportMonthModal({
  open,
  loading,
  month,
  employeeCount,
  onCancel,
  onConfirm,
}: ExportMonthModalProps) {
  return (
    <Modal
      title={
        <Space>
          <FileExcelOutlined style={{ color: '#1D6F42' }} />
          Xác nhận xuất Excel
        </Space>
      }
      open={open}
      onCancel={onCancel}
      onOk={onConfirm}
      okText="Xuất Excel"
      cancelText="Huỷ"
      confirmLoading={loading}
    >
      <Space orientation="vertical" size="small">
        <Text>
          Xuất bảng tổng hợp chấm công tháng <Text strong>{month.format('MM/YYYY')}</Text>{' '}
          ({employeeCount} nhân viên) - đúng như đang hiển thị trên bảng.
        </Text>
        <Text type="secondary">
          Muốn xuất tháng khác? Đóng modal này, đổi bộ lọc tháng ở trên, đợi bảng tải lại rồi bấm
          &quot;Xuất Excel&quot; lần nữa.
        </Text>
      </Space>
    </Modal>
  );
}
