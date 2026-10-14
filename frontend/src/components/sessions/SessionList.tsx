'use client';

import { Button, Empty, Popconfirm, Space, Spin, Tag, Typography } from 'antd';
import { DesktopOutlined, LogoutOutlined } from '@ant-design/icons';
import type { SessionView } from '@/lib/api/sessions.api';
import { formatAgo } from '@/lib/utils/format-ago';

const { Text } = Typography;

/**
 * Danh sách thiết bị đang đăng nhập (PLAN P5) - dùng chung cho Hồ sơ cá nhân và modal Admin.
 * `lastActiveAgoSeconds` chỉ cập nhật khi thiết bị làm mới token nên chính xác theo chu kỳ access token, không phải thời gian thực.
 * Không dùng antd `List` (đã deprecated) - render bằng div thuần.
 */
export function SessionList({
    sessions,
    loading,
    revokingId,
    onRevoke,
    allowRevoke = true,
}: {
    sessions: SessionView[];
    loading?: boolean;
    /** `id` phiên đang được thu hồi - khoá nút để không bấm đúp. */
    revokingId?: string | null;
    onRevoke: (session: SessionView) => void;
    allowRevoke?: boolean;
}) {
    return (
        <Spin spinning={!!loading}>
            {sessions.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có thiết bị nào đang đăng nhập" />
            ) : (
                <div>
                    {sessions.map((s) => (
                        <div
                            key={s.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 0',
                                borderBottom: '1px solid rgba(5,5,5,0.06)',
                            }}
                        >
                            <DesktopOutlined style={{ fontSize: 22, color: '#8c8c8c' }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <Space size={6} wrap>
                                    <Text strong>{s.device}</Text>
                                    {s.isCurrent && <Tag color="green" style={{ marginInlineEnd: 0 }}>Thiết bị này</Tag>}
                                </Space>
                                <div>
                                    <Space size={12} wrap style={{ color: 'rgba(0,0,0,0.45)' }}>
                                        <span>IP: {s.ip || '—'}</span>
                                        <span>Hoạt động: {formatAgo(s.lastActiveAgoSeconds)}</span>
                                        <span>Đăng nhập: {formatAgo(s.createdAgoSeconds)}</span>
                                    </Space>
                                </div>
                            </div>
                            {allowRevoke && (
                                <Popconfirm
                                    title="Đăng xuất thiết bị này?"
                                    description={s.isCurrent ? 'Bạn sẽ bị đăng xuất khỏi trình duyệt hiện tại.' : 'Thiết bị đó sẽ phải đăng nhập lại (trong khoảng 15 giây).'}
                                    okText="Đăng xuất"
                                    cancelText="Huỷ"
                                    okButtonProps={{ danger: true }}
                                    onConfirm={() => onRevoke(s)}
                                >
                                    <Button size="small" danger icon={<LogoutOutlined />} loading={revokingId === s.id} disabled={!!revokingId && revokingId !== s.id}>
                                        Đăng xuất
                                    </Button>
                                </Popconfirm>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </Spin>
    );
}
