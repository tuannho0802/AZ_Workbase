'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import logo from './logo.png';
import './globals.css';

// ⚠️ Next.js CHỈ dùng file này khi lỗi xảy ra NGAY TRONG root layout.tsx
// (vd ConfigProvider/AntdAppProvider tự throw) - lúc đó `error.tsx` thường
// (nằm trong layout) KHÔNG còn tác dụng vì chính layout bọc quanh nó đã
// crash. Do đó bắt buộc:
//   1. Tự khai báo lại <html>/<body> (layout gốc không còn render được).
//   2. KHÔNG import/dùng antd (Button, ConfigProvider...) - đó chính là thứ
//      NGHI PHẠM gây crash, dùng lại rất dễ crash vòng 2. Chỉ dùng HTML/CSS
//      thuần (globals.css import trực tiếp để giữ style Tailwind).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Cùng lý do console.error() được chấp nhận ở error.tsx - đây là trạm
    // log lỗi cuối cùng khi cả root layout đã crash.
    console.error('[global-error.tsx] Lỗi runtime NGHIÊM TRỌNG ở root layout:', error);
  }, [error]);

  return (
    <html lang="vi">
      <body>
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white p-8 md:p-12 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 max-w-lg w-full flex flex-col items-center">
            <div className="mb-8">
              <Image
                src={logo}
                alt="AZWorkbase"
                width={72}
                height={72}
                className="object-contain"
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
              Hệ thống đang gặp sự cố hoặc đang được bảo trì. Vui lòng thử lại
              sau ít phút, dữ liệu của bạn không bị ảnh hưởng.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
              <button
                onClick={() => reset()}
                className="w-full sm:w-auto min-w-[140px] px-6 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
              >
                ↻ Thử lại
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                  CỐ Ý dùng <a> thuần thay vì next/link ở ĐÚNG file này: khi
                  root layout đã crash tới mức phải hiện global-error, không
                  nên đặt cược vào Next Router client-side (chính nó có thể
                  đang là 1 phần nguyên nhân crash) - <a> là con đường điều
                  hướng DUY NHẤT chắc chắn hoạt động (full page reload). */}
              <a href="/" className="w-full sm:w-auto">
                <button className="w-full min-w-[140px] px-6 py-2.5 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors">
                  ⌂ Về trang chủ
                </button>
              </a>
            </div>
          </div>

          <div className="mt-8 text-slate-400 text-xs">
            © {new Date().getFullYear()} AZWorkbase. All rights reserved.
          </div>
        </div>
      </body>
    </html>
  );
}
