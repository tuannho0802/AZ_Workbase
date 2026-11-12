import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';
import type { FanpageFlags } from '@/lib/api/fanpages.api';

/**
 * Chốt chặn cảnh báo dev của antd/rc-field-form cho các component Fanpage (đã từng dính):
 *  - `[antd: Timeline] items.children is deprecated` (đổi sang `content`)
 *  - `[antd: Modal] maskClosable is deprecated` (đổi sang `mask.closable`)
 *  - `Instance created by useForm is not connected to any Form element` (gọi form.* khi <Form> chưa mount)
 * Test mở các modal thêm/sửa rồi chờ 1 nhịp timer (cảnh báo useForm bắn bằng setTimeout) và yêu cầu console sạch.
 */
vi.mock('@/lib/hooks/useFanpages', () => {
    const mut = () => ({ isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) });
    return {
        useFanpagePosts: () => ({
            posts: [{ id: 1, fanpageId: 1, url: 'https://x.com/a', title: 'T', postedDate: '2026-11-01', postTypeId: null, note: null, createdAt: '2026-11-01T00:00:00Z', createdBy: null, metrics: {} }],
            isLoading: false,
        }),
        useFanpagePostTypes: () => ({ postTypes: [] }),
        useBulkCreateFanpagePosts: mut,
        useCreateFanpagePost: mut,
        useUpdateFanpagePost: mut,
        useDeleteFanpagePost: mut,
        useFanpageSnapshots: () => ({
            snapshots: [{ id: 1, snapshotDate: '2026-11-01', followers: 10, reach: 1, engagement: 1, views: 1, note: null, updatedAt: 'x' }],
            isLoading: false,
        }),
        useFanpageTargets: () => ({ targets: [] }),
        useUpsertFanpageSnapshot: mut,
        useDeleteFanpageSnapshot: mut,
        useSetFanpageTarget: mut,
        useFanpageHistory: () => ({
            isLoading: false,
            events: [{ id: 1, type: 'OWNERS_CHANGED', at: '2026-11-01T00:00:00Z', actor: { name: 'A' }, before: null, after: null }],
        }),
    };
});

import { FanpagePostsTab } from './FanpagePostsTab';
import { FanpageSnapshotsTab } from './FanpageSnapshotsTab';
import { FanpageHistoryTab } from './FanpageHistoryTab';

const flags = { canManagePosts: true, canManageMetrics: true, canEdit: true, canDelete: true } as unknown as FanpageFlags;
const tick = () => new Promise((r) => setTimeout(r, 150));

describe('Fanpage: không phát cảnh báo antd / rc-field-form', () => {
    afterEach(() => vi.restoreAllMocks());

    it('Lịch sử, Bài đăng, Số liệu: render + mở modal thêm/sửa không có warning', async () => {
        const logs: string[] = [];
        const grab = (...a: unknown[]) => void logs.push(a.map(String).join(' '));
        vi.spyOn(console, 'error').mockImplementation(grab);
        vi.spyOn(console, 'warn').mockImplementation(grab);

        render(
            <App>
                <FanpagePostsTab fanpageId={1} flags={flags} />
                <FanpageSnapshotsTab fanpageId={1} flags={flags} archived={false} />
                <FanpageHistoryTab fanpageId={1} />
            </App>,
        );

        for (const name of [/Thêm bài đăng/, /Thêm số liệu/]) {
            fireEvent.click(screen.getAllByRole('button', { name })[0]);
            await waitFor(() => expect(screen.getAllByRole('dialog').length).toBeGreaterThan(0));
            await tick();
        }
        // Mở thêm modal "Sửa" của từng bảng.
        for (const btn of document.querySelectorAll('button .anticon-edit')) {
            fireEvent.click(btn.closest('button') as HTMLElement);
            await tick();
        }

        const bad = logs.filter((l) => /Warning:|deprecated|not connected to any Form/.test(l));
        expect(bad).toEqual([]);
    });
});
