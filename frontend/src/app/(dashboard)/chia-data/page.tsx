'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table, Card, Button, Select, Space, Tag, App, Typography, Input, Row, Col,
  Badge, Empty, Tooltip, Alert, Spin, Statistic,
} from 'antd';
import {
  SwapOutlined, ReloadOutlined, SearchOutlined, UserSwitchOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { assignmentsApi } from '@/lib/api/assignments.api';
import { usersApi } from '@/lib/api/users.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { Customer } from '@/lib/types/customer.types';
import { useDebounce } from '@/lib/hooks/useDebounce';
import dayjs from 'dayjs';

const { Text } = Typography;

const SOURCE_COLORS: Record<string, string> = {
  Facebook: 'blue', TikTok: 'magenta', Google: 'green',
  Instagram: 'purple', LinkedIn: 'cyan', Other: 'default',
};

export default function ChiaDataPage() {
  const { message } = App.useApp();
  const { user } = useAuthStore();

  // ─── State ────────────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [searchText, setSearchText]     = useState('');
  const debouncedSearch                  = useDebounce(searchText, 400);
  const [sourceOwnerId, setSourceOwnerId] = useState<number | undefined>();
  const [sourceFilter, setSourceFilter]   = useState<string | undefined>();

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [targetSalesIds, setTargetSalesIds]     = useState<number[]>([]);

  const [salesUsers, setSalesUsers] = useState<{ id: number; name: string; role: string }[]>([]);

  // ─── Fetch users ──────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    try {
      const data = await usersApi.getAllForSelect();
      setSalesUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[ChiaData] fetchUsers error:', err);
    }
  }, []);

  // ─── Fetch unassigned ─────────────────────────────────────────────────────
  const fetchUnassigned = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await assignmentsApi.getUnassigned({
        page,
        limit: pageSize,
        search: debouncedSearch || undefined,
        source: sourceFilter || undefined,
        creatorId: sourceOwnerId,  // filter by Data Owner (creator)
      });
      setCustomers(res?.data ?? []);
      setTotal(res?.total ?? 0);
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Không thể tải danh sách';
      setFetchError(errMsg);
      setCustomers([]);
      setTotal(0);
      console.error('[ChiaData] fetchUnassigned error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, sourceFilter, sourceOwnerId]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { fetchUnassigned(); }, [fetchUnassigned]);

  // ─── Bulk Assign ──────────────────────────────────────────────────────────
  const handleAssign = async () => {
    if (!selectedRowKeys.length) return message.warning('Vui lòng chọn ít nhất 1 khách hàng');
    if (!targetSalesIds.length)  return message.warning('Vui lòng chọn ít nhất 1 Sales nhận data');

    setAssigning(true);
    try {
      const result = await assignmentsApi.bulkAssign({
        customerIds: selectedRowKeys as number[],
        salesUserIds: targetSalesIds,
      });

      message.success(`✅ Đã chia ${result.updatedCount} lượt cho Sales thành công!`);
      setSelectedRowKeys([]);
      setTargetSalesIds([]);
      fetchUnassigned();
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Lỗi không xác định';
      message.error(`❌ Lỗi khi chia data: ${errMsg}`);
    } finally {
      setAssigning(false);
    }
  };

  // ─── Columns ──────────────────────────────────────────────────────────────
  const columns: ColumnsType<Customer> = useMemo(() => [
    {
      title: '#',
      key: 'stt',
      width: 52,
      align: 'center' as const,
      render: (_: any, __: any, i: number) => (page - 1) * pageSize + i + 1,
    },
    {
      title: 'Tên khách hàng',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string) => (
        <Text strong>{name || <Text type="secondary" italic>Ẩn danh</Text>}</Text>
      ),
    },
    {
      title: 'SĐT',
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
      render: (v: string) => v ?? <Text type="secondary" italic>Chưa có</Text>,
    },
    {
      title: 'Nguồn',
      dataIndex: 'source',
      key: 'source',
      width: 105,
      render: (src: string) => (
        <Tag color={SOURCE_COLORS[src] || 'default'}>{src || '—'}</Tag>
      ),
    },
    {
      title: 'Campaign',
      dataIndex: 'campaign',
      key: 'campaign',
      width: 130,
      ellipsis: true,
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Data Owner',
      key: 'owner',
      width: 150,
      render: (_: any, record: any) => {
        const creator = record.createdBy;
        return creator?.name ?? <Text type="secondary" italic>Hệ thống</Text>;
      },
    },
    {
      title: 'Ngày nhập',
      dataIndex: 'inputDate',
      key: 'inputDate',
      width: 110,
      render: (d: string) => d ? dayjs(d).format('DD/MM/YYYY') : '—',
    },
  ], [page, pageSize]);

  const canAssign = ['admin', 'manager'].includes(user?.role || '');

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Stats bar ── */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Card size="small" style={{ minWidth: 180 }}>
            <Statistic
              title="Chưa assign"
              value={total}
              prefix={<UserSwitchOutlined style={{ color: '#faad14' }} />}
              styles={{ content: { color: '#faad14', fontSize: 22 } }}
            />
          </Card>
        </Col>
        {selectedRowKeys.length > 0 && (
          <Col>
            <Card size="small" style={{ minWidth: 180, borderColor: '#52c41a' }}>
              <Statistic
                title="Đã chọn"
                value={selectedRowKeys.length}
                prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                styles={{ content: { color: '#52c41a', fontSize: 22 } }}
              />
            </Card>
          </Col>
        )}
      </Row>

      {/* ── Control Panel ── */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="bottom">
          {/* Sales đích */}
          <Col xs={24} sm={12} md={6}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>🎯 Chia cho Sales:</div>
            <Select
              mode="multiple"
              maxTagCount="responsive"
              style={{ width: '100%' }}
              placeholder="Chọn các Sales nhận data"
              value={targetSalesIds}
              onChange={setTargetSalesIds}
              showSearch
              optionFilterProp="label"
              options={salesUsers.map(u => ({ label: `${u.name} (${u.role})`, value: u.id }))}
            />
          </Col>

          {/* Lọc data owner */}
          <Col xs={24} sm={12} md={5}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>👤 Data Owner:</div>
            <Select
              style={{ width: '100%' }}
              placeholder="Tất cả"
              allowClear
              showSearch
              optionFilterProp="label"
              value={sourceOwnerId}
              onChange={(v) => { setSourceOwnerId(v); setPage(1); }}
              options={salesUsers.map(u => ({ label: u.name, value: u.id }))}
            />
          </Col>

          {/* Nguồn */}
          <Col xs={24} sm={12} md={4}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>📡 Nguồn:</div>
            <Select
              style={{ width: '100%' }}
              placeholder="Tất cả"
              allowClear
              value={sourceFilter}
              onChange={(v) => { setSourceFilter(v); setPage(1); }}
              options={[
                { value: 'Facebook', label: 'Facebook' },
                { value: 'TikTok', label: 'TikTok' },
                { value: 'Google', label: 'Google' },
                { value: 'Instagram', label: 'Instagram' },
                { value: 'LinkedIn', label: 'LinkedIn' },
                { value: 'Other', label: 'Khác' },
              ]}
            />
          </Col>

          {/* Tìm kiếm */}
          <Col xs={24} sm={12} md={5}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>🔍 Tìm kiếm:</div>
            <Input
              placeholder="Tên, SĐT..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
              allowClear
            />
          </Col>

          {/* Actions */}
          <Col xs={24} sm={12} md={4}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<ReloadOutlined />} onClick={fetchUnassigned} disabled={loading} />
              <Tooltip
                title={
                  !canAssign ? 'Chỉ Admin/Manager mới được chia data'
                    : !targetSalesIds.length ? 'Chọn Sales nhận data trước'
                    : !selectedRowKeys.length ? 'Chọn ít nhất 1 khách hàng'
                    : ''
                }
              >
                <Button
                  type="primary"
                  icon={<SwapOutlined />}
                  onClick={handleAssign}
                  loading={assigning}
                  disabled={!canAssign || !selectedRowKeys.length || !targetSalesIds.length}
                >
                  Chia {selectedRowKeys.length > 0 ? `(${selectedRowKeys.length})` : ''}
                </Button>
              </Tooltip>
            </div>
          </Col>
        </Row>

        {/* Preview banner */}
        {selectedRowKeys.length > 0 && targetSalesIds.length > 0 && (
          <Alert
            style={{ marginTop: 12 }}
            type="success"
            showIcon
            message={
              <span>
                Sẽ chia <strong>{selectedRowKeys.length} khách hàng</strong> cho{' '}
                <strong style={{ color: '#1890ff' }}>{targetSalesIds.length} Sales</strong>
              </span>
            }
          />
        )}
      </Card>

      {/* ── Table ── */}
      <Card
        title={
          <Space>
            <span>📋 Danh sách chưa được assign</span>
            <Badge count={total} showZero style={{ backgroundColor: '#faad14' }} />
          </Space>
        }
      >
        {fetchError && (
          <Alert
            type="error"
            showIcon
            closable
            message="Lỗi tải dữ liệu"
            description={fetchError}
            style={{ marginBottom: 12 }}
            onClose={() => setFetchError(null)}
            action={
              <Button size="small" onClick={fetchUnassigned}>Thử lại</Button>
            }
          />
        )}

        <Table
          rowSelection={
            canAssign
              ? {
                  selectedRowKeys,
                  onChange: (keys) => setSelectedRowKeys(keys),
                  preserveSelectedRowKeys: true,
                }
              : undefined
          }
          columns={columns}
          dataSource={customers}
          rowKey="id"
          loading={loading}
          size="middle"
          bordered
          locale={{
            emptyText: loading ? (
              <Spin description="Đang tải..." />
            ) : fetchError ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span>
                    Lỗi tải dữ liệu.{' '}
                    <Button type="link" onClick={fetchUnassigned} style={{ padding: 0 }}>
                      Thử lại
                    </Button>
                  </span>
                }
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="🎉 Tất cả khách hàng đã được assign"
              />
            ),
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `Tổng cộng ${t} khách hàng chưa assign`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Card>
    </div>
  );
}
