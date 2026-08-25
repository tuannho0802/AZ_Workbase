'use client';

import { Tabs, Card, Badge, Space, Typography } from 'antd';
import { ApiOutlined } from '@ant-design/icons';
import { useDeviceStatus } from '@/lib/hooks/useZkDevice';
import DeviceMappingTab from './DeviceMappingTab';
import AttendanceSummaryTab from './AttendanceSummaryTab';
import AttendanceMonthlyTab from './AttendanceMonthlyTab';
import AttendanceLogsTab from './AttendanceLogsTab';

const { Title } = Typography;

export default function AttendanceDevicePage() {
  const { data: status, isLoading: statusLoading, isError: statusError } = useDeviceStatus();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Máy chấm công</Title>
        <Space>
          <ApiOutlined style={{ color: statusLoading ? '#bfbfbf' : status?.connected ? '#52c41a' : '#ff4d4f' }} />
          <Badge
            status={statusLoading ? 'processing' : status?.connected ? 'success' : 'error'}
            text={
              statusLoading
                ? 'Đang kiểm tra kết nối...'
                : status?.connected
                ? `Đã kết nối (${status.ip}:${status.port})`
                : statusError
                ? 'Không kết nối được tới máy'
                : 'Mất kết nối'
            }
          />
        </Space>
      </div>

      <Card>
        <Tabs
          defaultActiveKey="summary"
          items={[
            {
              key: 'mapping',
              label: 'Mapping nhân viên',
              children: <DeviceMappingTab />,
            },
            {
              key: 'summary',
              label: 'Bảng chấm công',
              children: <AttendanceSummaryTab />,
            },
            {
              key: 'monthly',
              label: 'Tổng hợp chấm công',
              children: <AttendanceMonthlyTab />,
            },
            {
              key: 'logs',
              label: 'Logs chấm công',
              children: <AttendanceLogsTab />,
            },
          ]}
        />
      </Card>
    </div>
  );
}