import React, { useState, useEffect } from 'react';
import { Row, Col, Input, Select, DatePicker, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';

interface CustomerFiltersProps {
  filters: {
    search?: string;
    source?: string;
    status?: string;
    salesUserId?: number;
    dateFrom?: string;
    dateTo?: string;
  };
  salesUsers: { id: number; name: string }[];
  onFiltersChange: (newFilters: any) => void;
}

export const CustomerFilters: React.FC<CustomerFiltersProps> = ({
  filters,
  salesUsers,
  onFiltersChange,
}) => {
  const [fromDate, setFromDate] = useState<Dayjs | null>(filters.dateFrom ? dayjs(filters.dateFrom) : null);
  const [toDate, setToDate] = useState<Dayjs | null>(filters.dateTo ? dayjs(filters.dateTo) : null);
  const [searchText, setSearchText] = useState(filters.search || '');

  // Sync temp dates if filters change externally (e.g. clear all)
  useEffect(() => {
    setFromDate(filters.dateFrom ? dayjs(filters.dateFrom) : null);
    setToDate(filters.dateTo ? dayjs(filters.dateTo) : null);
    setSearchText(filters.search || '');
  }, [filters.dateFrom, filters.dateTo, filters.search]);

  const handleDateChange = (
    type: 'from' | 'to',
    date: Dayjs | null
  ) => {
    console.log(`[DATE FILTER] ${type} changed to:`, date?.format('YYYY-MM-DD') || 'null');

    if (type === 'from') {
      setFromDate(date);
      
      // ✅ CRITICAL: Chỉ gọi API khi:
      // 1. CẢ 2 ngày đều có giá trị (date && toDate)
      // 2. HOẶC user clear "Từ ngày" VÀ "Đến ngày" cũng đã null
      const shouldFetch = 
        (date !== null && toDate !== null) ||  // Case 1: Both dates selected
        (date === null && toDate === null);     // Case 2: Both dates cleared

      console.log(`[DATE FILTER] Should fetch?`, shouldFetch);

      if (shouldFetch) {
        console.log('[DATE FILTER] Triggering API call');
        onFiltersChange({
          ...filters,
          dateFrom: date?.format('YYYY-MM-DD'),
          dateTo: toDate?.format('YYYY-MM-DD'),
          page: 1, // Reset to page 1
        });
      } else {
        console.log('[DATE FILTER] Skipping API call - waiting for "Đến ngày"');
      }
    } else {
      // type === 'to'
      setToDate(date);
      
      const shouldFetch = 
        (fromDate !== null && date !== null) ||
        (fromDate === null && date === null);

      console.log(`[DATE FILTER] Should fetch?`, shouldFetch);

      if (shouldFetch) {
        console.log('[DATE FILTER] Triggering API call');
        onFiltersChange({
          ...filters,
          dateFrom: fromDate?.format('YYYY-MM-DD'),
          dateTo: date?.format('YYYY-MM-DD'),
          page: 1,
        });
      } else {
        console.log('[DATE FILTER] Skipping API call - waiting for "Từ ngày"');
      }
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <label className="block text-sm font-medium mb-1">Tìm kiếm</label>
          <Input
            placeholder="Tìm kiếm theo tên, SĐT, UTM..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => {
              const val = e.target.value;
              setSearchText(val);
              onFiltersChange({ ...filters, search: val, page: 1 });
            }}
            allowClear
          />
        </Col>

        <Col xs={24} sm={12} md={4}>
          <label className="block text-sm font-medium mb-1">Nguồn</label>
          <Select
            placeholder="Chọn nguồn"
            allowClear
            style={{ width: '100%' }}
            value={filters.source}
            onChange={(val) => onFiltersChange({ ...filters, source: val, page: 1 })}
            options={[
              { value: 'Facebook', label: 'Facebook' },
              { value: 'TikTok', label: 'TikTok' },
              { value: 'Google', label: 'Google' },
              { value: 'Instagram', label: 'Instagram' },
              { value: 'LinkedIn', label: 'LinkedIn' },
              { value: 'Other', label: 'Khác' },
            ]}
          />
        </Col>

        <Col xs={24} sm={12} md={4}>
          <label className="block text-sm font-medium mb-1">Trạng thái</label>
          <Select
            placeholder="Trạng thái"
            allowClear
            style={{ width: '100%' }}
            value={filters.status}
            onChange={(val) => onFiltersChange({ ...filters, status: val, page: 1 })}
            options={[
              { value: 'pending', label: 'Chờ xử lý' },
              { value: 'potential', label: 'Tiềm năng' },
              { value: 'closed', label: 'Đã chốt' },
              { value: 'lost', label: 'Mất' },
              { value: 'inactive', label: 'Ngừng chăm sóc' },
            ]}
          />
        </Col>

        <Col xs={24} sm={12} md={4}>
          <label className="block text-sm font-medium mb-1">Sales</label>
          <Select
            placeholder="Chọn Sales"
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
            value={filters.salesUserId}
            onChange={(val) => onFiltersChange({ ...filters, salesUserId: val, page: 1 })}
            options={salesUsers.map(u => ({ value: u.id, label: u.name }))}
          />
        </Col>

        <Col xs={24} sm={12} md={6}>
          <label className="block text-sm font-medium mb-1">
            Từ ngày
            {toDate && !fromDate && (
              <span style={{ color: '#faad14', marginLeft: 8, fontSize: '12px' }}>
                ⚠️ Chọn để áp dụng bộ lọc
              </span>
            )}
          </label>
          <DatePicker
            value={fromDate}
            onChange={(date) => handleDateChange('from', date)}
            format="DD/MM/YYYY"
            placeholder="Chọn ngày bắt đầu"
            style={{ 
              width: '100%',
              borderColor: toDate && !fromDate ? '#faad14' : undefined,
            }}
            disabledDate={(current) => {
              if (!toDate) return false;
              return current && current.isAfter(toDate, 'day');
            }}
          />
        </Col>

        <Col xs={24} sm={12} md={6}>
          <label className="block text-sm font-medium mb-1">
            Đến ngày
            {fromDate && !toDate && (
              <span style={{ color: '#faad14', marginLeft: 8, fontSize: '12px' }}>
                ⚠️ Chọn để áp dụng bộ lọc
              </span>
            )}
          </label>
          <DatePicker
            value={toDate}
            onChange={(date) => handleDateChange('to', date)}
            format="DD/MM/YYYY"
            placeholder="Chọn ngày kết thúc"
            style={{ 
              width: '100%',
              borderColor: fromDate && !toDate ? '#faad14' : undefined,
            }}
            disabledDate={(current) => {
              if (!fromDate) return false;
              return current && current.isBefore(fromDate, 'day');
            }}
          />
        </Col>
      </Row>
    </div>
  );
};
