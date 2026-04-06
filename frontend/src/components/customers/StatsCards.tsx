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
  onCardClick?: (type: 'today' | 'status' | 'deposit') => void;
}

export const StatsCards = ({ stats, loading, onCardClick }: StatsCardsProps) => {
  const cardStyle: React.CSSProperties = {
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  };

  const hoverEffect = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.transform = 'translateY(-4px)';
    e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.08)';
  };

  const normalEffect = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.transform = 'translateY(0)';
    e.currentTarget.style.boxShadow = 'none';
  };

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
        <Card 
          loading={loading} 
          variant="borderless" 
          className="stat-card"
          style={cardStyle}
          onClick={() => onCardClick?.('today')}
          onMouseEnter={hoverEffect}
          onMouseLeave={normalEffect}
        >
          <Statistic
            title="Khách mới hôm nay"
            value={stats?.newToday || 0}
            styles={{ content: { color: '#3f8600' } }}
            prefix={<UserAddOutlined />}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card 
          loading={loading} 
          variant="borderless" 
          className="stat-card"
          style={cardStyle}
          onClick={() => onCardClick?.('status')}
          onMouseEnter={hoverEffect}
          onMouseLeave={normalEffect}
        >
          <Statistic
            title="Chốt thành công"
            value={stats?.closedTotal || 0}
            styles={{ content: { color: '#52c41a' } }}
            prefix={<CheckCircleOutlined />}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={6}>
        <Card 
          loading={loading} 
          variant="borderless" 
          className="stat-card"
          style={cardStyle}
          onClick={() => onCardClick?.('deposit')}
          onMouseEnter={hoverEffect}
          onMouseLeave={normalEffect}
        >
          <Statistic
            title="Tổng nạp (USD)"
            value={stats?.totalDepositAmount || 0}
            styles={{ content: { color: '#faad14' } }}
            formatter={(value) => new Intl.NumberFormat('en-US', { 
              style: 'currency', 
              currency: 'USD' 
            }).format(Number(value))}
            prefix={<DollarOutlined />}
          />
        </Card>
      </Col>
    </Row>
  );
};
