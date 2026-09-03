'use client';

import { useState } from 'react';
import { Tabs, Typography } from 'antd';
import dayjs from 'dayjs';
import { DollarOutlined, TeamOutlined } from '@ant-design/icons';
import { ReportQuery } from '@/lib/types/reports.types';
import RevenueReportTab from './RevenueReportTab';
import CustomerReportTab from './CustomerReportTab';

const { Title, Text } = Typography;

const DEFAULT_QUERY: ReportQuery = {
  period: 'week',
  anchor: dayjs().format('YYYY-MM-DD'),
};

/**
 * Trang Báo cáo doanh số - mở cho MỌI role (Admin/Assistant/Manager/Employee
 * đều xem được, khớp `@Roles(ADMIN, ASSISTANT, MANAGER, EMPLOYEE)` ở
 * `reports.controller.ts`) - phạm vi dữ liệu thật do BE tự khoanh vùng theo
 * role (xem bảng phân quyền ở đầu `reports.service.ts`), Frontend không cần
 * tự ẩn/hiện gì theo role - cứ hiển thị đúng những gì BE trả về (`total`/
 * `department` = null thì tab con tự ẩn phần đó, xem RevenueReportTab.tsx).
 *
 * 2 tab dùng CHUNG 1 state `query` (period/anchor/customFrom/customTo) - đổi
 * kỳ ở tab này thì tab kia cũng theo đúng kỳ đó khi chuyển qua, tránh người
 * dùng phải chọn lại kỳ 2 lần cho cùng 1 lần xem báo cáo.
 */
export default function ReportsPage() {
  const [query, setQuery] = useState<ReportQuery>(DEFAULT_QUERY);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          Báo cáo doanh số
        </Title>
        <Text type="secondary">
          Doanh thu và data khách hàng theo kỳ - mốc thời gian luôn là khoảng lịch trọn vẹn (Thứ
          Hai→Chủ Nhật, ngày 1→cuối tháng...), không phải &quot;N ngày gần đây&quot;.
        </Text>
      </div>

      <Tabs
        defaultActiveKey="revenue"
        items={[
          {
            key: 'revenue',
            label: (
              <span>
                <DollarOutlined /> Doanh thu
              </span>
            ),
            children: <RevenueReportTab query={query} onQueryChange={setQuery} />,
          },
          {
            key: 'customers',
            label: (
              <span>
                <TeamOutlined /> Doanh số khách
              </span>
            ),
            children: <CustomerReportTab query={query} onQueryChange={setQuery} />,
          },
        ]}
      />
    </div>
  );
}