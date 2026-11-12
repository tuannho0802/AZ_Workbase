'use client';

import { useMemo, useState } from 'react';
import { Alert, App, Button, Empty, List, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { CrownOutlined, LockOutlined } from '@ant-design/icons';
import type { AxiosError } from 'axios';
import type { Fanpage, FanpageUtmBlocked, FanpageUtmChip } from '@/lib/api/fanpages.api';
import { useSetFanpagePrimaryUtm, useSetFanpageUtms } from '@/lib/hooks/useFanpages';
import { useUsableUtms } from '@/lib/hooks/useUtms';

const { Text } = Typography;
const MAX_UTMS = 30;

interface Props {
    fanpage: Fanpage;
}

/** Tab "UTM" trong Drawer: gắn/gỡ UTM, xem Page chính / dùng chung, đổi Page chính (cảnh báo R9). Quyền theo `flags.canEdit` do BE tính. */
export function FanpageUtmsTab({ fanpage }: Props) {
    const { message, modal } = App.useApp();
    const chips: FanpageUtmChip[] = useMemo(() => fanpage.utms ?? [], [fanpage.utms]);
    const editable = fanpage.flags.canEdit && !fanpage.archivedAt;

    const [draft, setDraft] = useState<number[] | null>(null); // null = chưa chỉnh
    const [search, setSearch] = useState('');
    const { utms: usable, isFetching } = useUsableUtms(search || undefined, editable, false);
    const setUtms = useSetFanpageUtms();
    const setPrimary = useSetFanpagePrimaryUtm();

    const savedIds = useMemo(() => chips.map((c) => c.utmId), [chips]);
    const selected = draft ?? savedIds;
    const lockedIds = useMemo(() => new Set(chips.filter((c) => c.locked).map((c) => c.utmId)), [chips]);
    const dirty = draft != null && (draft.length !== savedIds.length || draft.some((id) => !savedIds.includes(id)));

    // Chip đã gắn nhưng không nằm trong danh sách "được dùng" (UTM khoá/hạn chế) vẫn phải hiện để người dùng thấy - nhưng disabled nếu locked.
    const options = useMemo(() => {
        const map = new Map<number, { value: number; label: React.ReactNode; disabled?: boolean; text: string }>();
        for (const u of usable) map.set(u.id, { value: u.id, label: <Tag color={u.color}>{u.name}</Tag>, text: u.name });
        for (const c of chips) {
            if (map.has(c.utmId)) continue;
            map.set(c.utmId, {
                value: c.utmId,
                label: c.locked ? (
                    <Text type="secondary">
                        <LockOutlined /> {c.name}
                    </Text>
                ) : (
                    <Tag color={c.color ?? undefined}>{c.name}</Tag>
                ),
                disabled: c.locked,
                text: c.name,
            });
        }
        return [...map.values()];
    }, [usable, chips]);

    const onChange = (ids: number[]) => {
        // Chip khoá không được gỡ: luôn giữ lại.
        const keep = [...lockedIds].filter((id) => !ids.includes(id));
        setDraft([...ids, ...keep].slice(0, MAX_UTMS));
    };

    const showBlocked = (blocked: FanpageUtmBlocked[]) =>
        modal.warning({
            title: 'Chưa thể gỡ Page chính',
            width: 520,
            content: (
                <Space orientation="vertical" size={8}>
                    <Text>UTM dưới đây còn Page khác dùng chung. Hãy mở Page đó và đặt làm Page chính trước, rồi mới gỡ Page này.</Text>
                    {blocked.map((b) => (
                        <div key={b.utmId}>
                            <Text strong>{b.utmName}</Text>
                            <div>
                                {b.otherPages.map((p) => (
                                    <Tag key={p.id}>{p.name}</Tag>
                                ))}
                            </div>
                        </div>
                    ))}
                </Space>
            ),
        });

    const save = async () => {
        if (!dirty || setUtms.isPending) return;
        try {
            await setUtms.mutateAsync({ id: fanpage.id, utmIds: selected });
            setDraft(null);
            message.success('Đã cập nhật UTM của Page');
        } catch (err) {
            const blocked = (err as AxiosError<{ blocked?: FanpageUtmBlocked[] }>).response?.data?.blocked;
            if (blocked?.length) showBlocked(blocked);
        }
    };

    const confirmPrimary = (chip: FanpageUtmChip) =>
        modal.confirm({
            title: `Đặt "${fanpage.name}" làm Page chính của UTM này?`,
            width: 520,
            content: (
                <Space orientation="vertical" size={4}>
                    <Text>
                        UTM: <Text strong>{chip.name}</Text>
                    </Text>
                    <Text type="warning">
                        Toàn bộ số khách và tiền nạp của UTM này (kể cả quá khứ) sẽ được ghi công cho Page này
                        {chip.primaryFanpage ? ` thay vì "${chip.primaryFanpage.name}"` : ''}. Page cũ chuyển thành Page tham gia.
                    </Text>
                </Space>
            ),
            okText: 'Đổi Page chính',
            cancelText: 'Huỷ',
            onOk: async () => {
                await setPrimary.mutateAsync({ id: fanpage.id, utmId: chip.utmId });
                message.success('Đã đổi Page chính');
            },
        });

    return (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Alert
                type="info"
                showIcon
                title="Mỗi UTM có tối đa 1 Page chính (ghi công khách & tiền). Page đầu tiên gắn UTM tự thành Page chính; các Page gắn sau là Page tham gia."
            />

            {editable ? (
                <Space orientation="vertical" style={{ width: '100%' }}>
                    <Select
                        mode="multiple"
                        allowClear
                        style={{ width: '100%' }}
                        placeholder="Chọn UTM gắn cho Page"
                        value={selected}
                        onChange={onChange}
                        loading={isFetching}
                        filterOption={false}
                        onSearch={setSearch}
                        onBlur={() => setSearch('')}
                        options={options.map((o) => ({ value: o.value, label: o.label, disabled: o.disabled }))}
                    />
                    <Space>
                        <Button type="primary" disabled={!dirty} loading={setUtms.isPending} onClick={save}>
                            Lưu
                        </Button>
                        {dirty && <Button onClick={() => setDraft(null)}>Hoàn tác</Button>}
                    </Space>
                </Space>
            ) : null}

            {chips.length === 0 ? (
                <Empty description="Page chưa gắn UTM nào — khách từ Page này sẽ chưa được quy kết" />
            ) : (
                <List
                    size="small"
                    bordered
                    dataSource={chips}
                    renderItem={(c) => (
                        <List.Item
                            actions={
                                editable && !c.isPrimary && !c.locked
                                    ? [
                                          <Button key="primary" size="small" loading={setPrimary.isPending} onClick={() => confirmPrimary(c)}>
                                              Đặt làm Page chính
                                          </Button>,
                                      ]
                                    : undefined
                            }
                        >
                            <Space orientation="vertical" size={2}>
                                <Space wrap>
                                    {c.locked ? (
                                        <Tooltip title="UTM hạn chế do người khác quản lý — bạn không gỡ/đổi được">
                                            <Tag icon={<LockOutlined />}>{c.name}</Tag>
                                        </Tooltip>
                                    ) : (
                                        <Tag color={c.color ?? undefined}>{c.name}</Tag>
                                    )}
                                    {c.isPrimary ? (
                                        <Tag icon={<CrownOutlined />} color="gold">
                                            Page chính
                                        </Tag>
                                    ) : (
                                        <Tag>Tham gia</Tag>
                                    )}
                                    {!c.isActive && <Tag color="default">UTM đã khoá</Tag>}
                                </Space>
                                {!c.isPrimary && c.primaryFanpage && (
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        Page chính: {c.primaryFanpage.name}
                                    </Text>
                                )}
                                {c.sharedWith.length > 0 && (
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        Dùng chung với: {c.sharedWith.map((p) => p.name).join(', ')}
                                    </Text>
                                )}
                            </Space>
                        </List.Item>
                    )}
                />
            )}
        </Space>
    );
}
