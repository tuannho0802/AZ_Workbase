'use client';

import { App } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';

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
  return (
    <App>
      <AppInjector>
        {children}
      </AppInjector>
    </App>
  );
}
