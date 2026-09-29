'use client';

import { useMemo, useState } from 'react';
import { Button, Card, Empty, Progress, Segmented, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MarketingUserRow } from '@/lib/types/reports.types';
import { filterUserRows, fmtCount, formatUsd, pct, rowRates, sumRows } from '@/lib/utils/marketingReport';
import ReportNameFilter from './ReportNameFilter';
import ReportUserName from './ReportUserName';
import { ReportDepartmentSelect } from './ReportUserSelect';
import { rateColor, rateTextColor } from '@/lib/utils/rateColor';
import type { CustomerDrill } from './ReportCustomersModal';

const { Text } = Typography;

type Dimension = 'marketing' | 'creator';

interface Props {
  marketing: MarketingUserRow[];
  creators: MarketingUserRow[];
  loading: boolean;
  activeMarketingId?: number;
  activeCreatorId?: number;
  /** Bấm "Lọc" ở 1 dòng -> áp bộ lọc ở tab cha (drill-down: mọi biểu đồ/KPI cùng lọc theo người đó). */
  /** Bấm 1 con số -> mở Mini Table khách đứng sau con số đó (đã kèm bộ lọc theo dòng được bấm). */
  onDrill: (drill: CustomerDrill) => void;
  onFilterMarketing: (userId: number) => void;
  onFilterCreator: (userId: number) => void;
}

/**
 * Bảng chi tiết theo "Marketing phụ trách" / "Người tạo data" - đủ mọi chỉ số + tỷ lệ,
 * có tìm tên, lọc theo phòng ban CỦA NHÂN VIÊN (vd chỉ phòng Marketing), ẩn dòng toàn 0,
 * và dòng tổng cuối bảng.
 */
