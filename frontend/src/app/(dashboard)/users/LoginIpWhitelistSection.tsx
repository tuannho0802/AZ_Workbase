'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Input, Space, Table, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined, SafetyOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { IpWithFlag } from '@/components/security/IpWithFlag';
import { securityApi, type IpWhitelistItem } from '@/lib/api/security.api';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { formatAgo } from '@/lib/utils/format-ago';

const { Text } = Typography;

export const WHITELIST_QUERY_KEY = ['security-ip-whitelist'];

/**
 * Khối "IP được miễn khoá" (PLAN P3.5), nằm dưới tab "IP bị khoá". IP trong danh sách không bị khoá theo IP;
 * tài khoản (email) vẫn bị khoá như thường. Chỉ khớp đúng 1 địa chỉ, không CIDR.
 */
export const LoginIpWhitelistSection = () => {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const [ip, setIp] = useState('');
    const [note, setNote] = useState('');
    const [adding, setAdding] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: WHITELIST_QUERY_KEY,
        queryFn: () => securityApi.getIpWhitelist(),
        staleTime: 15_000,
    });

    const refreshAll = async () => {
        await queryClient.invalidateQueries({ queryKey: WHITELIST_QUERY_KEY });
        await queryClient.invalidateQueries({ queryKey: ['security-ip-blocks'] });
    };

    const handleAdd = async () => {
        const value = ip.trim();
        if (!value || adding) return;
        setAdding(true);
        try {
            const res = await securityApi.addIpWhitelist(value, note.trim());
            message.success(
                res.removedBlacklist ? `Đã thêm ${res.ip} vào whitelist và gỡ chặn chủ động` : res.clearedBlock ? `Đã thêm ${res.ip} và gỡ khoá hiện có` : `Đã thêm ${res.ip} vào whitelist`,
            );
            setIp('');
            setNote('');
            await refreshAll();
            await queryClient.invalidateQueries({ queryKey: ['security-ip-blacklist'] });
        } catch (err) {
            message.error(getApiErrorMessage(err, 'Thêm vào whitelist thất bại'));
        } finally {
            setAdding(false);
        }
    };

    const handleRemove = (record: IpWhitelistItem) => {
        modal.confirm({
            title: `Gỡ ${record.ip} khỏi whitelist?`,
            content: 'IP này sẽ lại bị tính bộ đếm và khoá theo IP như bình thường.',
            okText: 'Gỡ',
            okButtonProps: { danger: true },
            cancelText: 'Huỷ',
            onOk: async () => {
                try {
                    await securityApi.removeIpWhitelist(record.ip);
                    message.success(`Đã gỡ ${record.ip}`);
                    await refreshAll();
                } catch (err) {
                    message.error(getApiErrorMessage(err, 'Gỡ khỏi whitelist thất bại'));
                }
            },
        });
    };

    const columns: ColumnsType<IpWhitelistItem> = [
        { title: 'IP', dataIndex: 'ip', key: 'ip', render: (v: string, r) => <IpWithFlag ip={v} countryCode={r.countryCode} ipKind={r.ipKind} geoSource={r.geoSource} /> },
        { title: 'Ghi chú', dataIndex: 'note', key: 'note', render: (v: string | null) => v || '—' },
        { title: 'Người thêm', dataIndex: 'createdByName', key: 'createdByName', render: (v: string | null) => v || '—' },
        { title: 'Thêm lúc', dataIndex: 'createdAgoSeconds', key: 'createdAgoSeconds', render: (s: number) => formatAgo(s) },
        {
            title: 'Thao tác',
            key: 'action',
            render: (_: unknown, r) => (
                <Button danger icon={<DeleteOutlined />} onClick={() => handleRemove(r)}>
                    Gỡ
                </Button>
            ),
        },
    ];

    return (
        <Card size="small" title={<Space><SafetyOutlined />IP được miễn khoá</Space>}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Text type="secondary">
                    IP trong danh sách không bị khoá theo IP (vd văn phòng dùng chung 1 IP). Email/tài khoản vẫn bị khoá nếu sai mật khẩu quá ngưỡng.
                    Chỉ thêm IP bạn tin tưởng; chỉ khớp đúng 1 địa chỉ.
                </Text>
                <Space wrap>
                    <Input
                        style={{ width: 220 }}
                        placeholder="IP, vd 203.0.113.10"
                        value={ip}
                        onChange={(e) => setIp(e.target.value)}
                        onPressEnter={handleAdd}
                        maxLength={45}
                    />
                    <Input
                        style={{ width: 260 }}
                        placeholder="Ghi chú (vd Văn phòng HCM)"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onPressEnter={handleAdd}
                        maxLength={255}
                    />
                    <Button type="primary" icon={<PlusOutlined />} loading={adding} disabled={!ip.trim()} onClick={handleAdd}>
                        Thêm
                    </Button>
                    {data?.myIp && (
                        <Button onClick={() => setIp(data.myIp as string)}>Dùng IP hiện tại của tôi ({data.myIp})</Button>
                    )}
                </Space>
                <Table<IpWhitelistItem>
                    rowKey="id"
                    size="small"
                    loading={isLoading}
                    columns={columns}
                    dataSource={data?.items ?? []}
                    pagination={false}
                    locale={{ emptyText: 'Chưa có IP nào được miễn khoá' }}
                    scroll={{ x: 'max-content' }}
                />
            </Space>
        </Card>
    );
};
