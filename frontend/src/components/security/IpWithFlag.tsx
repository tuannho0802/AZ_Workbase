'use client';

import { useState } from 'react';
import { App, Button, Modal, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { EditOutlined, HomeOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { securityApi } from '@/lib/api/security.api';
import { countryName, countryOptions } from '@/lib/utils/country';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { useCanEditIpCountry } from '@/lib/hooks/useCanEditIpCountry';

const { Text } = Typography;

export interface IpWithFlagProps {
    ip: string | null | undefined;
    countryCode?: string | null;
    ipKind?: 'public' | 'private';
    /** 'manual' -> hiện chấm nhỏ báo "Admin đã sửa tay". */
    geoSource?: string | null;
    /** Gọi sau khi sửa/xoá thành công để trang tự tải lại (trang dùng state cục bộ). Mặc định chỉ làm mới react-query. */
    onChanged?: () => void;
    /** Tắt nút sửa dù có quyền (vd khu vực chỉ để xem). */
    readOnly?: boolean;
}

/** Cờ quốc gia (flag-icons) — không dùng emoji vì Windows không vẽ cờ emoji. */
export function CountryFlag({ code }: { code: string }) {
    return <span className={`fi fi-${code.toLowerCase()}`} title={countryName(code)} style={{ borderRadius: 2 }} />;
}

/**
 * IP + cờ quốc gia (P3.6). IP nội bộ -> "Mạng nội bộ" (không sửa được); chưa rõ quốc gia -> "N/A" và, nếu có quyền,
 * nút bút chì để gán tay. Quốc gia lấy từ header Vercel, KHÔNG tra cứu ngoài nên IP chưa từng đi qua Vercel sẽ là N/A.
 */
export function IpWithFlag({ ip, countryCode, ipKind, geoSource, onChanged, readOnly }: IpWithFlagProps) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const canEdit = useCanEditIpCountry() && !readOnly;
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState<string | undefined>(countryCode ?? undefined);
    const [saving, setSaving] = useState(false);

    if (!ip) return <>-</>;
    const isPrivate = ipKind === 'private';
    const isManual = geoSource === 'manual';

    const refresh = async () => {
        await queryClient.invalidateQueries();
        onChanged?.();
    };

    const save = async () => {
        if (!value || saving) return;
        setSaving(true);
        try {
            await securityApi.setIpCountry(ip, value);
            message.success(`Đã gán ${countryName(value)} cho IP ${ip}`);
            setOpen(false);
            await refresh();
        } catch (err) {
            message.error(getApiErrorMessage(err, 'Gán quốc gia thất bại'));
        } finally {
            setSaving(false);
        }
    };

    const clearManual = async () => {
        if (saving) return;
        setSaving(true);
        try {
            await securityApi.clearIpCountry(ip);
            message.success('Đã xoá quốc gia gán tay');
            setOpen(false);
            await refresh();
        } catch (err) {
            message.error(getApiErrorMessage(err, 'Xoá quốc gia gán tay thất bại'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Space size={6} wrap={false} style={{ whiteSpace: 'nowrap' }}>
                {isPrivate ? (
                    <Tooltip title="IP mạng nội bộ — không thuộc quốc gia nào">
                        <Tag icon={<HomeOutlined />} style={{ marginInlineEnd: 0 }}>Nội bộ</Tag>
                    </Tooltip>
                ) : countryCode ? (
                    <Tooltip title={`${countryName(countryCode)}${isManual ? ' (Admin gán tay)' : ''}`}>
                        <span>
                            <CountryFlag code={countryCode} />
                            {isManual && <span style={{ color: '#faad14', marginLeft: 2, fontSize: 10 }}>●</span>}
                        </span>
                    </Tooltip>
                ) : (
                    <Tooltip title="Chưa xác định quốc gia (IP chưa đi qua Vercel)">
                        <Tag style={{ marginInlineEnd: 0 }}>N/A</Tag>
                    </Tooltip>
                )}
                <Text code>{ip}</Text>
                {canEdit && !isPrivate && (
                    <Tooltip title="Sửa quốc gia">
                        <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            aria-label={`Sửa quốc gia của ${ip}`}
                            onClick={() => { setValue(countryCode ?? undefined); setOpen(true); }}
                        />
                    </Tooltip>
                )}
            </Space>
            <Modal
                title={`Quốc gia của IP ${ip}`}
                open={open}
                onCancel={() => setOpen(false)}
                destroyOnHidden
                footer={
                    <Space>
                        {isManual && <Button danger onClick={clearManual} loading={saving}>Xoá bản gán tay</Button>}
                        <Button onClick={() => setOpen(false)}>Huỷ</Button>
                        <Button type="primary" onClick={save} loading={saving} disabled={!value || saving}>Lưu</Button>
                    </Space>
                }
            >
                <Select
                    showSearch
                    style={{ width: '100%' }}
                    placeholder="Chọn quốc gia"
                    value={value}
                    onChange={setValue}
                    options={countryOptions()}
                    optionFilterProp="label"
                />
                <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                    Giá trị gán tay được ưu tiên và không bị dữ liệu Vercel ghi đè. Thao tác được ghi vào nhật ký bảo mật.
                </Text>
            </Modal>
        </>
    );
}