export default function MarketingBreakdownTable({
  marketing,
  creators,
  loading,
  onDrill,
  activeMarketingId,
  activeCreatorId,
  onFilterMarketing,
  onFilterCreator,
}: Props) {
  const [dimension, setDimension] = useState<Dimension>('marketing');
  const [search, setSearch] = useState('');
  const [staffDepartmentId, setStaffDepartmentId] = useState<number | undefined>();
  const [hideEmpty, setHideEmpty] = useState(true);

  const source = dimension === 'marketing' ? marketing : creators;
  const activeId = dimension === 'marketing' ? activeMarketingId : activeCreatorId;
  const onFilter = dimension === 'marketing' ? onFilterMarketing : onFilterCreator;

  const departmentOptions = useMemo(() => {
    const map = new Map<number, { id: number; name: string; color?: string | null }>();
    for (const r of source) {
      if (r.departmentId != null && r.departmentName) {
        map.set(r.departmentId, { id: r.departmentId, name: r.departmentName, color: r.departmentColor });
      }
    }
    return [...map.values()];
  }, [source]);

  const rows = useMemo(
    () => filterUserRows(source, { search, staffDepartmentId, hideEmpty }),
    [source, search, staffDepartmentId, hideEmpty],
  );
  const totals = useMemo(() => sumRows(rows), [rows]);

  const nameLabel = dimension === 'marketing' ? 'Marketing phụ trách' : 'Người tạo data';


  /** Con số bấm được -> Mini Table khách của đúng dòng này (0 thì để chữ mờ, không bấm). */
  const drillCell = (v: number, r: MarketingUserRow, metric: CustomerDrill['metric'], strong = false) => {
    if (v <= 0) return <Text type="secondary">0</Text>;
    const preset = dimension === 'marketing' ? { marketingUserId: r.userId } : { createdById: r.userId };
    return (
      <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontWeight: strong ? 600 : undefined }} onClick={() => onDrill({ metric, label: r.userName, preset })}>
        {fmtCount(v)}
      </Button>
    );
  };

  const columns: ColumnsType<MarketingUserRow> = [
    {
      title: nameLabel,
      key: 'userName',
      fixed: 'left',
      width: 230,
      render: (_, r) => (
        <ReportUserName name={r.userName} departmentName={r.departmentName} departmentColor={r.departmentColor} muted={r.userId === 0} />
      ),
    },
    {
      title: (
        <Tooltip title="Data MỚI đổ về trong kỳ (theo ngày tạo).">Data mới</Tooltip>
      ),
      dataIndex: 'totalCustomers',
      key: 'totalCustomers',
      align: 'right',
      width: 100,
      render: (v: number, r) => drillCell(v, r, 'total'),
      sorter: (a, b) => a.totalCustomers - b.totalCustomers,
    },
    {
      title: <Tooltip title="Trạng thái Đã chốt và ngày chốt nằm trong kỳ.">Đã chốt</Tooltip>,
      dataIndex: 'closedCustomers',
      key: 'closedCustomers',
      align: 'right',
      width: 100,
      render: (v: number, r) => drillCell(v, r, 'closed'),
      sorter: (a, b) => a.closedCustomers - b.closedCustomers,
    },
    {
      title: <Tooltip title="Khách có ≥ 1 lượt join nhóm trong kỳ.">Join nhóm</Tooltip>,
      dataIndex: 'joinedGroupCustomers',
      key: 'joinedGroupCustomers',
      align: 'right',
      width: 100,
      render: (v: number, r) => drillCell(v, r, 'joined'),
      sorter: (a, b) => a.joinedGroupCustomers - b.joinedGroupCustomers,
    },
    {
      title: (
        <Tooltip title="Số KHÁCH có ≥ 1 khoản nạp trong kỳ (tính theo ngày nạp, bất kể khách được tạo lúc nào và Sales nào chăm).">
          Khách nạp
        </Tooltip>
      ),
      dataIndex: 'depositedCustomers',
      key: 'depositedCustomers',
      align: 'right',
      width: 110,
      render: (v: number, r) => drillCell(v, r, 'deposited', true),
      sorter: (a, b) => a.depositedCustomers - b.depositedCustomers,
    },
    {
      title: <Tooltip title="Tổng tiền nạp trong kỳ - quy về Marketing/Người tạo của khách, không phụ thuộc Sales.">Doanh thu</Tooltip>,
      dataIndex: 'revenue',
      key: 'revenue',
      align: 'right',
      width: 190,
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.revenue - b.revenue,
      render: (v: number) => {
        const share = pct(v, totals.revenue);
        return (
          <div>
            <Text strong style={{ color: v > 0 ? '#389e0d' : undefined }}>{formatUsd(v)}</Text>
            {share != null && v > 0 && (
              <Progress percent={share} size="small" showInfo={false} strokeColor="#52c41a" style={{ marginBottom: 0 }} />
            )}
          </div>
        );
      },
    },
    {
      title: (
        <Tooltip title="Trong số Data MỚI của kỳ, bao nhiêu khách đã từng nạp (bất kỳ lúc nào). Cùng nhóm khách nên luôn ≤ 100%.">
          Data mới đã nạp
        </Tooltip>
      ),
      key: 'cohortRate',
      width: 170,
      sorter: (a, b) => (rowRates(a).cohortDepositRate ?? -1) - (rowRates(b).cohortDepositRate ?? -1),
      render: (_, r) => {
        const rate = rowRates(r).cohortDepositRate;
        if (rate == null) return <Text type="secondary">—</Text>;
        return (
          <Tooltip title={`${fmtCount(r.cohortDepositedCustomers)} / ${fmtCount(r.totalCustomers)} khách`}>
            <Progress percent={rate} size="small" strokeColor={rateColor(rate)} />
          </Tooltip>
        );
      },
    },
    {
      title: <Tooltip title="Doanh thu ÷ Số khách nạp trong kỳ.">TB / khách nạp</Tooltip>,
      key: 'avg',
      align: 'right',
      width: 130,
      sorter: (a, b) => (rowRates(a).avgPerDepositor ?? -1) - (rowRates(b).avgPerDepositor ?? -1),
      render: (_, r) => {
        const avg = rowRates(r).avgPerDepositor;
        return avg == null ? <Text type="secondary">—</Text> : formatUsd(avg);
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      fixed: 'right',
      width: 100,
      render: (_, r) =>
        r.userId === activeId ? (
          <Tag color="blue">Đang lọc</Tag>
        ) : (
          <Button type="link" size="small" onClick={() => onFilter(r.userId)}>
            {r.userId === 0 ? 'Xem phần này' : 'Lọc'}
          </Button>
        ),
    },
  ];

  return (
    <Card size="small" title="Chi tiết theo nhân viên" styles={{ body: { padding: 16 } }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <Segmented<Dimension>
          value={dimension}
          onChange={setDimension}
          options={[
            { value: 'marketing', label: `Marketing phụ trách (${marketing.length})` },
            { value: 'creator', label: `Người tạo data (${creators.length})` },
          ]}
        />
        <ReportNameFilter value={search} onChange={setSearch} placeholder="Tìm theo tên..." />
        <ReportDepartmentSelect
          departments={departmentOptions}
          placeholder="Phòng ban của nhân viên"
          value={staffDepartmentId}
          onChange={setStaffDepartmentId}
        />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Switch size="small" checked={hideEmpty} onChange={setHideEmpty} />
          <Text type="secondary" style={{ fontSize: 12 }}>Ẩn dòng toàn 0</Text>
        </span>
      </div>

      <Table<MarketingUserRow>
        rowKey="userId"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1250 }}
        pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `${t} dòng` }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có dữ liệu trong kỳ với bộ lọc này" /> }}
        rowClassName={(r) => (r.userId === activeId ? 'ant-table-row-selected' : '')}
        summary={() =>
          rows.length === 0 ? null : (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>
                  <Text strong>Tổng ({rows.length} dòng)</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right"><Text strong>{fmtCount(totals.totalCustomers)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right"><Text strong>{fmtCount(totals.closedCustomers)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right"><Text strong>{fmtCount(totals.joinedGroupCustomers)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <Text strong>{fmtCount(totals.depositedCustomers)}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right"><Text strong>{formatUsd(totals.revenue)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={6}>
                  {(() => {
                    const rate = pct(totals.cohortDepositedCustomers, totals.totalCustomers);
                    return rate == null ? '—' : <Text strong style={{ color: rateTextColor(rate) }}>{rate}%</Text>;
                  })()}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right">
                  {totals.depositedCustomers > 0 ? <Text strong>{formatUsd(totals.revenue / totals.depositedCustomers)}</Text> : '—'}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} />
              </Table.Summary.Row>
            </Table.Summary>
          )
        }
      />
    </Card>
  );
}
