'use client';

import { App } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';

// ⚠️ Set locale tiếng Việt cho dayjs 1 lần duy nhất ở đây. Đặt trong module
// 'use client' (chạy trên browser) chứ không phải layout.tsx (server
// component) - nếu đặt ở server component, bundle dayjs phía client sẽ
// không nhận được locale này. Trước đây thiếu dòng này nên format 'dddd'
// (tên thứ trong tuần) tự hiện tiếng Anh (Friday, Thursday...) thay vì
// tiếng Việt (Thứ Sáu, Thứ Năm...).
dayjs.locale('vi');

import { shouldRetryQuery } from '@/lib/query-retry';

let globalMessage: MessageInstance | undefined;

export const showMessage = {
  success: (msg: string) => globalMessage?.success(msg),
  error: (msg: string) => globalMessage?.error(msg),
  warning: (msg: string) => globalMessage?.warning(msg),
  info: (msg: string) => globalMessage?.info(msg),
};

function AppInjector({ children }: { children: React.ReactNode }) {
  const { message } = App.useApp();
  globalMessage = message;

  return <>{children}</>;
}

export function AntdAppProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30000,        // Data được coi là fresh trong 30s
        gcTime: 5 * 60 * 1000,   // Cache 5 phút
        // [AGENT] OLD CODE (giữ để rollback): retry: 2 (403/404/500 bị gọi 3 lần)
        // NEW (PLAN CPU Mục 10B): chỉ thử lại lỗi mạng/5xx đúng 1 lần; 4xx (403 thiếu quyền, 404, 401...) KHÔNG thử lại.
        retry: shouldRetryQuery,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <App>
        <AppInjector>
          {children}
        </AppInjector>
      </App>
    </QueryClientProvider>
  );
}