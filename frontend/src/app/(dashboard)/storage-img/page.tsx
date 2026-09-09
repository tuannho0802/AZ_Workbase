'use client';

import { useEffect, useMemo, useState, type Key } from 'react';
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
    Table,
    Segmented,
    Alert,
} from 'antd';
import {
    InboxOutlined,
    DeleteOutlined,
    ReloadOutlined,
    EditOutlined,
    CheckOutlined,
    CloseOutlined,
    ClearOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useCachedImage, buildImageCacheKey } from '@/lib/hooks/useCachedImage';
import {
    STORAGE_BUCKET_KEYS,
    STORAGE_BUCKET_LABELS,
    StorageBucketKey,
    StorageMediaItem,
    formatBytes,
} from '@/lib/api/storage.api';
import { validateImageFile } from '@/lib/api/uploads.api';
import {
    useStorageUsage,
    useUpdateStorageLimit,
    useRefreshStorageUsage,
    useStorageMedia,
    useDeleteMedia,
    useBulkDeleteMedia,
    useUploadMediaLibraryImage,
} from '@/lib/hooks/useStorage';

// 2 bucket được phép dọn hàng loạt ở tab "Dọn dẹp Media" - media-library đã
// có luồng xoá từng ảnh riêng ở tab của nó (chọn/thêm/xoá thủ công từng
// tấm), không cần bulk ở đây.
const CLEANUP_BUCKETS = ['avatars', 'leave-attachments'] as const satisfies readonly StorageBucketKey[];

const { Text, Title } = Typography;

// FE-only cap để chặn upload ảnh khổng lồ vào media-library trước khi xin
// presign - không có setting riêng cho bucket này (khác avatar/đính kèm
// nghỉ phép), 5MB là mức hợp lý cho ảnh minh hoạ chung.
const MEDIA_LIBRARY_MAX_SIZE_KB = 5120;

