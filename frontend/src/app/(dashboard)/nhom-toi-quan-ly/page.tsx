'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table, Tag, Typography, Space, Button, Empty, App } from 'antd';
import { LinkOutlined, TeamOutlined, CrownOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useManagedByMe, useAllLinkGroups } from '@/lib/hooks/useLinkGroups';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { GroupManagersModal } from '@/components/link-groups/GroupManagersModal';
import { ListFilterBar } from '@/components/common/ListFilterBar';
import { resolveEntityColor } from '@/lib/utils/entityColor';

const { Title, Text } = Typography;

export default function MyManagedLinkGroupsPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const currentUser = useAuthStore((s) => s.user);
  const { can, isLoading: permissionsLoading } = useMyPermissions();
  const { groups: managedGroups, isLoading } = useManagedByMe();
  // Chỉ để lấy thêm url/category cho hiển thị - GroupManagersResult (BE)
  // không trả url/category vì đó không phải dữ liệu của tính năng phân
  // quyền chính/phụ. Endpoint GET /link-groups mở cho mọi user đã đăng
  // nhập nên ghép thêm ở đây là an toàn.
  const { groups: allGroups, isLoading: loadingAll } = useAllLinkGroups();

  // ⚠️ MỚI - trước đây trang này KHÔNG có route guard nào (mở cho MỌI role
  // đã đăng nhập, kể cả khi Admin đã tắt permission qua /phan-quyen) - khác
  // với mọi trang khác trong app đều tự chặn theo `useMyPermissions()`. Fix
  // khớp `permission: 'link_groups.my_managed'` mới thêm ở nav-config.tsx.
  useEffect(() => {
    if (!permissionsLoading && !can('link_groups.my_managed')) {
      message.warning('Bạn không có quyền truy cập trang này');
      router.replace('/');
    }
  }, [permissionsLoading, can, router, message]);

  const [managingGroup, setManagingGroup] = useState<{ id: number; name: string } | null>(null);

  // Search/filter CLIENT-SIDE: danh sách chỉ chứa nhóm mà chính user này
  // quản lý (chính hoặc phụ) - BOUNDED, không phân trang thật ở BE, giống
  // các trang danh mục khác (dùng chung `ListFilterBar`).
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | undefined>();
  const [filterRole, setFilterRole] = useState<'primary' | 'secondary' | undefined>();

  const rows = useMemo(() => {
    const byId = new Map(allGroups.map((g) => [g.id, g]));
    return managedGroups.map((mg) => {
      const detail = byId.get(mg.groupId);
      const isMePrimary = mg.primaryManager?.id === currentUser?.id;
      return {
        ...mg,
        url: detail?.url,
        categoryName: detail?.category?.name,
        categoryColor: detail?.category?.color,
        myRole: isMePrimary ? 'primary' : ('secondary' as 'primary' | 'secondary'),
      };
    });
  }, [managedGroups, allGroups, currentUser]);

  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string | undefined>();
    rows.forEach((r) => {
      if (r.categoryName) seen.set(r.categoryName, r.categoryColor);
    });
    return Array.from(seen, ([name, color]) => ({
      value: name,
      label: <Tag color={resolveEntityColor(color)} style={{ marginInlineEnd: 0 }}>{name}</Tag>,
    }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.groupName.toLowerCase().includes(q) && !(r.url || '').toLowerCase().includes(q)) return false;
      if (filterCategory && r.categoryName !== filterCategory) return false;
      // Admin luôn hiện "Admin" ở cột Vai trò (không phải primary/secondary
      // thật) - filter theo Vai trò chỉ có ý nghĩa với user thường.
      if (filterRole && currentUser?.role !== 'admin' && r.myRole !== filterRole) return false;
      return true;
    });
  }, [rows, searchText, filterCategory, filterRole, currentUser]);

  const columns = [
    {
      title: 'Nền tảng',
      key: 'category',
      width: 120,
      render: (_: unknown, row: (typeof rows)[number]) =>
        row.categoryName ? <Tag color={row.categoryColor}>{row.categoryName}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Tên nhóm',
      dataIndex: 'groupName',
      key: 'groupName',
    },
    {
      title: 'URL',
      key: 'url',
      render: (_: unknown, row: (typeof rows)[number]) =>
        row.url ? (
          <a href={row.url} target="_blank" rel="noopener noreferrer">
            <LinkOutlined /> {row.url}
          </a>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Quản lý chính',
      key: 'primaryManager',
      width: 160,
      render: (_: unknown, row: (typeof rows)[number]) =>
        row.primaryManager ? (
          <Text>{row.primaryManager.name}</Text>
        ) : (
          <Text type="secondary">Chưa gán</Text>
        ),
    },
    {
      title: 'Quản lý phụ',
      key: 'secondaryManagers',
      render: (_: unknown, row: (typeof rows)[number]) =>
        row.secondaryManagers.length > 0 ? (
          <Space size={4} wrap>
            {row.secondaryManagers.map((m) => (
              <Tag key={m.id}>{m.name}</Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">Chưa có</Text>
        ),
    },
    {
      title: 'Vai trò của tôi',
      key: 'myRole',
      width: 140,
      render: (_: unknown, row: (typeof rows)[number]) => {
        if (currentUser?.role === 'admin') return <Tag color="purple">Admin</Tag>;
        return row.myRole === 'primary' ? (
          <Tag color="gold" icon={<CrownOutlined />}>
            Quản lý chính
          </Tag>
        ) : (
          <Tag color="blue">Quản lý phụ</Tag>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 130,
      render: (_: unknown, row: (typeof rows)[number]) => (
        <Button
          size="small"
          icon={<TeamOutlined />}
          onClick={() => setManagingGroup({ id: row.groupId, name: row.groupName })}
        >
          Quản lý
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          Nhóm tôi quản lý
        </Title>
        <Text type="secondary">
          {currentUser?.role === 'admin'
            ? 'Bạn đang xem với quyền admin - hiển thị TẤT CẢ nhóm liên kết trong hệ thống.'
            : 'Chỉ hiển thị nhóm mà bạn được gán làm Quản lý chính hoặc Quản lý phụ. Quản lý chính có quyền thêm/xoá Quản lý phụ của nhóm mình.'}
        </Text>
      </div>

      <ListFilterBar
        searchValue={searchText}
        onSearchChange={setSearchText}
        searchPlaceholder="Tìm theo tên nhóm/URL..."
        dropdowns={[
          {
            key: 'category',
            placeholder: 'Nền tảng',
            value: filterCategory,
            onChange: setFilterCategory,
            options: categoryOptions,
          },
          {
            key: 'role',
            placeholder: 'Vai trò của tôi',
            value: filterRole,
            onChange: setFilterRole,
            options: [
              {
                value: 'primary',
                label: (
                  <Tag color="gold" icon={<CrownOutlined />} style={{ marginInlineEnd: 0 }}>
                    Quản lý chính
                  </Tag>
                ),
              },
              { value: 'secondary', label: <Tag color="blue" style={{ marginInlineEnd: 0 }}>Quản lý phụ</Tag> },
            ],
          },
        ]}
      />

      <Table
        rowKey="groupId"
        loading={isLoading || loadingAll}
        columns={columns}
        dataSource={filteredRows}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        locale={{
          emptyText: (
            <Empty
              description={
                searchText || filterCategory || filterRole
                  ? 'Không tìm thấy nhóm nào khớp bộ lọc'
                  : currentUser?.role === 'admin'
                  ? 'Chưa có nhóm liên kết nào trong hệ thống'
                  : 'Bạn chưa được gán làm Quản lý chính hoặc phụ của nhóm nào - liên hệ admin nếu cần được gán'
              }
            />
          ),
        }}
      />

      <GroupManagersModal
        open={!!managingGroup}
        onClose={() => setManagingGroup(null)}
        groupId={managingGroup?.id ?? null}
        groupName={managingGroup?.name}
      />
    </div>
  );
}