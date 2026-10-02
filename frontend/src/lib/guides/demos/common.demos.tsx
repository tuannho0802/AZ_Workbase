'use client';

import { Alert } from 'antd';
import { HeaderSearchTrigger } from '@/components/common/HeaderSearchTrigger';
import type { GuideDemo } from '../guide-demo.types';

/** Mẫu dùng chung toàn hệ thống (không thuộc riêng 1 trang). */
export const COMMON_DEMOS: GuideDemo[] = [
    {
        id: 'header-search',
        title: 'Ô tìm trang nhanh (Ctrl + K)',
        description: 'Ô tìm kiếm trên thanh Header - bấm hoặc nhấn Ctrl/Cmd + K ở bất kỳ trang nào',
        render: () => <HeaderSearchTrigger />,
    },
    {
        id: 'permission-note',
        title: 'Thông báo khi không đủ quyền',
        description: 'Mẫu hộp cảnh báo thường gặp',
        render: () => (
            <Alert
                type="warning"
                showIcon
                title="Bạn không có quyền thực hiện hành động này"
                description="Liên hệ Quản trị viên nếu bạn cần được cấp quyền."
            />
        ),
    },
];