// ── Usage bar ────────────────────────────────────────────────────────────────
function UsageBar({ canManage }: { canManage: boolean }) {
    const { usage, isLoading, refetch } = useStorageUsage();
    const updateLimit = useUpdateStorageLimit();
    const refreshUsage = useRefreshStorageUsage();
    const { message } = App.useApp();
    const [editing, setEditing] = useState(false);
    const [draftLimit, setDraftLimit] = useState<number>(50);

    const cache = usage?.cache;
    const softLimitGb = usage?.softLimitGb ?? 50;
    const totalUsedGb = (cache?.totalUsedBytes ?? 0) / 1024 ** 3;
    const remainingGb = Math.max(0, softLimitGb - totalUsedGb);
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

    const handleForceRefresh = async () => {
        try {
            await refreshUsage.mutateAsync();
            message.success('Đã tính lại dung lượng thật từ B2');
        } catch {
            message.error('Tính lại thất bại - kiểm tra kết nối tới B2');
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
                  <Tooltip title="Đọc lại số đã tính sẵn (không tính lại từ B2)">
                      <Button size="small" icon={<ReloadOutlined />} onClick={() => refetch()} loading={isLoading} />
                  </Tooltip>
                  {canManage && (
                      <Tooltip title="Liệt kê + cộng dồn dung lượng THẬT từ B2 ngay lúc này (tốn Class C transaction, không tự động chạy)">
                          <Button size="small" onClick={handleForceRefresh} loading={refreshUsage.isPending}>
                              Tính lại ngay
                          </Button>
                      </Tooltip>
                  )}
              </Space>
          </div>

          {isLoading ? (
              <Spin />
          ) : !cache ? (
                  <Empty
                      description={
                          <>
                              Chưa có dữ liệu — server-cron bên ngoài (gọi `/api/storage-cron/refresh-usage`) chưa từng chạy lần nào.
                              {canManage && <div>Bấm &quot;Tính lại ngay&quot; ở trên để có số liệu ngay, không cần đợi cron.</div>}
                          </>
                      }
                  />
              ) : (
                  <>
                      <Progress
                          percent={percent}
                          status={percent >= 100 ? 'exception' : percent >= 90 ? 'active' : 'normal'}
                          format={() => `${totalUsedGb.toFixed(2)} / ${softLimitGb} GB`}
                      />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                              Còn lại: <Text strong style={{ fontSize: 12 }}>{remainingGb.toFixed(2)} GB</Text> ({Math.max(0, 100 - percent)}% hạn mức mềm)
                          </Text>
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

// ── 1 ảnh trong MediaGrid - cache theo `key` ổn định (bucket + key = danh
// tính duy nhất của object trên B2), tránh tải lại mỗi lần danh sách
// refetch dù `viewUrl` (presigned GET, ký lại mỗi lần) đổi liên tục.
function CachedMediaCover({ bucket, item }: { bucket: StorageBucketKey; item: StorageMediaItem }) {
    const cachedSrc = useCachedImage(buildImageCacheKey(bucket, item.key), item.viewUrl);
    return (
        <Image
            src={cachedSrc || item.viewUrl}
            alt={item.key}
            style={{ height: 110, objectFit: 'cover' }}
        />
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
                                      <CachedMediaCover bucket={bucket} item={item} />
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

// ── Thumbnail nhỏ (bảng Dọn dẹp) - cùng cơ chế cache với CachedMediaCover,
// tách riêng vì kích thước/khung khác (40x40 trong Table thay vì cover Card).
function CachedMediaThumb({ bucket, item }: { bucket: StorageBucketKey; item: StorageMediaItem }) {
    const cachedSrc = useCachedImage(buildImageCacheKey(bucket, item.key), item.viewUrl);
    return (
        <Image
            src={cachedSrc || item.viewUrl}
            alt={item.key}
            width={40}
            height={40}
            style={{ objectFit: 'cover', borderRadius: 4 }}
        />
    );
}

// ── Dọn dẹp Media (bulk selection + xoá hàng loạt cho Avatar / Nghỉ phép) ──────
function MediaCleanupPanel({ bucket }: { bucket: (typeof CLEANUP_BUCKETS)[number] }) {
    const { items, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useStorageMedia(bucket);
    const bulkDelete = useBulkDeleteMedia(bucket);
    const { message, modal } = App.useApp();
    const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);

    // Danh sách hiện tại thay đổi (đổi bucket, tải thêm trang, xoá xong) ->
    // bỏ chọn các key không còn nằm trong `items` để tránh giữ selection ma.
    useEffect(() => {
        setSelectedKeys((prev) => prev.filter((k) => items.some((it) => it.key === k)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items.length, bucket]);

    const handleBulkDelete = () => {
        const keys = selectedKeys as string[];
        modal.confirm({
            title: `Xoá ${keys.length} file đã chọn?`,
            content: 'Hành động này xoá file thật trên B2 và không thể hoàn tác.',
            okButtonProps: { danger: true },
            okText: 'Xoá',
            cancelText: 'Huỷ',
            onOk: async () => {
                try {
                    const result = await bulkDelete.mutateAsync(keys);
                    setSelectedKeys([]);
                    if (result.failed.length === 0) {
                        message.success(`Đã xoá ${result.succeeded.length} file`);
                    } else {
                        message.warning(
                            `Xoá thành công ${result.succeeded.length}/${keys.length} file, ${result.failed.length} file lỗi`,
                        );
                    }
                } catch {
                    message.error('Xoá hàng loạt thất bại - kiểm tra kết nối');
                }
            },
        });
    };

    const columns: ColumnsType<StorageMediaItem> = [
        {
            title: '',
            dataIndex: 'viewUrl',
            width: 64,
            render: (_viewUrl: string, record) => <CachedMediaThumb bucket={bucket} item={record} />,
        },
        {
            title: 'Tên file',
            dataIndex: 'key',
            ellipsis: true,
            render: (key: string) => (
                <Tooltip title={key}>
                    <Text style={{ fontSize: 13 }}>{key.split('/').pop()}</Text>
                </Tooltip>
            ),
        },
        {
            title: 'Dung lượng',
            dataIndex: 'size',
            width: 110,
            sorter: (a, b) => a.size - b.size,
            render: (size: number) => formatBytes(size),
        },
        {
            title: 'Cập nhật lúc',
            dataIndex: 'lastModified',
            width: 160,
            render: (lastModified: string | null) =>
                lastModified ? dayjs(lastModified).format('HH:mm DD/MM/YYYY') : '-',
        },
    ];

    return (
        <div>
            <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                title="Xoá file ở đây sẽ dọn luôn dữ liệu liên quan (bỏ avatar khỏi hồ sơ nhân viên / xoá đính kèm khỏi đơn nghỉ phép) trước khi xoá file thật trên B2."
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>
                    Đã chọn {selectedKeys.length} / {items.length} file đang tải
                </Text>
                <Space>
                    {selectedKeys.length > 0 && (
                        <Button size="small" icon={<ClearOutlined />} onClick={() => setSelectedKeys([])}>
                            Bỏ chọn
                        </Button>
                    )}
                    <Button
                        danger
                        type="primary"
                        size="small"
                        icon={<DeleteOutlined />}
                        disabled={selectedKeys.length === 0}
                        loading={bulkDelete.isPending}
                        onClick={handleBulkDelete}
                    >
                        Xoá đã chọn ({selectedKeys.length})
                    </Button>
                </Space>
            </div>

            <Table<StorageMediaItem>
                rowKey="key"
                size="small"
                columns={columns}
                dataSource={items}
                loading={isLoading}
                pagination={false}
                rowSelection={{
                    selectedRowKeys: selectedKeys,
                    onChange: setSelectedKeys,
                }}
                locale={{ emptyText: <Empty description="Chưa có file nào trong bucket này" /> }}
            />

            {hasNextPage && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <Button loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
                        Tải thêm
                    </Button>
                </div>
            )}
        </div>
    );
}

function MediaCleanupTab() {
    const [bucket, setBucket] = useState<(typeof CLEANUP_BUCKETS)[number]>('avatars');

    return (
        <div>
            <Segmented
                options={CLEANUP_BUCKETS.map((key) => ({ label: STORAGE_BUCKET_LABELS[key], value: key }))}
                value={bucket}
                onChange={(v) => setBucket(v as (typeof CLEANUP_BUCKETS)[number])}
                style={{ marginBottom: 16 }}
            />
            <MediaCleanupPanel key={bucket} bucket={bucket} />
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
        () => [
            ...STORAGE_BUCKET_KEYS.map((key) => ({
                key,
                label: STORAGE_BUCKET_LABELS[key],
                children: <MediaGrid bucket={key} canManage={canManage} />,
            })),
            ...(canManage
                ? [
                    {
                        key: 'cleanup',
                        label: '🧹 Dọn dẹp Media',
                        children: <MediaCleanupTab />,
                    },
                ]
                : []),
        ],
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