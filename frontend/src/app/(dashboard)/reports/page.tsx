'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Tabs, Typography } from 'antd';
import dayjs from 'dayjs';
import { DollarOutlined, TeamOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { ReportQuery } from '@/lib/types/reports.types';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import RevenueReportTab from './RevenueReportTab';
import CustomerReportTab from './CustomerReportTab';
import QualityReportTab from './QualityReportTab';

const { Title, Text } = Typography;

const DEFAULT_QUERY: ReportQuery = {
  period: 'week',
  anchor: dayjs().format('YYYY-MM-DD'),
};

/**
 * Trang Báo cáo doanh số - mở cho role nào ĐANG CÓ `reports.view`
 * (`@RequirePermission('reports.view')` ở `reports.controller.ts`, xem
 * PERMISSIONS.md) - phạm vi dữ liệu thật do BE tự khoanh vùng theo
 * scope (own/department/all), Frontend không cần tự lọc dữ liệu.
 *
 * ⚠️ FIX BUG THẬT (rà soát permission 2026-09): trước đây trang này KHÔNG
 * check `reports.view` gì cả (comment cũ ghi nhầm "mở cho MỌI role, khớp
 * `@Roles(...)`" - đã lỗi thời từ lúc BE đổi sang permission động). Nếu Admin
 * thu hồi `reports.view` khỏi 1 role qua trang "Phân quyền", user role đó
 * gõ thẳng URL `/reports` (sidebar đã ẩn mục này nhưng không chặn URL trực
 * tiếp) vẫn vào được trang, 2 tab con gọi API ngay khi mount -> BE trả 403 ->
 * axios interceptor tự bắn toast lỗi cho MỌI query chạy song song (2 tab =
 * 2 toast cùng lúc) mà KHÔNG có gì giải thích hay điều hướng đi đâu - đúng
 * loại bug "khoá quyền nhưng không ẩn, để tự bắn toast lỗi" đang rà soát.
 * Mirror ĐÚNG pattern route-guard đã dùng ở mọi trang khác (vd
 * `quan-ly-status-khach/page.tsx`, `duyet-phep/page.tsx`).
 */
export default function ReportsPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const { can, isLoading: permissionsLoading } = useMyPermissions();
  const [query, setQuery] = useState<ReportQuery>(DEFAULT_QUERY);

  useEffect(() => {
    if (!permissionsLoading && !can('reports.view')) {
      message.warning('Bạn không có quyền truy cập trang này');
      router.replace('/customers');
    }
  }, [permissionsLoading, router]);

  // Chưa xác định được quyền (đang tải `my-permissions`) hoặc đã xác định
  // KHÔNG có quyền (đang điều hướng đi) -> không render 2 tab, tránh bắn
  // API/toast 403 vô ích trong lúc chờ `router.replace()` áp dụng.
  if (permissionsLoading || !can('reports.view')) {
    return null;
  }

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
          {
            key: 'quality',
            label: (
              <span>
                <SafetyCertificateOutlined /> Chất lượng data
              </span>
            ),
            children: <QualityReportTab query={query} onQueryChange={setQuery} />,
          },
        ]}
      />
    </div>
  );
}