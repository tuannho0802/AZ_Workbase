'use client';

import { useMemo, useState } from 'react';
import { Card, Statistic, Row, Col, Typography, Alert, Select, Progress, Tag, Space } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useCustomerQualityReport } from '@/lib/hooks/useReports';
import { ReportQuery, QualityStatusMeta } from '@/lib/types/reports.types';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { ReportSection } from './ReportSection';
import PeriodSelector from './PeriodSelector';
import ReportNameFilter from './ReportNameFilter';

const { Title, Text } = Typography;

const formatCount = (value: number) => value.toLocaleString('vi-VN');

const percentOf = (count: number, total: number) => (total > 0 ? Math.round((count / total) * 1000) / 10 : 0);

/** Màu Progress theo tỉ lệ - xanh (tốt) -> vàng (trung bình) -> đỏ (thấp),
 * dùng CHUNG cho mọi status được chọn làm "chỉ số chất lượng chính" (không
 * hardcode riêng cho status 'closed' vì danh sách status là ĐỘNG, Admin có
 * thể đổi tên/thêm status bất kỳ lúc nào - xem customer-status.entity.ts). */
function progressColor(pct: number): string {
  if (pct >= 60) return '#52c41a';
  if (pct >= 30) return '#faad14';
  return '#f5222d';
}

interface Props {
  query: ReportQuery;
  onQueryChange: (next: ReportQuery) => void;
}

/**
 * Dùng CHUNG cho cả 2 bảng (Cá nhân/Phòng ban) sau khi "làm phẳng" byStatus
 * thành field top-level (mỗi status code -> 1 field số riêng) để `ReportChart`
 * (đọc dataKey PHẲNG, không hỗ trợ path lồng) vẽ được trực tiếp - xem
 * `flattenRow()`. `byStatus`/`total` VẪN giữ nguyên (không xoá) để các cột
 * bảng/sorter trong CHÍNH file này dùng, không cần đụng tới field phẳng.
 * Không khai index signature cho các field phẳng vì code trong file này
 * không bao giờ đọc qua đường `row[code]` - chỉ ReportChart đọc runtime qua
 * `Record<string, unknown>` riêng của nó (xem ReportChart.tsx), không đi
 * qua type này.
 */
interface FlatQualityRow {
  userId?: number;
  userName?: string;
  departmentId?: number;
  departmentName?: string;
  total: number;
  byStatus: Record<string, number>;
}

/**
 * Báo cáo CHẤT LƯỢNG data - khác `CustomerReportTab` (chỉ đếm SỐ LƯỢNG:
 * tổng/đã chốt/đã join nhóm), tab này cho thấy data đổ về trong kỳ của MỖI
 * người ĐANG Ở TRẠNG THÁI GÌ (status hiện tại, danh sách lấy động từ
 * `customer_statuses` - đúng yêu cầu "đánh giá dựa trên Status của từng
 * User"). Người xem tự chọn 1 status làm "thước đo chính" (vd "Đã chốt")
 * để sắp xếp/tô màu - không hardcode 1 status cụ thể vì danh sách này Admin
 * tự quản lý được.
 */
