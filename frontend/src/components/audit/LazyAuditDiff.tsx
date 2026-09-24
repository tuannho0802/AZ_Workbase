'use client';

import { Alert, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { AuditDiffViewer } from './AuditDiffViewer';

type DiffViewerProps = React.ComponentProps<typeof AuditDiffViewer>;

interface LazyAuditDiffProps {
  logId: number;
  action: string;
  /** Khoá cache riêng từng nguồn log (vd 'audit' | 'task-audit'). */
  scope: string;
  /** Gọi endpoint chi tiết - list KHÔNG còn trả oldData/newData. */
  fetchDetail: (id: number) => Promise<{ oldData: DiffViewerProps['oldData']; newData: DiffViewerProps['newData'] }>;
  extraFieldLabels?: DiffViewerProps['extraFieldLabels'];
}

/** Chỉ fetch oldData/newData khi component được mount (mở expand-row/Drawer). */
export function LazyAuditDiff({ logId, action, scope, fetchDetail, extraFieldLabels }: LazyAuditDiffProps) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['log-detail', scope, logId],
    queryFn: () => fetchDetail(logId),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <Spin size="small" />;
  if (isError || !data) {
    return <Alert type="error" showIcon title="Không tải được chi tiết." action={<a onClick={() => refetch()}>Thử lại</a>} />;
  }
  return <AuditDiffViewer oldData={data.oldData} newData={data.newData} action={action} extraFieldLabels={extraFieldLabels} />;
}
