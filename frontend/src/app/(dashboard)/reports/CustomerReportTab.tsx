'use client';

import { Card, Statistic, Row, Col, Typography, Alert } from 'antd';
import { TeamOutlined, CheckCircleOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import { useCustomerReport } from '@/lib/hooks/useReports';
import { ReportQuery, CustomerPersonalRow, CustomerDepartmentRow } from '@/lib/types/reports.types';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { ReportSection } from './ReportSection';
import { CHART_COLORS } from './ReportChart';
import PeriodSelector from './PeriodSelector';

const { Title } = Typography;

const formatCount = (value: number) => value.toLocaleString('vi-VN');

// 3 chỉ số cùng lúc (khác Doanh thu chỉ có 1 series) - Cột dọc/ngang vẽ
// song song cả 3, riêng Tròn phải chọn 1 trong 3 (xem ReportSection.tsx).
const CUSTOMER_SERIES = [
  { key: 'totalCustomers', label: 'Tổng data', color: CHART_COLORS[0] },
  { key: 'closedCustomers', label: 'Đã chốt', color: CHART_COLORS[1] },
  { key: 'joinedGroupCustomers', label: 'Đã join nhóm', color: CHART_COLORS[2] },
];

interface Props {
  query: ReportQuery;
  onQueryChange: (next: ReportQuery) => void;
}

/**
 * 3 cột số liệu dùng chung cho cả 2 bảng (Cá nhân/Phòng ban) - khớp đúng
 * `CustomerBreakdownCounts` ở BE (`totalCustomers`/`closedCustomers`/
 * `joinedGroupCustomers`), không phải 3 báo cáo riêng biệt mà là 3 cột
 * trong CÙNG 1 bảng theo đúng yêu cầu ban đầu.
 */
function buildCountColumns<T extends { totalCustomers: number; closedCustomers: number; joinedGroupCustomers: number }>() {
  return [
    {
      title: 'Tổng data',
      dataIndex: 'totalCustomers',
      key: 'totalCustomers',
      align: 'right' as const,
      sorter: (a: T, b: T) => a.totalCustomers - b.totalCustomers,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Đã chốt',
      dataIndex: 'closedCustomers',
      key: 'closedCustomers',
      align: 'right' as const,
      sorter: (a: T, b: T) => a.closedCustomers - b.closedCustomers,
    },
    {
      title: 'Đã join nhóm',
      dataIndex: 'joinedGroupCustomers',
      key: 'joinedGroupCustomers',
      align: 'right' as const,
      sorter: (a: T, b: T) => a.joinedGroupCustomers - b.joinedGroupCustomers,
    },
  ];
}

export default function CustomerReportTab({ query, onQueryChange }: Props) {
  const { data, isLoading, isError, error } = useCustomerReport(query);

  const personalColumns = [
    { title: 'Nhân viên', dataIndex: 'userName', key: 'userName' },
    ...buildCountColumns<CustomerPersonalRow>(),
  ];

  const departmentColumns = [
    { title: 'Phòng ban', dataIndex: 'departmentName', key: 'departmentName' },
    ...buildCountColumns<CustomerDepartmentRow>(),
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
          message="Không tải được báo cáo doanh số khách"
          description={getApiErrorMessage(error, 'Đã có lỗi xảy ra, vui lòng thử lại')}
        />
      )}

      {/* Tổng tất cả - CHỈ Admin/Assistant thấy (BE trả null cho role khác) */}
      {data?.total != null && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Tổng data toàn hệ thống"
                value={data.total.totalCustomers}
                prefix={<TeamOutlined />}
                styles={{ content: { color: '#1677ff' } }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Đã chốt"
                value={data.total.closedCustomers}
                prefix={<CheckCircleOutlined />}
                styles={{ content: { color: '#52c41a' } }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Đã join nhóm"
                value={data.total.joinedGroupCustomers}
                prefix={<UsergroupAddOutlined />}
                styles={{ content: { color: '#faad14' } }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Title level={5}>Theo cá nhân</Title>
      <div style={{ marginBottom: 24 }}>
        <ReportSection<CustomerPersonalRow>
          rowKey="userId"
          loading={isLoading}
          columns={personalColumns}
          data={data?.personal || []}
          nameKey="userName"
          series={CUSTOMER_SERIES}
          valueFormatter={formatCount}
          emptyText="Không có data trong kỳ này"
        />
      </div>

      {/* Theo phòng ban - Employee không có mục này (BE trả null) */}
      {data?.department != null && (
        <>
          <Title level={5}>Theo phòng ban</Title>
          <ReportSection<CustomerDepartmentRow>
            rowKey="departmentId"
            loading={isLoading}
            columns={departmentColumns}
            data={data.department}
            nameKey="departmentName"
            series={CUSTOMER_SERIES}
            valueFormatter={formatCount}
            emptyText="Không có data trong kỳ này"
          />
        </>
      )}
    </div>
  );
}