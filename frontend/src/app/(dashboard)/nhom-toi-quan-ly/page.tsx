'use client';

import { useMemo, useState } from 'react';
import { Table, Tag, Typography, Space, Button, Empty } from 'antd';
import { LinkOutlined, TeamOutlined, CrownOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useManagedByMe, useAllLinkGroups } from '@/lib/hooks/useLinkGroups';
import { GroupManagersModal } from '@/components/link-groups/GroupManagersModal';

const { Title, Text } = Typography;

export default function MyManagedLinkGroupsPage() {
  const currentUser = useAuthStore((s) => s.user);
  const { groups: managedGroups, isLoading } = useManagedByMe();
  // Chỉ để lấy thêm url/category cho hiển thị - GroupManagersResult (BE)
  // không trả url/category vì đó không phải dữ liệu của tính năng phân
  // quyền chính/phụ. Endpoint GET /link-groups mở cho mọi user đã đăng
  // nhập nên ghép thêm ở đây là an toàn.
  const { groups: allGroups, isLoading: loadingAll } = useAllLinkGroups();

  const [managingGroup, setManagingGroup] = useState<{ id: number; name: string } | null>(null);

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

      <Table
        rowKey="groupId"
        loading={isLoading || loadingAll}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        locale={{
          emptyText: (
            <Empty
              description={
                currentUser?.role === 'admin'
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