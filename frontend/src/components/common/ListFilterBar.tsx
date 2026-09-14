'use client';

import { ReactNode } from 'react';
import { Row, Col, Input, Select } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

/**
 * ListFilterBar
 * -----------------------------------------------------------------
 * Thanh Search + Filter dùng chung cho các trang "danh mục quản trị"
 * (vi-tri, quan-ly-phu-trach, quan-ly-loai-phep, quan-ly-status-khach,
 * nguon-media, phong-ban, nhom-lien-ket...). Các trang này đều là danh
 * sách BOUNDED (hook trả toàn bộ, không phân trang) nên lọc CLIENT-SIDE
 * bằng `useMemo` ở page.tsx - component này chỉ render UI + gọi callback,
 * KHÔNG tự chứa state lọc (để page.tsx toàn quyền quyết định logic lọc
 * theo field/shape dữ liệu riêng của từng trang).
 *
 * Khác với `CustomerFilters.tsx` (lọc SERVER-SIDE qua query param, dành
 * riêng cho `/customers` - danh sách lớn, có phân trang thật) - hai
 * component KHÔNG dùng chung được vì khác cơ chế lọc, chỉ giống nhau ở
 * phần UI (Row/Col + Input SearchOutlined + Select allowClear).
 */

export interface ListFilterDropdown<T = string> {
  key: string;
  /** Placeholder hiện khi chưa chọn gì - vd "Trạng thái", "Phòng ban" */
  placeholder: string;
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  options: { value: T; label: ReactNode }[];
  /** Độ rộng cột ở breakpoint md (thang 24) - mặc định 5 */
  mdSpan?: number;
  /** Độ rộng cột ở breakpoint sm (thang 24) - mặc định 8 */
  smSpan?: number;
}

interface ListFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Độ rộng cột Input ở breakpoint md - mặc định tự tính theo số dropdown */
  searchMdSpan?: number;
  dropdowns?: ListFilterDropdown<any>[];
  style?: React.CSSProperties;
}

export function ListFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Tìm kiếm...',
  searchMdSpan,
  dropdowns = [],
  style,
}: ListFilterBarProps) {
  const defaultSearchSpan = dropdowns.length === 0 ? 24 : dropdowns.length === 1 ? 12 : 8;

  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 16, ...style }}>
      <Col xs={24} sm={dropdowns.length === 0 ? 24 : 12} md={searchMdSpan ?? defaultSearchSpan}>
        <Input
          allowClear
          placeholder={searchPlaceholder}
          prefix={<SearchOutlined />}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </Col>
      {dropdowns.map((d) => (
        <Col xs={12} sm={d.smSpan ?? 8} md={d.mdSpan ?? 5} key={d.key}>
          <Select
            allowClear
            placeholder={d.placeholder}
            style={{ width: '100%' }}
            value={d.value}
            onChange={(v) => d.onChange(v ?? undefined)}
            options={d.options}
          />
        </Col>
      ))}
    </Row>
  );
}
