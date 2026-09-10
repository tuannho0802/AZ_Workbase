'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from 'antd';
import { HomeOutlined, ReloadOutlined } from '@ant-design/icons';
import logo from './logo.png';

// ⚠️ App Router error boundary - Next.js tự render component này khi CÓ LỖI
// RUNTIME (throw) xảy ra trong bất kỳ route con nào dưới `app/` (trừ chính
// root layout.tsx - trường hợp đó cần `global-error.tsx` riêng, xem file
// cạnh đây). Component này VẪN nằm TRONG layout.tsx (ConfigProvider/AntdApp
// vẫn còn nguyên) nên dùng antd bình thường được, không cần tự khai báo lại
// <html>/<body> như global-error.tsx.
//
// Props `error`/`reset` do Next.js truyền vào - `reset()` thử render lại
// route đang lỗi (KHÔNG phải F5 cả trang), dùng cho nút "Thử lại".
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log lỗi thật ra console để dev còn thấy stack trace khi debug - nơi
    // duy nhất trong khối error boundary này chấp nhận console.error() vì
    // đây chính là "trạm log lỗi" theo đúng vai trò của error.tsx trong Next
    // App Router. Khi tích hợp Sentry (đã liệt kê ở mục "Post-Launch
    // Checklist" của README) thì thay dòng này bằng `Sentry.captureException`.
    console.error('[error.tsx] Lỗi runtime chưa xử lý:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-white p-8 md:p-12 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 max-w-lg w-full flex flex-col items-center">
        <div className="mb-8">
          <Image
            src={logo}
            alt="AZWorkbase"
            width={72}
            height={72}
            className="object-contain hover:scale-110 transition-transform duration-300"
            priority
          />
        </div>

        <h1 className="text-7xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 tracking-tighter mb-2">
          500
        </h1>

        <h2 className="text-xl md:text-2xl font-bold text-slate-800 mb-3">
          Server đang bảo trì
        </h2>

        <p className="text-slate-500 mb-8 max-w-sm text-sm md:text-base leading-relaxed">
          Hệ thống đang gặp sự cố hoặc đang được bảo trì. Vui lòng thử lại sau
          ít phút, dữ liệu của bạn không bị ảnh hưởng.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
          <Button
            icon={<ReloadOutlined />}
            size="large"
            onClick={() => reset()}
            className="w-full sm:w-auto min-w-[140px]"
          >
            Thử lại
          </Button>
          <Link href="/" className="w-full sm:w-auto">
            <Button
              type="primary"
              icon={<HomeOutlined />}
              size="large"
              className="w-full min-w-[140px]"
            >
              Về trang chủ
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-8 text-slate-400 text-xs">
        © {new Date().getFullYear()} AZWorkbase. All rights reserved.
      </div>
    </div>
  );
}
