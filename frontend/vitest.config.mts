import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Chỉ chạy file *.test.ts(x) - tránh Vitest tự nhặt nhầm file khác có
    // chữ "test" trong tên (vd component tên TestBadge.tsx không liên quan).
    include: ['src/**/*.test.{ts,tsx}'],
    // Test render antd (Table/Popconfirm/Modal) nặng: trên runner CI 2 CPU chia sẻ,
    // 1 test có thể mất 6-12s (mặc định 5s -> timeout giả, không phải lỗi logic).
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
