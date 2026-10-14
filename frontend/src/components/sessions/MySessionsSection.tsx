'use client';

import { useCallback, useEffect, useState } from 'react';
import { App, Button, Popconfirm, Space } from 'antd';
import { LogoutOutlined, ReloadOutlined } from '@ant-design/icons';
import { sessionsApi, type SessionView } from '@/lib/api/sessions.api';
import { SessionList } from './SessionList';
import { useAuthStore } from '@/lib/stores/auth.store';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';

/**
 * "Thiết bị đang đăng nhập" của CHÍNH MÌNH (PLAN P5). Chỉ gắn ở hồ sơ của mình (isSelf).
 * Đăng xuất chính thiết bị hiện tại -> xoá phiên cục bộ rồi về /login (không gọi /auth/logout: BE đã thu hồi đúng phiên đó).
 */
export function MySessionsSection() {
    const { message } = App.useApp();
    const [sessions, setSessions] = useState<SessionView[]>([]);
    const [currentSid, setCurrentSid] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [revokingOthers, setRevokingOthers] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await sessionsApi.listMine();
            setSessions(res.sessions);
            setCurrentSid(res.currentSid);
        } catch (err) {
            message.error(getApiErrorMessage(err, 'Không tải được danh sách thiết bị'));
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => {
        load();
    }, [load]);

    const handleRevoke = async (s: SessionView) => {
        if (revokingId) return;
        setRevokingId(s.id);
        try {
            const res = await sessionsApi.revokeMine(s.id);
            if (res.loggedOutCurrent) {
                useAuthStore.getState().logoutLocal();
                window.location.href = '/login';
                return;
            }
            message.success('Đã đăng xuất thiết bị');
            await load();
        } catch (err) {
            message.error(getApiErrorMessage(err, 'Đăng xuất thiết bị thất bại'));
        } finally {
            setRevokingId(null);
        }
    };

    const handleRevokeOthers = async () => {
        if (revokingOthers) return;
        setRevokingOthers(true);
        try {
            const res = await sessionsApi.revokeMyOthers();
            message.success(res.removed > 0 ? `Đã đăng xuất ${res.removed} thiết bị khác` : 'Không có thiết bị khác để đăng xuất');
            await load();
        } catch (err) {
            message.error(getApiErrorMessage(err, 'Đăng xuất các thiết bị khác thất bại'));
        } finally {
            setRevokingOthers(false);
        }
    };

    // Token cũ chưa có sid (đăng nhập trước khi có P5) -> BE từ chối "đăng xuất thiết bị khác"; ẩn nút thay vì để báo lỗi.
    const canRevokeOthers = !!currentSid && sessions.some((s) => !s.isCurrent);

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <Space>
                    <Button size="small" icon={<ReloadOutlined />} onClick={load} loading={loading}>
                        Tải lại
                    </Button>
                    {canRevokeOthers && (
                        <Popconfirm
                            title="Đăng xuất mọi thiết bị khác?"
                            description="Thiết bị hiện tại được giữ nguyên."
                            okText="Đăng xuất"
                            cancelText="Huỷ"
                            okButtonProps={{ danger: true }}
                            onConfirm={handleRevokeOthers}
                        >
                            <Button size="small" danger icon={<LogoutOutlined />} loading={revokingOthers}>
                                Đăng xuất thiết bị khác
                            </Button>
                        </Popconfirm>
                    )}
                </Space>
            </div>
            <SessionList sessions={sessions} loading={loading} revokingId={revokingId} onRevoke={handleRevoke} />
        </div>
    );
}
