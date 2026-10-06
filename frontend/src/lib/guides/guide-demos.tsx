'use client';

import { Alert } from 'antd';
import { DemoFrame } from './demo-kit/DemoFrame';
import type { GuideDemo } from './guide-demo.types';
import { CUSTOMER_DEMOS } from './demos/customers.demos';
import { UTM_DEMOS } from './demos/utms.demos';
import { LINK_GROUP_DEMOS } from './demos/link-groups.demos';
import { COMMON_DEMOS } from './demos/common.demos';
import { PERIODIC_TASK_DEMOS } from './demos/periodic-tasks.demos';
import { ASSIGNMENT_DEMOS } from './demos/assignment.demos';
import { STATUS_DEMOS } from './demos/status.demos';
import { SOURCE_DEMOS } from './demos/sources.demos';
import { TRASH_DEMOS } from './demos/trash.demos';

export type { GuideDemo } from './guide-demo.types';

/**
 * REGISTRY các "mẫu minh hoạ" nhúng vào bài Hướng dẫn bằng khối Markdown:
 *
 *   ```az-demo
 *   status-tags
 *   ```
 *
 * Mỗi mẫu là bản SAO tĩnh của UI thật (cùng component/kiểu dáng antd), dữ liệu mẫu cứng, KHÔNG gọi API,
 * KHÔNG phụ thuộc quyền -> an toàn cho mọi role và không lộ dữ liệu thật. Khung `DemoFrame` cho cuộn/rê chuột
 * xem thoải mái nhưng mọi thao tác đều vô hiệu (không handler thật, chặn điều hướng link/submit form).
 *
 * File này CHỈ còn gộp mảng + dựng khối hiển thị. Thêm mẫu mới: thêm 1 phần tử vào mảng của module tương ứng ở
 * `demos/<module>.demos.tsx` (id chỉ gồm chữ thường/số/gạch ngang; module mới -> tạo file mới rồi đăng ký ở `GUIDE_DEMOS` dưới đây).
 * Trình soạn tự liệt kê mẫu mới trong ô "Chèn mẫu minh hoạ"; không cần đổi BE/DB. Mỗi phase của plan đụng file `demos/*` riêng
 * nên nhiều tài khoản làm song song không xung đột. Test `guide-demos.contract.test.ts` bắt id trùng.
 */
export const GUIDE_DEMOS: GuideDemo[] = [...CUSTOMER_DEMOS, ...ASSIGNMENT_DEMOS, ...STATUS_DEMOS, ...SOURCE_DEMOS, ...PERIODIC_TASK_DEMOS, ...UTM_DEMOS, ...LINK_GROUP_DEMOS, ...TRASH_DEMOS, ...COMMON_DEMOS];

const DEMO_MAP = new Map(GUIDE_DEMOS.map((d) => [d.id, d]));

export function findGuideDemo(id: string): GuideDemo | undefined {
    return DEMO_MAP.get(id);
}

/** Khung cảnh báo chung (không throw, không lộ gì ngoài id/tham số người soạn tự gõ). */
function DemoWarning({ title, description }: { title: string; description: string }) {
    return <Alert type="warning" showIcon style={{ margin: '16px 0' }} title={title} description={description} />;
}

/** Render 1 mẫu theo id + tham số; id/tham số lạ -> khung cảnh báo. */
export function GuideDemoBlock({ id, params = {}, invalid = [] }: { id: string; params?: Record<string, string>; invalid?: string[] }) {
    const demo = findGuideDemo(id);
    if (!demo) {
        return (
            <DemoWarning
                title={`Không có mẫu minh hoạ \"${id}\"`}
                description={'Mẫu này không tồn tại hoặc đã bị gỡ. Người soạn hãy chọn lại ở ô \"Chèn mẫu minh hoạ\".'}
            />
        );
    }
    const allowed = demo.params ?? {};
    const badKey = Object.keys(params).find((k) => !(k in allowed) || !allowed[k].includes(params[k]));
    if (badKey || invalid.length > 0) {
        return (
            <DemoWarning
                title={`Tham số không hợp lệ cho mẫu \"${id}\"`}
                description={
                    Object.keys(allowed).length === 0
                        ? 'Mẫu này không nhận tham số.'
                        : `Tham số cho phép: ${Object.entries(allowed).map(([k, v]) => `${k}=${v.join('|')}`).join('; ')}`
                }
            />
        );
    }
    const body = demo.render(params);
    return demo.selfFramed ? <>{body}</> : <DemoFrame title={demo.title}>{body}</DemoFrame>;
}
