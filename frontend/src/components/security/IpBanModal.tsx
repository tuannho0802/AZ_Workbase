'use client';

import { useEffect, useState } from 'react';
import { Alert, App, Input, Modal, Select, Space, Typography } from 'antd';
import { securityApi } from '@/lib/api/security.api';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { DEFAULT_IP_BAN_DURATION, IP_BAN_DURATIONS } from './ipBanDurations';

const { Text } = Typography;

interface Props {
    open: boolean;
    /** IP cố định (nút "Chặn IP" trên dòng); `null` = cho nhập IP mới (khối blacklist). */
    ip: string | null;
    /** Lý do gợi ý điền sẵn (vd email đang dò). */
    defaultReason?: string;
    /** IP hiện tại của người thao tác — BE từ chối chặn IP này; FE báo trước. */
    myIp?: string | null;
    onClose: () => void;
    onDone: () => void | Promise<void>;
}

/**
 * Modal chặn IP chủ động (PLAN P3.7): chọn thời hạn + lý do, có cảnh báo IP dùng chung (văn phòng/CGNAT).
 * BE là nơi chặn thật (IP hiện tại/IP nội bộ -> 409); modal chỉ báo sớm cho IP hiện tại.
 */
export const IpBanModal = ({ open, ip, defaultReason, myIp, onClose, onDone }: Props) => {
    const { message } = App.useApp();
    const [value, setValue] = useState('');
    const [reason, setReason] = useState('');
    const [duration, setDuration] = useState(DEFAULT_IP_BAN_DURATION);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setValue(ip ?? '');
            setReason(defaultReason ?? '');
            setDuration(DEFAULT_IP_BAN_DURATION);
        }
    }, [open, ip, defaultReason]);

    const target = value.trim();
    const isSelf = !!myIp && target === myIp;

    const submit = async () => {
        if (!target || saving || isSelf) return;
        setSaving(true);
        try {
            const hours = IP_BAN_DURATIONS.find((d) => d.value === duration)?.hours ?? null;
            const res = await securityApi.addIpBlacklist(target, reason.trim(), hours);
            message.success(res.removedWhitelist ? `Đã chặn ${res.ip} (và gỡ khỏi whitelist)` : `Đã chặn ${res.ip}`);
            await onDone();
            onClose();
        } catch (err) {
            message.error(getApiErrorMessage(err, 'Chặn IP thất bại'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            title={ip ? `Chặn IP ${ip}?` : 'Chặn IP chủ động'}
            okText="Chặn IP"
            okButtonProps={{ danger: true, disabled: !target || isSelf }}
            cancelText="Huỷ"
            confirmLoading={saving}
            onOk={() => void submit()}
            onCancel={onClose}
            destroyOnHidden
        >
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <Alert
                    type="warning"
                    showIcon
                    title="IP bị chặn không đăng nhập/làm mới phiên được ngay, dù mật khẩu đúng. Nếu IP là mạng dùng chung (văn phòng, 4G/CGNAT) thì mọi người sau IP đó đều bị chặn — ưu tiên đặt thời hạn thay vì vĩnh viễn."
                />
                {!ip && (
                    <Input placeholder="IP, vd 203.0.113.10" value={value} onChange={(e) => setValue(e.target.value)} maxLength={45} />
                )}
                {isSelf && <Alert type="error" showIcon title="Đây là IP hiện tại của bạn — không thể tự chặn." />}
                <div>
                    <Text type="secondary">Thời hạn</Text>
                    <Select style={{ width: '100%' }} value={duration} onChange={setDuration} options={IP_BAN_DURATIONS.map((d) => ({ value: d.value, label: d.label }))} />
                </div>
                <div>
                    <Text type="secondary">Lý do (chỉ Admin thấy)</Text>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="vd Dò nhiều email" maxLength={255} />
                </div>
            </Space>
        </Modal>
    );
};
