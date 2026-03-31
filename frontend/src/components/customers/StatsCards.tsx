import { Card, Col, Row, Statistic } from 'antd';
import { 
  UserOutlined, 
  UserAddOutlined, 
  CheckCircleOutlined, 
  DollarOutlined 
} from '@ant-design/icons';
import { CustomerStats } from '@/lib/types/customer.types';

interface StatsCardsProps {
  stats: CustomerStats | null;
  loading: boolean;
}

export const StatsCards = ({ stats, loading }: StatsCardsProps) => {
  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      <Col xs={24} sm={12} md={6}>
        <Card loading={loading} variant="borderless" className="stat-card">
          <Statistic
            title="Tổng khách hàng"
            value={stats?.totalCustomers || 0}
            prefix={<UserOutlined style={{ color: '#1890ff' }} />}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card loading={loading} variant="borderless" className="stat-card">
          <Statistic
            title="Khách mới hôm nay"
            value={stats?.newToday || 0}
            styles={{ content: { color: '#3f8600' } }}
            prefix={<UserAddOutlined />}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card loading={loading} variant="borderless" className="stat-card">
          <Statistic
            title="Đã chốt (Closed)"
            value={stats?.closedTotal || 0}
            styles={{ content: { color: '#52c41a' } }}
            prefix={<CheckCircleOutlined />}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card loading={loading} variant="borderless" className="stat-card">
          <Statistic
            title="Tổng nạp (USD)"
            value={stats?.totalDepositAmount || 0}
            precision={2}
            prefix={<DollarOutlined style={{ color: '#faad14' }} />}
          />
        </Card>
      </Col>
    </Row>
  );
};
