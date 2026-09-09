'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Card,
    Progress,
    Tabs,
    Row,
    Col,
    Image,
    Empty,
    Spin,
    Button,
    Upload,
    Popconfirm,
    App,
    Typography,
    Tag,
    InputNumber,
    Space,
    Tooltip,
} from 'antd';
import {
    InboxOutlined,
    DeleteOutlined,
    ReloadOutlined,
    EditOutlined,
    CheckOutlined,
    CloseOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import {
    STORAGE_BUCKET_KEYS,
    STORAGE_BUCKET_LABELS,
    StorageBucketKey,
    formatBytes,
} from '@/lib/api/storage.api';
import { validateImageFile } from '@/lib/api/uploads.api';
import {
    useStorageUsage,
    useUpdateStorageLimit,
    useStorageMedia,
    useDeleteMedia,
    useUploadMediaLibraryImage,
} from '@/lib/hooks/useStorage';

const { Text, Title } = Typography;

// FE-only cap để chặn upload ảnh khổng lồ vào media-library trước khi xin
// presign - không có setting riêng cho bucket này (khác avatar/đính kèm
// nghỉ phép), 5MB là mức hợp lý cho ảnh minh hoạ chung.
const MEDIA_LIBRARY_MAX_SIZE_KB = 5120;

// ── Usage bar ────────────────────────────────────────────────────────────────
function UsageBar({ canManage }: { canManage: boolean }) {
    const { usage, isLoading, refetch } = useStorageUsage();
    const updateLimit = useUpdateStorageLimit();
    const { message } = App.useApp();
    const [editing, setEditing] = useState(false);
    const [draftLimit, setDraftLimit] = useState<number>(50);

    const cache = usage?.cache;
    const softLimitGb = usage?.softLimitGb ?? 50;
    const totalUsedGb = (cache?.totalUsedBytes ?? 0) / 1024 ** 3;
    const percent = softLimitGb > 0 ? Math.min(100, Math.round((totalUsedGb / softLimitGb) * 100)) : 0;

    const handleSaveLimit = async () => {
        try {
            await updateLimit.mutateAsync(draftLimit);
            message.success('Đã cập nhật hạn mức');
            setEditing(false);
        } catch {
            message.error('Cập nhật hạn mức thất bại');
        }
    };

    return (
        <Card variant="outlined" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <Title level={5} style={{ margin: 0 }}>
                    Dung lượng đã dùng
                </Title>
                <Space>
                    {cache?.computedAt && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Cập nhật lúc {dayjs(cache.computedAt).format('HH:mm DD/MM/YYYY')}
                        </Text>
                    )}
                    <Tooltip title="Số liệu chỉ refresh theo lịch (cron), không phải real-time">
                        <Button size="small" icon={<ReloadOutlined />} onClick={() => refetch()} loading={isLoading} />
                    </Tooltip>
                </Space>
            </div>

            {isLoading ? (
                <Spin />
            ) : !cache ? (
                <Empty description="Chưa có dữ liệu (chờ lần refresh cron đầu tiên)" />
            ) : (
                <>
                    <Progress
                        percent={percent}
                        status={percent >= 100 ? 'exception' : percent >= 90 ? 'active' : 'normal'}
                        format={() => `${totalUsedGb.toFixed(2)} / ${softLimitGb} GB`}
                    />
                    <Row gutter={16} style={{ marginTop: 12 }}>
                        {STORAGE_BUCKET_KEYS.map((key) => {
                            const b = cache.buckets[key];
                            return (
                                <Col xs={24} sm={8} key={key}>
                                    <Card size="small" variant="borderless" style={{ background: '#fafafa' }}>
                                        <Text strong style={{ fontSize: 12 }}>{STORAGE_BUCKET_LABELS[key]}</Text>
                                        <div style={{ fontSize: 13 }}>{formatBytes(b?.usedBytes ?? 0)}</div>
                                        <Text type="secondary" style={{ fontSize: 12 }}>{b?.objectCount ?? 0} file</Text>
                                    </Card>
                                </Col>
                            );
                        })}
                    </Row>
                </>
            )}

            {canManage && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {editing ? (
                        <>
                            <Text style={{ fontSize: 12 }}>Hạn mức mềm (GB):</Text>
                            <InputNumber min={1} value={draftLimit} onChange={(v) => setDraftLimit(v ?? 1)} size="small" />
                            <Button size="small" type="primary" icon={<CheckOutlined />} loading={updateLimit.isPending} onClick={handleSaveLimit} />
                            <Button size="small" icon={<CloseOutlined />} onClick={() => setEditing(false)} />
                        </>
                    ) : (
                        <Button
                            size="small"
                            type="link"
                            icon={<EditOutlined />}
                            onClick={() => {
                                setDraftLimit(softLimitGb);
                                setEditing(true);
                            }}
                        >
                            Đổi hạn mức mềm
                        </Button>
                    )}
                </div>
            )}
        </Card>
    );
}

