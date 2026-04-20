'use client';

import { App } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

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
        retry: 2,
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
