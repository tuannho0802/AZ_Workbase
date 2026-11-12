'use client';

import { useMemo, useState } from 'react';
import { Alert, App, DatePicker, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { BulkSkipReason, FanpagePost } from '@/lib/api/fanpages.api';
import { useBulkCreateFanpagePosts, useFanpagePostTypes } from '@/lib/hooks/useFanpages';
import { toastApiError } from '@/lib/utils/error-message.util';
import { MAX_BULK_POST_URLS, buildBulkPreview, type BulkPreviewRow, type BulkRowStatus } from '@/lib/utils/fanpageBulk';

const { Text } = Typography;

const STATUS_TAG: Record<BulkRowStatus, { color: string; label: string }> = {
    valid: { color: 'success', label: '✓ Hợp lệ' },
    invalid: { color: 'error', label: '✕ Không phải link' },
    too_long: { color: 'error', label: '✕ Link quá dài' },
    duplicate_in_batch: { color: 'warning', label: '⚠ Trùng trong danh sách' },
    duplicate_existing: { color: 'warning', label: '⚠ Đã có trong Page' },
};

const SKIP_TEXT: Record<BulkSkipReason, string> = {
    invalid_url: 'không phải link hợp lệ',
    too_long: 'link quá dài',
    duplicate_in_batch: 'trùng trong danh sách',
    duplicate_existing: 'đã có trong Page',
};

interface Props {
    open: boolean;
    fanpageId: number;
    existingPosts: FanpagePost[];
    onClose: () => void;
}

/** B4 - Dán nhiều link: mỗi dòng 1 URL -> bảng xem trước (✓ hợp lệ / ⚠ trùng / ✕ sai) -> "Thêm N bài". Ngày đăng + loại bài dùng chung cho cả lô. */
export function FanpageBulkPostsModal({ open, fanpageId, existingPosts, onClose }: Props) {
    const { message } = App.useApp();
    const [text, setText] = useState('');
    const [postedDate, setPostedDate] = useState<Dayjs | null>(dayjs());
    const [postTypeId, setPostTypeId] = useState<number | null>(null);
    const { postTypes } = useFanpagePostTypes(true, open);
    const bulkMut = useBulkCreateFanpagePosts(fanpageId);

    const rows = useMemo(() => buildBulkPreview(text, existingPosts), [text, existingPosts]);
    const validCount = rows.filter((r) => r.status === 'valid').length;
    const overLimit = rows.length > MAX_BULK_POST_URLS;

    const close = () => {
        setText('');
        setPostTypeId(null);
        setPostedDate(dayjs());
        onClose();
    };

    const submit = async () => {
        try {
            const res = await bulkMut.mutateAsync({
                urls: rows.map((r) => r.url),
                postedDate: postedDate ? postedDate.format('YYYY-MM-DD') : null,
                postTypeId,
            });
            // BE là nơi quyết định cuối: có thể bỏ thêm dòng mà bản xem trước chưa thấy (VD bài vừa được người khác thêm).
            if (res.skipped.length > 0) {
                const first = res.skipped.slice(0, 3).map((s) => `${s.url} (${SKIP_TEXT[s.reason]})`).join('; ');
                message.warning(`Đã thêm ${res.created.length} bài, bỏ qua ${res.skipped.length} dòng: ${first}${res.skipped.length > 3 ? '…' : ''}`, 6);
            } else {
                message.success(`Đã thêm ${res.created.length} bài đăng`);
            }
            close();
        } catch (err) {
            toastApiError(message, err, 'Không thể thêm bài đăng');
        }
    };

    const columns: ColumnsType<BulkPreviewRow> = [
        { title: 'Dòng', dataIndex: 'line', width: 60 },
        { title: 'Link', dataIndex: 'url', ellipsis: true },
        {
            title: 'Kết quả',
            key: 'status',
            width: 190,
            render: (_: unknown, r) => (
                <Space size={4} wrap>
                    <Tag color={STATUS_TAG[r.status].color}>{STATUS_TAG[r.status].label}</Tag>
                    {r.status === 'duplicate_existing' && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {r.existingPostedDate ? `ngày ${dayjs(r.existingPostedDate).format('DD/MM/YYYY')}` : 'chưa có ngày'}
                        </Text>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <Modal
            title="Dán nhiều link bài đăng"
            open={open}
            onCancel={close}
            onOk={submit}
            okText={`Thêm ${validCount} bài`}
            cancelText="Huỷ"
            okButtonProps={{ disabled: validCount === 0 || overLimit }}
            confirmLoading={bulkMut.isPending}
            width={760}
            destroyOnHidden
        >
            <Space orientation="vertical" style={{ width: '100%' }}>
                <Form layout="vertical">
                    <Form.Item label={`Mỗi dòng 1 link (tối đa ${MAX_BULK_POST_URLS})`} style={{ marginBottom: 8 }}>
                        <Input.TextArea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'https://facebook.com/ten-page/posts/1\nhttps://facebook.com/ten-page/posts/2'} />
                    </Form.Item>
                    <Space wrap>
                        <Form.Item label="Ngày đăng (chung cả lô)" style={{ marginBottom: 0 }}>
                            <DatePicker format="DD/MM/YYYY" value={postedDate} onChange={setPostedDate} allowClear />
                        </Form.Item>
                        <Form.Item label="Loại bài (chung cả lô)" style={{ marginBottom: 0 }}>
                            <Select
                                allowClear
                                placeholder="Chưa phân loại"
                                style={{ width: 200 }}
                                value={postTypeId}
                                onChange={(v) => setPostTypeId(v ?? null)}
                                options={postTypes.map((t) => ({ value: t.id, label: t.name }))}
                            />
                        </Form.Item>
                    </Space>
                </Form>
                {overLimit && <Alert type="error" showIcon title={`Tối đa ${MAX_BULK_POST_URLS} link mỗi lần — hiện có ${rows.length}. Hãy chia nhỏ danh sách.`} />}
                {rows.length > 0 && (
                    <>
                        <Table<BulkPreviewRow> rowKey="line" size="small" columns={columns} dataSource={rows} pagination={{ pageSize: 8, hideOnSinglePage: true }} />
                        <Text type="secondary">
                            {validCount}/{rows.length} dòng sẽ được thêm. Link trùng hoặc sai sẽ được bỏ qua, không làm hỏng cả lô.
                        </Text>
                    </>
                )}
            </Space>
        </Modal>
    );
}
