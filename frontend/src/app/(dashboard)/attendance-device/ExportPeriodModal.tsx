'use client';

import { useState } from 'react';
import { Modal, DatePicker, Space, Typography } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const RANGE_PRESETS = [
  { label: 'Hôm nay', value: [dayjs(), dayjs()] as [Dayjs, Dayjs] },
  { label: 'Tuần này', value: [dayjs().startOf('week'), dayjs()] as [Dayjs, Dayjs] },
  { label: 'Tháng này', value: [dayjs().startOf('month'), dayjs()] as [Dayjs, Dayjs] },
  {
    label: 'Tháng trước',
    value: [
      dayjs().subtract(1, 'month').startOf('month'),
      dayjs().subtract(1, 'month').endOf('month'),
    ] as [Dayjs, Dayjs],
  },
];

interface ExportPeriodModalProps {
  open: boolean;
  loading?: boolean;
  /** Khoảng ngày điền sẵn khi mở Modal (thường lấy từ filter đang áp dụng trên bảng, cho tiện) - vẫn phải người dùng bấm Xác nhận mới thực sự export. */
  defaultRange?: [Dayjs, Dayjs] | null;
  onCancel: () => void;
  onConfirm: (range: [Dayjs, Dayjs]) => void;
}

/**
 * Modal bắt buộc chọn khoảng thời gian TRƯỚC KHI export Excel - dùng chung
 * cho tab "Logs chấm công" và "Bảng chấm công". Trước đây bấm "Xuất Excel"
 * là gọi API ngay theo filter hiện tại trên bảng (có thể vô tình xuất TOÀN
 * BỘ dữ liệu nếu chưa lọc ngày) - giờ luôn phải xác nhận rõ ràng khoảng
 * ngày ở đây, KHÔNG có lựa chọn "xuất tất cả" nữa (đúng yêu cầu nghiệp vụ
 * đã chốt, đồng thời BE cũng chặn lặp lại - xem attendance-export.controller.ts).
 */
export default function ExportPeriodModal({
  open,
  loading,
  defaultRange,
  onCancel,
  onConfirm,
}: ExportPeriodModalProps) {
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(
    defaultRange ?? [dayjs().startOf('month'), dayjs()],
  );

  return (
    <Modal
      title={
        <Space>
          <FileExcelOutlined style={{ color: '#1D6F42' }} />
          Chọn khoảng thời gian xuất Excel
        </Space>
      }
      open={open}
      onCancel={onCancel}
      okText="Xuất Excel"
      cancelText="Huỷ"
      confirmLoading={loading}
      okButtonProps={{ disabled: !range || !range[0] || !range[1] }}
      onOk={() => {
        if (range && range[0] && range[1]) onConfirm(range);
      }}
      afterOpenChange={(isOpen) => {
        if (isOpen) setRange(defaultRange ?? [dayjs().startOf('month'), dayjs()]);
      }}
    >
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        <Text type="secondary">
          Chỉ dữ liệu trong khoảng ngày chọn bên dưới được xuất ra file - không xuất toàn bộ dữ liệu.
        </Text>
        <RangePicker
          style={{ width: '100%' }}
          value={range}
          presets={RANGE_PRESETS}
          format="DD/MM/YYYY"
          allowClear={false}
          onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
        />
      </Space>
    </Modal>
  );
}