export default function QualityReportTab({ query, onQueryChange }: Props) {
  const { data, isLoading, isError, error } = useCustomerQualityReport(query);
  const [personalSearch, setPersonalSearch] = useState('');
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [highlightStatus, setHighlightStatus] = useState<string | null>(null);

  const statuses = useMemo<QualityStatusMeta[]>(() => data?.statuses || [], [data?.statuses]);

  // Mặc định chọn status ĐẦU TIÊN (đã sort theo sortOrder ở BE) làm thước đo
  // chính khi data vừa tải xong và người dùng CHƯA tự chọn gì - tự cập nhật
  // lại nếu status đó bị xoá (không còn trong danh sách mới).
  const effectiveHighlight = useMemo(() => {
    if (highlightStatus && statuses.some((s) => s.code === highlightStatus)) return highlightStatus;
    return statuses[0]?.code ?? null;
  }, [highlightStatus, statuses]);

  const QUALITY_SERIES = useMemo(
    () => statuses.map((s) => ({ key: s.code, label: s.name, color: s.color })),
    [statuses],
  );

  // ReportChart đọc series bằng dataKey PHẲNG - làm phẳng byStatus ra field
  // top-level (mỗi status code thành 1 field riêng) trước khi đưa vào
  // ReportSection/ReportChart, KHÔNG sửa ReportChart để nhận nested object
  // (giữ ReportChart đơn giản, đúng hợp đồng cũ với 2 report kia).
  function flattenRow<T extends { total: number; byStatus: Record<string, number> }>(row: T): T & FlatQualityRow {
    return { ...row, ...row.byStatus };
  }

  const personalFlat = useMemo(() => (data?.personal || []).map(flattenRow), [data?.personal]);
  const departmentFlat = useMemo(() => (data?.department || []).map(flattenRow), [data?.department]);

  const filteredPersonal = useMemo(() => {
    let rows = personalFlat;
    if (personalSearch.trim()) {
      const q = personalSearch.trim().toLowerCase();
      rows = rows.filter((r) => (r.userName ?? '').toLowerCase().includes(q));
    }
    if (effectiveHighlight) {
      const key = effectiveHighlight;
      rows = [...rows].sort((a, b) => (b.byStatus[key] || 0) - (a.byStatus[key] || 0));
    }
    return rows;
  }, [personalFlat, personalSearch, effectiveHighlight]);

  const filteredDepartment = useMemo(() => {
    let rows = departmentFlat;
    if (departmentSearch.trim()) {
      const q = departmentSearch.trim().toLowerCase();
      rows = rows.filter((r) => (r.departmentName ?? '').toLowerCase().includes(q));
    }
    if (effectiveHighlight) {
      const key = effectiveHighlight;
      rows = [...rows].sort((a, b) => (b.byStatus[key] || 0) - (a.byStatus[key] || 0));
    }
    return rows;
  }, [departmentFlat, departmentSearch, effectiveHighlight]);

  const highlightMeta = statuses.find((s) => s.code === effectiveHighlight);

  const statusCountColumns = (): ColumnsType<FlatQualityRow> =>
    statuses.map((s) => ({
      title: (
        <span>
          <Tag color={s.color} style={{ marginRight: 4 }}>
            &nbsp;
          </Tag>
          {s.name}
        </span>
      ),
      key: s.code,
      align: 'right' as const,
      render: (_: unknown, row: FlatQualityRow) => {
        const count = row.byStatus[s.code] || 0;
        const pct = percentOf(count, row.total);
        return (
          <span>
            {formatCount(count)}{' '}
            <Text type="secondary" style={{ fontSize: 12 }}>
              ({pct}%)
            </Text>
          </span>
        );
      },
      sorter: (a: FlatQualityRow, b: FlatQualityRow) => (a.byStatus[s.code] || 0) - (b.byStatus[s.code] || 0),
    }));

  const highlightColumn = (): ColumnsType<FlatQualityRow> =>
    effectiveHighlight
      ? [
          {
            title: `Tỷ lệ "${highlightMeta?.name ?? effectiveHighlight}"`,
            key: '__highlight',
            width: 160,
            render: (_: unknown, row: FlatQualityRow) => {
              const count = row.byStatus[effectiveHighlight] || 0;
              const pct = percentOf(count, row.total);
              return <Progress percent={pct} size="small" strokeColor={progressColor(pct)} />;
            },
            sorter: (a: FlatQualityRow, b: FlatQualityRow) =>
              (a.byStatus[effectiveHighlight] || 0) - (b.byStatus[effectiveHighlight] || 0),
            defaultSortOrder: 'descend' as const,
          },
        ]
      : [];

  const personalColumns: ColumnsType<FlatQualityRow> = [
    { title: 'Nhân viên', dataIndex: 'userName', key: 'userName', fixed: 'left' as const },
    {
      title: 'Tổng data',
      dataIndex: 'total',
      key: 'total',
      align: 'right' as const,
      sorter: (a: FlatQualityRow, b: FlatQualityRow) => a.total - b.total,
    },
    ...statusCountColumns(),
    ...highlightColumn(),
  ];

  const departmentColumns: ColumnsType<FlatQualityRow> = [
    { title: 'Phòng ban', dataIndex: 'departmentName', key: 'departmentName', fixed: 'left' as const },
    {
      title: 'Tổng data',
      dataIndex: 'total',
      key: 'total',
      align: 'right' as const,
      sorter: (a: FlatQualityRow, b: FlatQualityRow) => a.total - b.total,
    },
    ...statusCountColumns(),
    ...highlightColumn(),
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <PeriodSelector value={query} onChange={onQueryChange} resolvedPeriod={data?.period} />
      </div>

      {isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Không tải được báo cáo chất lượng data"
          description={getApiErrorMessage(error, 'Đã có lỗi xảy ra, vui lòng thử lại')}
        />
      )}

      {statuses.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Space align="center" wrap>
            <Text type="secondary">Đánh giá theo trạng thái:</Text>
            <Select
              size="middle"
              style={{ minWidth: 180 }}
              value={effectiveHighlight}
              onChange={setHighlightStatus}
              options={statuses.map((s) => ({
                value: s.code,
                label: (
                  <span>
                    <Tag color={s.color} style={{ marginRight: 4 }}>
                      &nbsp;
                    </Tag>
                    {s.name}
                  </span>
                ),
              }))}
            />
          </Space>
        </div>
      )}

      {/* Tổng tất cả - CHỈ Admin/Assistant thấy (BE trả null cho role khác) */}
      {data?.total != null && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Tổng data toàn hệ thống"
                value={data.total.total}
                prefix={<SafetyCertificateOutlined />}
                styles={{ content: { color: '#1677ff' } }}
              />
            </Card>
          </Col>
          {effectiveHighlight && (
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title={`Tỷ lệ "${highlightMeta?.name ?? effectiveHighlight}"`}
                  value={percentOf(data.total.byStatus[effectiveHighlight] || 0, data.total.total)}
                  suffix="%"
                  styles={{ content: { color: highlightMeta?.color || '#52c41a' } }}
                />
              </Card>
            </Col>
          )}
        </Row>
      )}

      <Title level={5}>Theo cá nhân</Title>
      <div style={{ marginBottom: 24 }}>
        <ReportSection
          rowKey="userId"
          loading={isLoading}
          columns={personalColumns}
          data={filteredPersonal}
          nameKey="userName"
          series={QUALITY_SERIES}
          stackable
          valueFormatter={formatCount}
          emptyText={personalSearch ? 'Không tìm thấy nhân viên phù hợp' : 'Không có data trong kỳ này'}
          extraFilters={
            <ReportNameFilter value={personalSearch} onChange={setPersonalSearch} placeholder="Tìm theo tên nhân viên..." />
          }
        />
      </div>

      {/* Theo phòng ban - Employee không có mục này (BE trả null) */}
      {data?.department != null && (
        <>
          <Title level={5}>Theo phòng ban</Title>
          <ReportSection
            rowKey="departmentId"
            loading={isLoading}
            columns={departmentColumns}
            data={filteredDepartment}
            nameKey="departmentName"
            series={QUALITY_SERIES}
            stackable
            valueFormatter={formatCount}
            emptyText={departmentSearch ? 'Không tìm thấy phòng ban phù hợp' : 'Không có data trong kỳ này'}
            extraFilters={
              <ReportNameFilter value={departmentSearch} onChange={setDepartmentSearch} placeholder="Tìm theo tên phòng ban..." />
            }
          />
        </>
      )}
    </div>
  );
}