// ── Media grid cho 1 bucket ─────────────────────────────────────────────────
function MediaGrid({ bucket, canManage }: { bucket: StorageBucketKey; canManage: boolean }) {
    const { items, mutable, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useStorageMedia(bucket);
    const deleteMedia = useDeleteMedia(bucket);
    const uploadMedia = useUploadMediaLibraryImage();
    const { message } = App.useApp();

    const canDeleteHere = canManage && mutable;
    const canUploadHere = canManage && bucket === 'media-library';

    const handleUpload = async (file: File) => {
        const validationError = validateImageFile(file, MEDIA_LIBRARY_MAX_SIZE_KB);
        if (validationError) {
            message.error(validationError);
            return Upload.LIST_IGNORE;
        }
        try {
            await uploadMedia.mutateAsync(file);
            message.success('Đã thêm ảnh vào thư viện');
        } catch {
            message.error('Upload thất bại');
        }
        return false; // luôn chặn antd tự upload - đã tự PUT thẳng lên B2 ở trên
    };

    return (
        <div>
            {canUploadHere && (
                <Upload.Dragger
                    accept="image/jpeg,image/png,image/webp"
                    showUploadList={false}
                    beforeUpload={handleUpload}
                    disabled={uploadMedia.isPending}
                    style={{ marginBottom: 16 }}
                >
                    <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                    <p className="ant-upload-text">Kéo thả hoặc bấm để thêm ảnh vào thư viện chung</p>
                    <p className="ant-upload-hint" style={{ fontSize: 12 }}>JPEG/PNG/WEBP, tối đa {MEDIA_LIBRARY_MAX_SIZE_KB / 1024}MB</p>
                </Upload.Dragger>
            )}

            {!mutable && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                    Bucket này chỉ xem — object đang được tham chiếu trong dữ liệu thật (avatar/đính kèm nghỉ phép), không xoá qua trang này.
                </Text>
            )}

            {isLoading ? (
                <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : items.length === 0 ? (
                <Empty description="Chưa có file nào trong bucket này" />
            ) : (
                <Image.PreviewGroup>
                    <Row gutter={[12, 12]}>
                        {items.map((item) => (
                            <Col xs={12} sm={8} md={6} lg={4} key={item.key}>
                                <Card
                                    size="small"
                                    styles={{ body: { padding: 6 } }}
                                    cover={
                                        <Image
                                            src={item.viewUrl}
                                            alt={item.key}
                                            style={{ height: 110, objectFit: 'cover' }}
                                        />
                                    }
                                    actions={
                                        canDeleteHere
                                            ? [
                                                <Popconfirm
                                                    key="delete"
                                                    title="Xoá ảnh này khỏi thư viện?"
                                                    okButtonProps={{ danger: true, loading: deleteMedia.isPending }}
                                                    onConfirm={async () => {
                                                        try {
                                                            await deleteMedia.mutateAsync(item.key);
                                                            message.success('Đã xoá');
                                                        } catch {
                                                            message.error('Xoá thất bại');
                                                        }
                                                    }}
                                                >
                                                    <DeleteOutlined style={{ color: '#f5222d' }} />
                                                </Popconfirm>,
                                            ]
                                            : undefined
                                    }
                                >
                                    <Tooltip title={item.key}>
                                        <Text style={{ fontSize: 11 }} ellipsis>{item.key.split('/').pop()}</Text>
                                    </Tooltip>
                                    <div><Tag style={{ fontSize: 10 }}>{formatBytes(item.size)}</Tag></div>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                </Image.PreviewGroup>
            )}

            {hasNextPage && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <Button loading={isFetchingNextPage} onClick={() => fetchNextPage()}>Tải thêm</Button>
                </div>
            )}
        </div>
    );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function StorageImgPage() {
    const { can, isLoading: permissionsLoading } = useMyPermissions();
    const router = useRouter();
    const { message } = App.useApp();

    const canView = can('storage.view');
    const canManage = can('storage.manage');

    useEffect(() => {
        if (!permissionsLoading && !canView) {
            message.warning('Bạn không có quyền truy cập trang này');
            router.replace('/customers');
        }
    }, [permissionsLoading, canView]);

    const tabItems = useMemo(
        () =>
            STORAGE_BUCKET_KEYS.map((key) => ({
                key,
                label: STORAGE_BUCKET_LABELS[key],
                children: <MediaGrid bucket={key} canManage={canManage} />,
            })),
        [canManage],
    );

    if (permissionsLoading || !canView) {
        return (
            <div style={{ padding: 24, textAlign: 'center' }}>
                <Spin />
            </div>
        );
    }

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold" style={{ marginBottom: 16 }}>🗄️ Quản lý lưu trữ ảnh</h1>

            <UsageBar canManage={canManage} />

            <Card variant="outlined">
                <Tabs items={tabItems} defaultActiveKey="avatars" />
            </Card>
        </div>
    );
}