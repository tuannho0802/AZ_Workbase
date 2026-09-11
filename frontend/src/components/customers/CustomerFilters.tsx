import React, { useState, useEffect } from 'react';
import { Row, Col, Input, Select, DatePicker, Space, Avatar, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useMediaSources } from '@/lib/hooks/useMediaSources';
import { useCustomerStatuses } from '@/lib/hooks/useCustomerStatuses';
import { SourceTag } from './SourceTag';
import { useRoleColorMap, useRoleColors } from '@/lib/hooks/useRoleColorMap';
import { resolveEntityColor } from '@/lib/utils/entityColor';

// ⚠️ MỚI (đồng bộ Tag Phòng ban/Vai trò/Vị trí, giống hệt `userOptions` ở
// chia-data/page.tsx và `SalesUserSelect.tsx`) - trước đây `salesUsers`/
// `marketingUsers` chỉ có {id,name}, dropdown chỉ hiện tên trơn. Field mới
// đều optional để không phá các nơi khác đang truyền đúng shape cũ (vd
// `creatorUsers` từ GET /customers/creators vẫn chỉ có {id,name}).
interface FilterUserOption {
  id: number;
  name: string;
  role?: string;
  department?: { name: string; color?: string } | null;
  position?: { name: string; color?: string } | null;
}

interface CustomerFiltersProps {
  filters: {
    search?: string;
    source?: string;
    status?: string;
    salesUserId?: number;
    marketingUserId?: number;
    // "Người nhập Data" - tách riêng khỏi marketingUserId, vì người nhập
    // data thực tế có thể ở phòng ban khác Marketing (xem page.tsx).
    creatorId?: number;
    dateFrom?: string;
    dateTo?: string;
    joinedGroups?: 'joined' | 'not_joined';
  };
  salesUsers: FilterUserOption[];
  marketingUsers: FilterUserOption[];
  // Chỉ chứa user đã từng tạo >=1 Data Customer (BE lọc sẵn qua
  // GET /customers/creators) - KHÔNG lọc theo phòng ban.
  creatorUsers: FilterUserOption[];
  onFiltersChange: (newFilters: any) => void;
  // ⚠️ MỚI - rà soát Vị trí 2026-09-10: đối xứng field:sales_assignment/
  // field:marketing_assignment đã bị strip khỏi response Customer (BE
  // stripHiddenCustomerFields) - 2 dropdown filter này là control ĐỘC LẬP
  // (không phụ thuộc data), nên phải ẩn tường minh qua prop truyền từ
  // page.tsx (useMyHiddenElements), không tự suy luận được.
  hideSalesFilter?: boolean;
  hideMarketingFilter?: boolean;
}

