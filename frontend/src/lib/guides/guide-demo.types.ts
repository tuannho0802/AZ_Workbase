import type { ReactNode } from 'react';

/**
 * 1 mẫu minh hoạ nhúng được vào bài Hướng dẫn bằng khối ```az-demo <id> [key=value ...].
 * Tách khỏi `guide-demos.tsx` để các file `demos/*.demos.tsx` import kiểu này mà không tạo vòng import với registry.
 */
export interface GuideDemo {
    /** Chỉ gồm chữ thường/số/gạch ngang. Đã dùng trong bài viết -> KHÔNG đổi id (đổi = bài cũ hiện khung cảnh báo). */
    id: string;
    title: string;
    description: string;
    /**
     * Tham số `key=value` cho phép trong fence: `{ persona: ['admin', ...] }`. Mẫu không khai báo = không nhận
     * tham số nào (tham số lạ -> khung cảnh báo, không throw).
     */
    params?: Record<string, readonly string[]>;
    /** true = mẫu tự dựng `DemoFrame` (cần `controls` ngoài vùng mẫu). */
    selfFramed?: boolean;
    render: (params: Record<string, string>) => ReactNode;
}
