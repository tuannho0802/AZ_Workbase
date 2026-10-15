'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined, StopOutlined, UnlockOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { IpWithFlag } from '@/components/security/IpWithFlag';
import { IpBanModal } from '@/components/security/IpBanModal';
import { formatBanRemaining } from '@/components/security/ipBanDurations';
import { securityApi, type IpBlacklistItem } from '@/lib/api/security.api';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { formatAgo } from '@/lib/utils/format-ago';

const { Text } = Typography;

export const BLACKLIST_QUERY_KEY = ['security-ip-blacklist'];

/**
 * Khối "IP bị chặn chủ động" (PLAN P3.7), nằm trên khối whitelist ở tab "IP bị khoá". Khác khoá bị động (tự khoá khi
 * sai quá ngưỡng, tự hết sau vài phút): Admin chặn NGAY 1 IP đáng ngờ, có hạn hoặc vĩnh viễn, gỡ được bất kỳ lúc nào.
 */
export const LoginIpBlacklistSection = () => {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const [banOpen, setBanOpen] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: BLACKLIST_QUERY_KEY,
        queryFn: () => securityApi.getIpBlacklist(),
        staleTime: 15_000,
    });

    const refreshAll = async () => {
        await queryClient.invalidateQueries({ queryKey: BLACKLIST_QUERY_KEY });
        await queryClient.invalidateQueries({ queryKey: ['security-ip-blocks'] });
        await queryClient.invalidateQueries({ queryKey: ['security-ip-whitelist'] });
        await queryClient.invalidateQueries({ queryKey: ['security-ip-access'] });
    };

    const handleRemove = (record: IpBlacklistItem) => {
        modal.confirm({
            title: `Gỡ chặn ${record.ip}?`,
            content: 'IP này sẽ đăng nhập lại được bình thường (vẫn tính bộ đếm khoá theo IP như mọi IP khác).',
            okText: 'Gỡ chặn',
            cancelText: 'Huỷ',
            onOk: async () => {
                try {
                    await securityApi.removeIpBlacklist(record.ip);
                    message.success(`Đã gỡ chặn ${record.ip}`);
                    await refreshAll();
                } catch (err) {
                    message.error(getApiErrorMessage(err, 'Gỡ chặn thất bại'));
                }
            },
        });
    };

    const columns: ColumnsType<IpBlacklistItem> = [
        { title: 'IP', dataIndex: 'ip', key: 'ip', render: (v: string, r) => <IpWithFlag ip={v} countryCode={r.countryCode} ipKind={r.ipKind} geoSource={r.geoSource} /> },
        { title: 'Lý do', dataIndex: 'reason', key: 'reason', ellipsis: true, render: (v: string | null) => v || '—' },
        { title: 'Người chặn', dataIndex: 'createdByName', key: 'createdByName', render: (v: string | null) => v || '—' },
        { title: 'Chặn lúc', dataIndex: 'createdAgoSeconds', key: 'createdAgoSeconds', render: (s: number) => formatAgo(s) },
        {
            title: 'Còn lại',
            dataIndex: 'remainingSeconds',
            key: 'remainingSeconds',
            render: (s: number | null) => (s === null ? <Tag color="red">Vĩnh viễn</Tag> : <Tag color="volcano">{formatBanRemaining(s)}</Tag>),
        },
        {
            title: 'Thao tác',
            key: 'action',
            render: (_: unknown, r) => (
                <Button icon={<UnlockOutlined />} onClick={() => handleRemove(r)}>
                    Gỡ chặn
                </Button>
            ),
        },
    ];

    return (
        <Card size="small" title={<Space><StopOutlined />IP bị chặn chủ động</Space>}>
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <Text type="secondary">
                    Chặn NGAY 1 IP đáng ngờ, không chờ chạm ngưỡng sai mật khẩu. IP bị chặn không đăng nhập hay làm mới phiên được, dù mật khẩu đúng.
                    Thêm vào đây sẽ tự gỡ IP đó khỏi whitelist. Chỉ khớp đúng 1 địa chỉ.
                </Text>
                <div>
                    <Button danger icon={<PlusOutlined />} onClick={() => setBanOpen(true)}>
                        Chặn IP mới
                    </Button>
                </div>
                <Table<IpBlacklistItem>
                    rowKey="id"
                    size="small"
                    loading={isLoading}
                    columns={columns}
                    dataSource={data?.items ?? []}
                    pagination={false}
                    locale={{ emptyText: 'Chưa chặn IP nào' }}
                    scroll={{ x: 'max-content' }}
                />
            </Space>
            <IpBanModal open={banOpen} ip={null} myIp={data?.myIp} onClose={() => setBanOpen(false)} onDone={refreshAll} />
        </Card>
    );
};
