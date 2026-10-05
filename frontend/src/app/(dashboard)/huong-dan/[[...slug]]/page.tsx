'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { App, Alert, Button, Empty, Menu, Popconfirm, Skeleton, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import {
  useDeleteGuide,
  useGuideDetail,
  useGuideList,
  useGuideManageDetail,
  useGuideManageList,
} from '@/lib/hooks/useGuides';
import { GuideMarkdown } from '@/lib/guides/GuideMarkdown';
import { GuideAudienceTags } from '@/components/guides/GuideAudienceTags';
import { GuideEditorModal } from '@/components/guides/GuideEditorModal';
import { toastApiError } from '@/lib/utils/error-message.util';

const { Title, Text } = Typography;

/** Quyền quản trị Hướng dẫn - phải khớp GUIDES_MANAGE_PERMISSION ở BE. */
const GUIDES_MANAGE = 'guides.manage';

export default function GuidesPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const params = useParams<{ slug?: string[] }>();
  const slugParam = params?.slug?.[0] ? decodeURIComponent(params.slug[0]) : null;

  const { can, isLoading: permLoading } = useMyPermissions();
  const canManage = can(GUIDES_MANAGE);

  const publicList = useGuideList();
  const manageList = useGuideManageList(canManage);
  const deleteMutation = useDeleteGuide();

  const [editor, setEditor] = useState<{ open: boolean; guideId: number | null }>({ open: false, guideId: null });

  // Người quản trị thấy cả bản nháp -> dùng danh sách/chi tiết quản trị; người thường dùng endpoint công khai.
  const items = useMemo(
    () => (canManage ? manageList.guides : publicList.guides).map((g) => ({ ...g, isPublished: 'isPublished' in g ? g.isPublished : true })),
    [canManage, manageList.guides, publicList.guides],
  );
  const listLoading = permLoading || (canManage ? manageList.isLoading : publicList.isLoading);

  // Chưa chọn bài -> tự mở bài đầu tiên (không đổi URL, chỉ hiển thị).
  const activeSlug = slugParam ?? items[0]?.slug ?? null;
  const activeItem = items.find((g) => g.slug === activeSlug) ?? null;

  const publicDetail = useGuideDetail(canManage ? null : activeSlug);
  const manageDetail = useGuideManageDetail(canManage && activeItem ? activeItem.id : null);
  const detail = canManage ? manageDetail : publicDetail;
  const guide = detail.data;

  const goTo = (slug: string) => router.push(`/huong-dan/${encodeURIComponent(slug)}`);

  const handleDelete = async () => {
    if (!guide) return;
    try {
      await deleteMutation.mutateAsync(guide.id);
      message.success('Đã xoá hướng dẫn');
      router.replace('/huong-dan');
    } catch (err) {
      toastApiError(message, err, 'Không thể xoá hướng dẫn');
    }
  };

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <aside style={{ flex: '0 0 280px', maxWidth: '100%', background: '#fff', borderRadius: 8, padding: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}>
          <Text strong>Mục lục</Text>
          {canManage && (
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setEditor({ open: true, guideId: null })}>
              Tạo
            </Button>
          )}
        </div>
        {listLoading ? (
          <Skeleton active paragraph={{ rows: 5 }} style={{ padding: 12 }} />
        ) : items.length === 0 ? (
          <Empty description="Chưa có hướng dẫn nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Menu
            mode="inline"
            selectedKeys={activeSlug ? [activeSlug] : []}
            onClick={({ key }) => goTo(key)}
            style={{ border: 0 }}
            items={items.map((g) => ({
              key: g.slug,
              label: (
                <span>
                  {g.title}
                  {!g.isPublished && (
                    <Tag color="default" style={{ marginInlineStart: 6 }}>
                      Nháp
                    </Tag>
                  )}
                </span>
              ),
            }))}
          />
        )}
      </aside>

      <main style={{ flex: '1 1 480px', minWidth: 0, background: '#fff', borderRadius: 8, padding: 24 }}>
        {listLoading || (activeSlug && detail.isLoading) ? (
          <Skeleton active paragraph={{ rows: 10 }} />
        ) : !activeSlug ? (
          <Empty description="Chưa có hướng dẫn nào dành cho bạn" />
        ) : detail.isError || !guide ? (
          // 404 = nháp / sai role / đã xoá - BE cố ý không phân biệt.
          <Alert type="warning" showIcon title="Không tìm thấy hướng dẫn" description="Hướng dẫn này không tồn tại hoặc bạn không có quyền xem." />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  {guide.title}
                </Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Cập nhật: {dayjs(guide.updatedAt).format('HH:mm DD/MM/YYYY')}
                  {guide.updatedByName ? ` bởi ${guide.updatedByName}` : ''}
                </Text>
                {canManage && (
                  <div style={{ marginTop: 6 }}>
                    {!guide.isPublished && <Tag>Nháp</Tag>}
                    <GuideAudienceTags
                      roles={guide.roles}
                      positions={guide.positions}
                      departments={guide.departments}
                      excludedRoles={guide.excludedRoles}
                      excludedPositions={guide.excludedPositions}
                      excludedDepartments={guide.excludedDepartments}
                      requiredPermissions={guide.requiredPermissions}
                    />
                  </div>
                )}
              </div>
              {canManage && (
                <Space>
                  <Button icon={<EditOutlined />} onClick={() => setEditor({ open: true, guideId: guide.id })}>
                    Sửa
                  </Button>
                  <Popconfirm
                    title="Xoá hướng dẫn này?"
                    description="Bài sẽ bị xoá mềm; slug được giải phóng để dùng lại."
                    okText="Xoá"
                    cancelText="Huỷ"
                    okButtonProps={{ danger: true, loading: deleteMutation.isPending }}
                    onConfirm={handleDelete}
                  >
                    <Button danger icon={<DeleteOutlined />}>
                      Xoá
                    </Button>
                  </Popconfirm>
                </Space>
              )}
            </div>
            <GuideMarkdown content={guide.content} />
          </>
        )}
      </main>

      {canManage && (
        <GuideEditorModal
          open={editor.open}
          guideId={editor.guideId}
          onClose={() => setEditor({ open: false, guideId: null })}
          onSaved={goTo}
        />
      )}
    </div>
  );
}
