'use client';

import { useCallback, useEffect, useState } from 'react';
import { App, Button, Popconfirm, Space } from 'antd';
import { LogoutOutlined, ReloadOutlined } from '@ant-design/icons';
import { sessionsApi, type SessionView } from '@/lib/api/sessions.api';
import { SessionList } from './SessionList';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';

/**
 * "Thiết bị đang đăng nhập" của NGƯỜI KHÁC, hiện ngay trong Profile (cần `users.sessions`).
 * Cùng API/logic với `UserSessionsModal` ở trang Nhân viên; BE (`users.sessions` + scope + canManageUser) mới là nơi chặn thật sự.
 */
export function UserSessionsSection({ userId, userName }: { userId: number; userName: string }) {
    const { message } = App.useApp();
    const [sessions, setSessions] = useState<SessionView[]>([]);
    const [loading, setLoading] = useState(true);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [revokingAll, setRevokingAll] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await sessionsApi.listOfUser(userId);
            setSessions(res.sessions);
        } catch (err) {
            message.error(getApiErrorMessage(err, 'Không tải được danh sách thiết bị'));
            setSessions([]);
        } finally {
            setLoading(false);
        }
    }, [userId, message]);

    useEffect(() => {
        load();
    }, [load]);

    const handleRevoke = async (s: SessionView) => {
        if (revokingId) return;
        setRevokingId(s.id);
        try {
            await sessionsApi.revokeOfUser(userId, s.id);
            message.success('Đã đăng xuất thiết bị');
            await load();
        } catch (err) {
            message.error(getApiErrorMessage(err, 'Đăng xuất thiết bị thất bại'));
            await load(); // phiên có thể đã hết hạn/đã bị thu hồi - làm mới danh sách
        } finally {
            setRevokingId(null);
        }
    };

    const handleRevokeAll = async () => {
        if (revokingAll) return;
        setRevokingAll(true);
        try {
            await sessionsApi.revokeAllOfUser(userId);
            message.success(`Đã đăng xuất mọi thiết bị của "${userName}"`);
            await load();
        } catch (err) {
            message.error(getApiErrorMessage(err, 'Đăng xuất mọi thiết bị thất bại'));
        } finally {
            setRevokingAll(false);
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <Space>
                    <Button size="small" icon={<ReloadOutlined />} onClick={load} loading={loading}>
                        Tải lại
                    </Button>
                    <Popconfirm
                        title="Đăng xuất mọi thiết bị của nhân viên này?"
                        okText="Đăng xuất tất cả"
                        cancelText="Huỷ"
                        okButtonProps={{ danger: true }}
                        onConfirm={handleRevokeAll}
                        disabled={sessions.length === 0}
                    >
                        <Button size="small" danger icon={<LogoutOutlined />} loading={revokingAll} disabled={sessions.length === 0}>
                            Đăng xuất tất cả
                        </Button>
                    </Popconfirm>
                </Space>
            </div>
            <SessionList sessions={sessions} loading={loading} revokingId={revokingId} onRevoke={handleRevoke} />
        </div>
    );
}
