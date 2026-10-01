'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button, Result } from 'antd';
import { HomeOutlined, ReloadOutlined } from '@ant-design/icons';
import * as Sentry from '@sentry/nextjs';

// PLAN_HARDENING P5 - error boundary THEO VÙNG cho nhóm trang dashboard.
// File này nằm DƯỚI `(dashboard)/layout.tsx` nên khi 1 trang con throw, Next
// chỉ thay phần `children` (vùng nội dung) bằng giao diện này - Sidebar/Header
// của layout vẫn nguyên, người dùng chuyển sang trang khác được ngay, không
// bị đẩy ra màn hình lỗi toàn app (`app/error.tsx`).
//
// Lỗi ở chính `(dashboard)/layout.tsx` thì file này KHÔNG bắt được (boundary
// nằm dưới layout) - trường hợp đó rơi về `app/error.tsx`.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Gửi lên Sentry (đã lọc PII ở `beforeSend`, chỉ bật ở production).
    Sentry.captureException(error);
    // Giữ log console để dev thấy stack trace khi debug (cùng lý do như app/error.tsx).
    console.error('[(dashboard)/error.tsx] Lỗi runtime ở vùng nội dung:', error);
  }, [error]);

  return (
    <Result
      status="error"
      title="Trang này gặp sự cố"
      subTitle="Đã có lỗi khi hiển thị nội dung. Bạn vẫn có thể dùng menu bên trái để chuyển sang trang khác, hoặc thử tải lại trang này."
      extra={[
        <Button key="retry" icon={<ReloadOutlined />} onClick={() => reset()}>
          Thử lại
        </Button>,
        <Link key="home" href="/">
          <Button type="primary" icon={<HomeOutlined />}>
            Về trang chủ
          </Button>
        </Link>,
      ]}
    >
      {error.digest ? (
        <div className="text-center text-xs text-slate-400">Mã lỗi: {error.digest}</div>
      ) : null}
    </Result>
  );
}