export const CustomerFilters: React.FC<CustomerFiltersProps> = ({
  filters,
  salesUsers,
  marketingUsers,
  creatorUsers,
  onFiltersChange,
  hideSalesFilter,
  hideMarketingFilter,
}) => {
  const [fromDate, setFromDate] = useState<Dayjs | null>(filters.dateFrom ? dayjs(filters.dateFrom) : null);
  const [toDate, setToDate] = useState<Dayjs | null>(filters.dateTo ? dayjs(filters.dateTo) : null);
  const [searchText, setSearchText] = useState(filters.search || '');
  // ⚠️ FIX: trước đây dropdown "Nguồn" hardcode cứng 6 giá trị cố định
  // (Facebook/TikTok/Google/Instagram/LinkedIn/Other) - cùng loại bug đã
  // sửa ở customers/page.tsx, chia-data/page.tsx: khi admin thêm 1 nguồn
  // mới ở /nguon-media, dropdown lọc NÀY không hề biết tới nguồn đó (không
  // lọc được), và không phản ánh đúng khi nguồn đã bị đổi tên/khoá. Đổi
  // sang lấy động từ bảng media_sources (activeOnly=false, giống SourceTag,
  // để dropdown vẫn hiện được các nguồn cũ dùng cho khách hàng cũ dù đã khoá).
  const { sources: allMediaSources } = useMediaSources(false);
  // ⚠️ MỚI (đồng bộ /quan-ly-status-khach, thay ENUM cứng cũ - xem migration
  // CreateCustomerStatuses1781400000000) - dropdown lọc "Trạng thái" trước
  // đây hardcode 5 giá trị cố định trong chính component này.
  const { statuses: allCustomerStatuses } = useCustomerStatuses();
  const { getRoleColor } = useRoleColorMap();
  // ⚠️ FIX BUG THẬT (403 "GET /api/roles" mỗi lần vào trang Khách hàng, kể cả
  // F5): trước đây dùng `useRoles()` (GET /roles) - route đòi `roles.view`,
  // Employee/Sales không có quyền này nên bị 403 + toast lỗi đỏ tự động (xem
  // axios-instance.ts interceptor) dù không hề bấm gì. Đổi sang
  // `useRoleColors()` (GET /roles/colors) - ĐÚNG route an toàn đã tạo riêng
  // cho việc này (không cần `roles.view`, chỉ cần đăng nhập), xem JSDoc đầy
  // đủ ở roles.controller.ts#getAllRoleColors và useRoleColorMap.ts.
  const { roleColors: allRoles } = useRoleColors();
  const roleNameMap = new Map(allRoles.map((r) => [r.code, r.name]));
  const getRoleName = (code?: string) => (code ? roleNameMap.get(code) || code : '');

  // Render Avatar + Tag Vai trò/Phòng ban/Vị trí cho option trong dropdown -
  // dùng chung cho "Sales (Phòng Kinh Doanh)" và "Marketing (Phòng Marketing)".
  // ⚠️ FIX BUG THẬT (báo cáo qua ảnh chụp): cỡ chữ/Avatar/khoảng cách Space
  // mặc định quá to khiến Tag Phòng ban bị cắt chữ (dropdown bị giới hạn
  // đúng bằng bề rộng ô Select, vốn rất hẹp ở layout filter 4 cột). Thu nhỏ
  // Avatar + Tag (padding/lineHeight) + đổi `popupMatchSelectWidth={false}`
  // (áp ở Select bên dưới) để dropdown tự giãn theo nội dung dài nhất thay
  // vì bị bó cứng theo bề rộng ô input.
  const renderUserOption = (option: { data: { user: FilterUserOption } }) => {
    const u = option.data.user;
    const tagStyle: React.CSSProperties = { fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 };
    return (
      <Space size={4} align="center">
        <Avatar size={20} style={{ backgroundColor: getRoleColor(u.role), fontSize: 11, flexShrink: 0 }}>
          {u.name?.[0]?.toUpperCase()}
        </Avatar>
        <span style={{ fontSize: 13 }}>{u.name}</span>
        {u.role && (
          <Tag style={tagStyle} color={getRoleColor(u.role)}>{getRoleName(u.role)}</Tag>
        )}
        {u.department?.name && (
          <Tag style={tagStyle} color={resolveEntityColor(u.department.color)}>{u.department.name}</Tag>
        )}
        {u.position?.name && (
          <Tag style={tagStyle} color={resolveEntityColor(u.position.color)}>{u.position.name}</Tag>
        )}
      </Space>
    );
  };

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
            options={allMediaSources.map((s) => ({
              value: s.name,
              label: <SourceTag source={s.name} />,
            }))}
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
              ...allCustomerStatuses
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((s) => ({ value: s.code, label: <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.name}</Tag> })),
            ]}
          />
        </Col>

        {!hideSalesFilter && (
          <Col xs={24} sm={12} md={4}>
            <label className="block text-sm font-medium mb-1">Sales (Phòng Kinh Doanh)</label>
            <Select
              placeholder="Chọn Sales"
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              style={{ width: '100%' }}
              value={filters.salesUserId}
              onChange={(val) => onFiltersChange({ ...filters, salesUserId: val, page: 1 })}
              optionLabelProp="label"
              optionRender={renderUserOption}
              popupMatchSelectWidth={false}
              options={salesUsers.map(u => ({ value: u.id, label: u.name, user: u }))}
            />
          </Col>
        )}

        {!hideMarketingFilter && (
          <Col xs={24} sm={12} md={4}>
            <label className="block text-sm font-medium mb-1">Marketing (Phòng Marketing)</label>
            <Select
              placeholder="Chọn Marketing"
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              style={{ width: '100%' }}
              value={filters.marketingUserId}
              onChange={(val) => onFiltersChange({ ...filters, marketingUserId: val, page: 1 })}
              optionLabelProp="label"
              optionRender={renderUserOption}
              popupMatchSelectWidth={false}
              options={marketingUsers.map(u => ({ value: u.id, label: u.name, user: u }))}
            />
          </Col>
        )}

        <Col xs={24} sm={12} md={4}>
          <label className="block text-sm font-medium mb-1">Người nhập Data</label>
          <Select
            placeholder="Chọn người nhập data"
            allowClear
            showSearch={{ optionFilterProp: 'label' }}
            style={{ width: '100%' }}
            value={filters.creatorId}
            onChange={(val) => onFiltersChange({ ...filters, creatorId: val, page: 1 })}
            options={creatorUsers.map(u => ({ value: u.id, label: u.name }))}
          />
        </Col>

        <Col xs={24} sm={12} md={4}>
          <label className="block text-sm font-medium mb-1">Đã joined nhóm</label>
          <Select
            placeholder="Tất cả"
            allowClear
            style={{ width: '100%' }}
            value={filters.joinedGroups}
            onChange={(val) => onFiltersChange({ ...filters, joinedGroups: val, page: 1 })}
            options={[
              { value: 'joined', label: 'Đã joined ít nhất 1 nhóm' },
              { value: 'not_joined', label: 'Chưa joined nhóm nào' },
            ]}
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