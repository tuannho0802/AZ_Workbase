'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Col, Row, Statistic } from 'antd';
import { customersApi } from '@/lib/api/customers.api';
import { CustomerFinanceSummary as FinanceSummary } from '@/lib/types/customer.types';

interface Props {
  customerId: number;
  /** Tăng giá trị này để nạp lại (sau khi thêm/xoá phiếu nạp hoặc rút). */
  refreshTrigger?: number;
}

const usd = (value: number | string): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));

/**
 * 3 chỉ số tài chính TOÀN THỜI GIAN của 1 khách (đầu Drawer): Tổng nạp / Đã rút / Nạp thực.
 * Lấy từ `GET /customers/:id/finance-summary` (SUM trong DB) - KHÔNG cộng từ danh sách (BE chỉ trả tối đa 50 phiếu).
 * Nạp thực = nạp - rút, CÓ THỂ ÂM -> hiển thị đỏ.
 * Lỗi tải: im lặng ẩn khối này (interceptor axios đã toast lỗi có response) - không chặn phần còn lại của Drawer.
 */
export const CustomerFinanceSummary = ({ customerId, refreshTrigger }: Props) => {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);

  const fetchSummary = useCallback(async () => {
    if (!customerId) return;
    const seq = ++seqRef.current; // chỉ áp dụng response của lần fetch MỚI NHẤT
    setLoading(true);
    try {
      const data = await customersApi.getCustomerFinanceSummary(customerId);
      if (seq === seqRef.current) setSummary(data);
    } catch {
      if (seq === seqRef.current) setSummary(null);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary, refreshTrigger]);

  if (!summary && !loading) return null;

  const net = Number(summary?.netDeposit ?? 0);

  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }} data-testid="finance-summary">
      <Col xs={24} sm={8}>
        <Card size="small" loading={loading}>
          <Statistic
            title={`Tổng nạp (${summary?.depositCount ?? 0} phiếu)`}
            value={usd(summary?.totalDeposit ?? 0)}
            styles={{ content: { color: '#faad14', fontSize: 18 } }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={8}>
        <Card size="small" loading={loading}>
          <Statistic
            title={`Đã rút (${summary?.withdrawalCount ?? 0} phiếu)`}
            value={usd(summary?.totalWithdrawal ?? 0)}
            styles={{ content: { color: '#d46b08', fontSize: 18 } }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={8}>
        <Card size="small" loading={loading}>
          <Statistic
            title="Nạp thực"
            value={usd(net)}
            styles={{ content: { color: net < 0 ? '#cf1322' : '#389e0d', fontSize: 18 } }}
          />
        </Card>
      </Col>
    </Row>
  );
};
