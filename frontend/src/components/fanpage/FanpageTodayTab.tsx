'use client';

import { useState } from 'react';
import { App, Button, Card, Collapse, DatePicker, Empty, Form, Input, Modal, Result, Skeleton, Space, Tag, Typography } from 'antd';
import { LinkOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { FanpageTodayItem } from '@/lib/api/fanpages.api';
import { useCreateFanpagePost, useFanpageToday, useDeleteFanpagePost } from '@/lib/hooks/useFanpages';
import { toastApiError } from '@/lib/utils/error-message.util';
import { formatSinceLastPost, formatWeekProgress, postsNeeded } from '@/lib/utils/fanpageCadence';
import { CadenceBadge } from './CadenceBadge';
import { HealthTag } from './HealthTag';
import { OwnerTag } from './OwnerTag';
import { PlatformTag } from './PlatformTag';

const { Text } = Typography;

interface Props {
    enabled: boolean;
    onOpenDetail: (id: number) => void;
}

interface QuickValues {
    url: string;
    title?: string;
    postedDate: Dayjs;
}

/** Modal thêm bài nhanh: ngày mặc định HÔM NAY (giờ máy chỉ để hiển thị mặc định; BE vẫn là nguồn sự thật cho nhóm). */
function QuickAddPostModal({ page, onClose, today }: { page: FanpageTodayItem | null; onClose: () => void; today: string }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<QuickValues>();
    const createMut = useCreateFanpagePost(page?.id ?? 0);
    const deleteMut = useDeleteFanpagePost(page?.id ?? 0);

    const handleFinish = async (v: QuickValues) => {
        if (!page) return;
        try {
            const post = await createMut.mutateAsync({ url: v.url.trim(), title: v.title?.trim() || null, postedDate: v.postedDate.format('YYYY-MM-DD') });
            const key = `undo-${post.id}`;
            message.open({
                key,
                type: 'success',
                duration: 6,
                content: (
                    <span>
                        Đã thêm bài cho {page.name}{' '}
                        <a
                            onClick={async () => {
                                try {
                                    await deleteMut.mutateAsync(post.id);
                                    message.open({ key, type: 'info', content: 'Đã hoàn tác', duration: 2 });
                                } catch (err) {
                                    toastApiError(message, err, 'Không thể hoàn tác (bạn không có quyền xoá bài)');
                                }
                            }}
                        >
                            Hoàn tác
                        </a>
                    </span>
                ),
            });
            onClose();
        } catch (err) {
            // 409 trùng URL: BE trả message thân thiện (có ngày bài cũ) -> hiện nguyên văn.
            toastApiError(message, err, 'Không thể thêm bài');
        }
    };

    return (
        <Modal
            title={page ? `Thêm bài nhanh · ${page.name}` : 'Thêm bài'}
            open={page != null}
            onCancel={onClose}
            onOk={() => form.submit()}
            okText="Thêm bài"
            cancelText="Huỷ"
            confirmLoading={createMut.isPending}
            destroyOnHidden
            afterOpenChange={(open) => {
                if (open) form.setFieldsValue({ postedDate: dayjs(today), url: '', title: '' });
            }}
        >
            <Form form={form} layout="vertical" onFinish={handleFinish}>
                <Form.Item
                    name="url"
                    label="Link bài đăng"
                    rules={[
                        { required: true, whitespace: true, message: 'Dán link bài đăng' },
                        { type: 'url', message: 'Link phải bắt đầu bằng http:// hoặc https://' },
                    ]}
                >
                    <Input autoFocus placeholder="https://..." />
                </Form.Item>
                <Form.Item name="title" label="Tiêu đề (không bắt buộc)">
                    <Input maxLength={200} />
                </Form.Item>
                <Form.Item name="postedDate" label="Ngày đăng" rules={[{ required: true, message: 'Chọn ngày đăng' }]}>
                    <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
                </Form.Item>
            </Form>
        </Modal>
    );
}

function TodayCard({ item, onAdd, onOpen }: { item: FanpageTodayItem; onAdd: (i: FanpageTodayItem) => void; onOpen: (id: number) => void }) {
    const c = item.cadence;
    const need = postsNeeded(c);
    return (
        <Card size="small" style={{ marginBottom: 8 }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
                <Space orientation="vertical" size={2}>
                    <Space wrap>
                        <PlatformTag platform={item.platform} />
                        <Button type="link" style={{ padding: 0, height: 'auto', fontWeight: 600 }} onClick={() => onOpen(item.id)}>
                            {item.name}
                        </Button>
                        <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label="Mở Page">
                            <LinkOutlined />
                        </a>
                    </Space>
                    <Space wrap size={4}>
                        <CadenceBadge cadence={c} />
                        <HealthTag health={item.health} />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Bài gần nhất: {formatSinceLastPost(c)} · Tuần này: {formatWeekProgress(c)}
                            {need > 0 ? ` (thiếu ${need})` : ''}
                        </Text>
                    </Space>
                    <Space wrap size={2}>
                        {item.owners.map((o) => (
                            <OwnerTag key={o.id} user={o} primary={o.id === item.ownerId && item.owners.length > 1} />
                        ))}
                    </Space>
                </Space>
                {item.canManagePosts && !c.postedToday && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => onAdd(item)}>
                        Thêm bài
                    </Button>
                )}
            </Space>
        </Card>
    );
}

/** Tab "Hôm nay" (B3): Page cần đăng / đã đăng hôm nay / đang ổn. Phân nhóm do BE (cùng nguồn nhịp đăng với bảng - X2). */
export function FanpageTodayTab({ enabled, onOpenDetail }: Props) {
    const { today, isLoading } = useFanpageToday(enabled);
    const [adding, setAdding] = useState<FanpageTodayItem | null>(null);

    if (isLoading || !today) return <Skeleton active paragraph={{ rows: 6 }} />;
    const total = today.counts.needAction + today.counts.postedToday + today.counts.ok;
    if (total === 0) return <Empty description="Chưa có Page nào đang theo dõi" />;

    return (
        <div>
            {today.needAction.length === 0 ? (
                <Result status="success" title="Hôm nay không còn Page nào cần đăng gấp" style={{ padding: '16px 0' }} />
            ) : (
                <div style={{ marginBottom: 16 }}>
                    <Space style={{ marginBottom: 8 }}>
                        <Text strong>Cần đăng bài</Text>
                        <Tag color="red">{today.counts.needAction}</Tag>
                        <Text type="secondary">Còn {today.daysLeftInWeek} ngày trong tuần (tính cả hôm nay)</Text>
                    </Space>
                    {today.needAction.map((it) => (
                        <TodayCard key={it.id} item={it} onAdd={setAdding} onOpen={onOpenDetail} />
                    ))}
                </div>
            )}
            <Collapse
                ghost
                items={[
                    {
                        key: 'posted',
                        label: `Đã đăng hôm nay (${today.counts.postedToday})`,
                        children: today.postedToday.length ? (
                            today.postedToday.map((it) => <TodayCard key={it.id} item={it} onAdd={setAdding} onOpen={onOpenDetail} />)
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có Page nào đăng hôm nay" />
                        ),
                    },
                    {
                        key: 'ok',
                        label: `Đang ổn, chưa đăng hôm nay (${today.counts.ok})`,
                        children: today.ok.length ? (
                            today.ok.map((it) => <TodayCard key={it.id} item={it} onAdd={setAdding} onOpen={onOpenDetail} />)
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có" />
                        ),
                    },
                ]}
            />
            <QuickAddPostModal page={adding} today={today.today} onClose={() => setAdding(null)} />
        </div>
    );
}
