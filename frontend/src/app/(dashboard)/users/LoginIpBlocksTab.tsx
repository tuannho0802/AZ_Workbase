'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Space, Table, Tag, Typography } from 'antd';
import { LockOutlined, ReloadOutlined, UnlockOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { securityApi, type IpBlockItem } from '@/lib/api/security.api';
import { formatCountdown, useCountdown } from '@/lib/hooks/useCountdown';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';

const { Text } = Typography;

const QUERY_KEY = ['security-ip-blocks'];

/** 90 -> "1 phút trước", 7300 -> "2 giờ trước". */
export function formatAgo(seconds: number): string {
    const s = Math.max(Math.floor(seconds), 0);
    if (s < 60) return 'vừa xong';
    if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
    if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
    return `${Math.floor(s / 86400)} ngày trước`;
}

function IpLockStatus({ seconds, onExpire }: { seconds: number; onExpire: () => void }) {
    const remaining = useCountdown(seconds, onExpire);
    if (seconds <= 0 || remaining <= 0) return <Tag>Chưa khoá</Tag>;
    return (
        <Tag color="volcano" icon={<LockOutlined />}>
            Đang khoá {formatCountdown(remaining)}
        </Tag>
    );
}

/**
 * Tab "IP bị khoá" (PLAN_RETENTION_SECURITY_ROADMAP P3.3): xem IP đang bị khoá đăng nhập + IP sai gần đây (24 giờ),
 * mở khoá 1 chạm. Chỉ render khi có `users.manage` phạm vi `all` (BE chặn 403 nếu thiếu — FE ẩn trước để không lộ
 * UI rồi báo lỗi). Văn phòng dùng chung 1 IP có thể chạm ngưỡng khi nhiều người gõ nhầm: mở khoá ở đây.
 */
export const LoginIpBlocksTab = () => {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();

    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: QUERY_KEY,
        queryFn: () => securityApi.getIpBlocks(),
        staleTime: 15_000,
    });

    const handleUnblock = (record: IpBlockItem) => {
        modal.confirm({
            title: `Mở khoá IP ${record.ip}?`,
            content:
                record.lockedSeconds > 0
                    ? 'IP này sẽ đăng nhập lại được ngay và bộ đếm sai được đặt về 0.'
                    : 'Bộ đếm sai của IP này sẽ được đặt về 0.',
            okText: 'Mở khoá',
            cancelText: 'Huỷ',
            onOk: async () => {
                try {
                    await securityApi.unblockIp(record.ip);
                    message.success(`Đã mở khoá IP ${record.ip}`);
                    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
                } catch (err) {
                    message.error(getApiErrorMessage(err, 'Mở khoá IP thất bại'));
                }
            },
        });
    };

    const cfg = data?.config;

    const columns: ColumnsType<IpBlockItem> = [
        { title: 'Địa chỉ IP', dataIndex: 'ip', key: 'ip', render: (ip: string) => <Text code>{ip}</Text> },
        {
            title: 'Trạng thái',
            key: 'status',
            render: (_: unknown, r) => <IpLockStatus seconds={r.lockedSeconds} onExpire={() => void refetch()} />,
        },
        {
            title: 'Số lần sai',
            dataIndex: 'failedCount',
            key: 'failedCount',
            render: (n: number) => (cfg ? `${n} / ${cfg.ipMaxFailedAttempts}` : n),
        },
        {
            title: 'Email thử gần nhất',
            dataIndex: 'lastEmail',
            key: 'lastEmail',
            ellipsis: true,
            render: (e: string | null) => e || '-',
        },
        {
            title: 'Cập nhật',
            dataIndex: 'updatedAgoSeconds',
            key: 'updatedAgoSeconds',
            render: (s: number) => formatAgo(s),
        },
        {
            title: 'Thao tác',
            key: 'action',
            render: (_: unknown, r) => (
                <Button
                    type={r.lockedSeconds > 0 ? 'primary' : 'default'}
                    icon={<UnlockOutlined />}
                    onClick={() => handleUnblock(r)}
                >
                    {r.lockedSeconds > 0 ? 'Mở khoá' : 'Xoá bộ đếm'}
                </Button>
            ),
        },
    ];

    return (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Alert
                type="info"
                showIcon
                message={
                    cfg
                        ? `IP bị khoá ${cfg.ipLockMinutes} phút sau ${cfg.ipMaxFailedAttempts} lần đăng nhập sai trong ${cfg.ipWindowMinutes} phút (mọi email). Hiển thị IP đang khoá và IP sai trong 24 giờ gần đây.`
                        : 'Hiển thị IP đang bị khoá đăng nhập và IP sai trong 24 giờ gần đây.'
                }
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => void refetch()}>
                    Làm mới
                </Button>
            </div>
            <Table<IpBlockItem>
                rowKey="id"
                columns={columns}
                dataSource={data?.items ?? []}
                loading={isLoading}
                pagination={{ pageSize: 20, hideOnSinglePage: true }}
                locale={{ emptyText: 'Không có IP nào bị khoá hoặc sai gần đây' }}
                scroll={{ x: 'max-content' }}
            />
        </Space>
    );
};