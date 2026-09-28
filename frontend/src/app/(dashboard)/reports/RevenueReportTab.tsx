'use client';

import { useMemo, useState } from 'react';
import { Card, Statistic, Typography, Alert } from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import { useRevenueReport } from '@/lib/hooks/useReports';
import { ReportQuery, RevenuePersonalRow } from '@/lib/types/reports.types';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { ReportSection } from './ReportSection';
import { CHART_COLORS } from './ReportChart';
import PeriodSelector from './PeriodSelector';
import ReportNameFilter from './ReportNameFilter';
import ReportUserName from './ReportUserName';

const { Title } = Typography;
// Không còn khối "Theo phòng ban": doanh thu quy theo phòng ban của KHÁCH (luôn là Kinh doanh) nên vô nghĩa.

/** Cùng định dạng USD với StatsCards.tsx (trang Khách hàng) - nhất quán 1
 * kiểu hiển thị tiền trong toàn app, không tạo thêm quy ước riêng ở đây. */
const formatUsd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

/** Bản RÚT GỌN cho nhãn trục biểu đồ (vd "$1.2K") - khác formatUsd() dùng ở
 * bảng/tooltip (cần đủ số chi tiết), trục cần ngắn để không đè nhãn lên nhau. */
const formatUsdCompact = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

const REVENUE_SERIES = [{ key: 'amount', label: 'Doanh thu', color: CHART_COLORS[0] }];

interface Props {
  query: ReportQuery;
  onQueryChange: (next: ReportQuery) => void;
}

export default function RevenueReportTab({ query, onQueryChange }: Props) {
  const { data, isLoading, isError, error } = useRevenueReport(query);
  const [personalSearch, setPersonalSearch] = useState('');

  const filteredPersonal = useMemo(() => {
    const rows = data?.personal || [];
    if (!personalSearch.trim()) return rows;
    const q = personalSearch.trim().toLowerCase();
    return rows.filter((r) => r.userName.toLowerCase().includes(q));
  }, [data?.personal, personalSearch]);

  const personalColumns = [
    {
      title: 'Nhân viên',
      key: 'userName',
      render: (_: unknown, r: RevenuePersonalRow) => (
        <ReportUserName name={r.userName} departmentName={r.departmentName} departmentColor={r.departmentColor} />
      ),
    },
    {
      title: 'Doanh thu',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right' as const,
      render: (v: number) => formatUsd(v),
      sorter: (a: RevenuePersonalRow, b: RevenuePersonalRow) => a.amount - b.amount,
      defaultSortOrder: 'descend' as const,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <PeriodSelector value={query} onChange={onQueryChange} resolvedPeriod={data?.period} />
      </div>

      {isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Không tải được báo cáo doanh thu"
          description={getApiErrorMessage(error, 'Đã có lỗi xảy ra, vui lòng thử lại')}
        />
      )}

      {/* Tổng tất cả - CHỈ Admin/Assistant thấy (BE trả null cho role khác) */}
      {data?.total != null && (
        <Card style={{ marginBottom: 16 }}>
          <Statistic
            title="Tổng doanh thu toàn hệ thống"
            value={data.total}
            formatter={(v) => formatUsd(Number(v))}
            prefix={<DollarOutlined />}
            styles={{ content: { color: '#faad14', fontSize: 28 } }}
          />
        </Card>
      )}

      <Title level={5}>Theo cá nhân</Title>
      <div style={{ marginBottom: 24 }}>
        <ReportSection<RevenuePersonalRow>
          rowKey="userId"
          loading={isLoading}
          columns={personalColumns}
          data={filteredPersonal}
          nameKey="userName"
          series={REVENUE_SERIES}
          valueFormatter={formatUsd}
          axisFormatter={formatUsdCompact}
          emptyText={personalSearch ? 'Không tìm thấy nhân viên phù hợp' : 'Không có doanh thu trong kỳ này'}
          extraFilters={
            <ReportNameFilter value={personalSearch} onChange={setPersonalSearch} placeholder="Tìm theo tên nhân viên..." />
          }
        />
      </div>

    </div>
  );
}