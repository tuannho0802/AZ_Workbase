import { Card, Col, Row, Statistic } from 'antd';
import { 
  UserOutlined, 
  UserAddOutlined, 
  CheckCircleOutlined, 
  DollarOutlined,
  MinusCircleOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { CustomerStats } from '@/lib/types/customer.types';

interface StatsCardsProps {
  stats: CustomerStats | null;
  loading: boolean;
  onCardClick?: (type: 'today' | 'status' | 'deposit') => void;
  /** Ẩn thẻ "Tổng nạp" khi Admin đã ẩn `tab:deposits` cho Position/Department
   * hiện tại (xem PositionVisibilityDrawer.tsx) - thẻ này và cột "Nạp tiền"
   * ở bảng khách hàng cùng hiển thị dữ liệu FTD, chung 1 trường dữ liệu với
   * tab "Lịch sử nạp tiền (FTD)" nên phải ẩn/hiện đồng bộ với nhau. */
  hideDeposit?: boolean;
  /** Nhãn thẻ Tổng nạp - đổi khi người dùng lọc theo khoảng ngày (không còn là 30 ngày). */
  depositLabel?: string;
  /** [W4] Ẩn 2 thẻ mới "Đã rút" + "Nạp thực": true khi Admin ẩn `tab:withdrawals` HOẶC `tab:deposits`
   * (Nạp thực = nạp - rút nên để lộ sẽ suy ra được số đã ẩn). */
  hideFinance?: boolean;
}

const formatUsd = (value: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

// Nhãn 2 thẻ mới đồng bộ khung thời gian với nhãn "Tổng nạp" (30 ngày mặc định / theo ngày lọc).
const isFiltered = (depositLabel?: string): boolean => !!depositLabel;
const withdrawalLabel = (depositLabel?: string): string =>
  isFiltered(depositLabel) ? 'Đã rút (theo ngày lọc, USD)' : 'Đã rút (30 ngày, USD)';
const netLabel = (depositLabel?: string): string =>
  isFiltered(depositLabel) ? 'Nạp thực (theo ngày lọc, USD)' : 'Nạp thực (30 ngày, USD)';

export const StatsCards = ({ stats, loading, onCardClick, hideDeposit, depositLabel, hideFinance }: StatsCardsProps) => {
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
      {!hideDeposit && (
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
              title={depositLabel || 'Tổng nạp (30 ngày, USD)'}
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
      )}
      {!hideFinance && !hideDeposit && (
        <>
          <Col xs={24} sm={12} md={6}>
            <Card loading={loading} variant="borderless" className="stat-card" data-testid="stat-withdrawal">
              <Statistic
                title={withdrawalLabel(depositLabel)}
                value={stats?.totalWithdrawalAmount || 0}
                styles={{ content: { color: '#d46b08' } }}
                formatter={(value) => formatUsd(Number(value))}
                prefix={<MinusCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card loading={loading} variant="borderless" className="stat-card" data-testid="stat-net-deposit">
              <Statistic
                title={netLabel(depositLabel)}
                value={stats?.netDepositAmount || 0}
                styles={{ content: { color: (stats?.netDepositAmount ?? 0) < 0 ? '#cf1322' : '#389e0d' } }}
                formatter={(value) => formatUsd(Number(value))}
                prefix={<WalletOutlined />}
              />
            </Card>
          </Col>
        </>
      )}
    </Row>
  );
};