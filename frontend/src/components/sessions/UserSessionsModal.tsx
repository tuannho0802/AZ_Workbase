'use client';

import { useCallback, useEffect, useState } from 'react';
import { App, Button, Modal, Popconfirm } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { sessionsApi, type SessionView } from '@/lib/api/sessions.api';
import { SessionList } from './SessionList';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';

/** Admin/Manager xem + đăng xuất thiết bị của 1 nhân viên (PLAN P5). BE (`users.manage` + canManageUser) là nơi chặn thật sự. */
export function UserSessionsModal({
    user,
    onClose,
    onChanged,
}: {
    user: { id: number; name: string } | null;
    onClose: () => void;
    /** Gọi sau khi thu hồi để trang tải lại cột "Số thiết bị". */
    onChanged?: () => void;
}) {
    const { message } = App.useApp();
    const [sessions, setSessions] = useState<SessionView[]>([]);
    const [loading, setLoading] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [revokingAll, setRevokingAll] = useState(false);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const res = await sessionsApi.listOfUser(user.id);
            setSessions(res.sessions);
        } catch (err) {
            message.error(getApiErrorMessage(err, 'Không tải được danh sách thiết bị'));
            setSessions([]);
        } finally {
            setLoading(false);
        }
    }, [user, message]);

    useEffect(() => {
        if (user) load();
        else setSessions([]);
    }, [user, load]);

    const handleRevoke = async (s: SessionView) => {
        if (!user || revokingId) return;
        setRevokingId(s.id);
        try {
            await sessionsApi.revokeOfUser(user.id, s.id);
            message.success('Đã đăng xuất thiết bị');
            await load();
            onChanged?.();
        } catch (err) {
            message.error(getApiErrorMessage(err, 'Đăng xuất thiết bị thất bại'));
            await load(); // phiên có thể đã hết hạn/đã bị thu hồi - làm mới danh sách
        } finally {
            setRevokingId(null);
        }
    };

    const handleRevokeAll = async () => {
        if (!user || revokingAll) return;
        setRevokingAll(true);
        try {
            await sessionsApi.revokeAllOfUser(user.id);
            message.success(`Đã đăng xuất mọi thiết bị của "${user.name}"`);
            await load();
            onChanged?.();
        } catch (err) {
            message.error(getApiErrorMessage(err, 'Đăng xuất mọi thiết bị thất bại'));
        } finally {
            setRevokingAll(false);
        }
    };

    return (
        <Modal
            open={!!user}
            title={user ? `Thiết bị đang đăng nhập - ${user.name}` : 'Thiết bị đang đăng nhập'}
            onCancel={onClose}
            destroyOnHidden
            footer={[
                <Button key="close" onClick={onClose}>
                    Đóng
                </Button>,
                <Popconfirm
                    key="all"
                    title="Đăng xuất mọi thiết bị của nhân viên này?"
                    okText="Đăng xuất tất cả"
                    cancelText="Huỷ"
                    okButtonProps={{ danger: true }}
                    onConfirm={handleRevokeAll}
                    disabled={sessions.length === 0}
                >
                    <Button danger icon={<LogoutOutlined />} loading={revokingAll} disabled={sessions.length === 0}>
                        Đăng xuất tất cả
                    </Button>
                </Popconfirm>,
            ]}
            width={640}
        >
            <SessionList sessions={sessions} loading={loading} revokingId={revokingId} onRevoke={handleRevoke} />
        </Modal>
    );
}
