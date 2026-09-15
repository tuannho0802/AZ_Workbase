'use client';

import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

interface ReportNameFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Ô tìm nhanh theo tên (nhân viên/phòng ban) - lọc CLIENT-SIDE trên dữ liệu
 * đã tải (không gọi lại API) vì mỗi kỳ báo cáo chỉ có tối đa vài chục
 * dòng/breakdown, filter tại chỗ là đủ nhanh và tránh round-trip không cần
 * thiết. Dùng CHUNG cho cả 3 tab báo cáo (Doanh thu/Doanh số khách/Chất
 * lượng data) - đáp ứng yêu cầu "cần Filter thêm" mà không lặp code.
 */
export default function ReportNameFilter({ value, onChange, placeholder }: ReportNameFilterProps) {
  return (
    <Input
      allowClear
      size="middle"
      style={{ width: 200 }}
      placeholder={placeholder ?? 'Tìm theo tên...'}
      prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
