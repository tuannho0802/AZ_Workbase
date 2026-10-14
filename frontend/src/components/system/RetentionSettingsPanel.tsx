'use client';

import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Divider, InputNumber, Radio, Space, Switch, Table, Tag, Typography } from 'antd';
import { PlayCircleOutlined, SaveOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  retentionApi,
  RetentionRunResult,
  RetentionSettings,
  RetentionTargetKey,
  UpdateRetentionSettingsPayload,
} from '@/lib/api/retention.api';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useAuthStore } from '@/lib/stores/auth.store';

const { Text } = Typography;

const QUERY_KEY = ['system', 'retention-settings'];

/** Chu kỳ chọn nhanh; còn lại là "Tuỳ chỉnh" (7–90 ngày). */
const PRESET_INTERVALS = [14, 30];

interface RowDef {
  key: RetentionTargetKey;
  label: string;
  hint: string;
  minDays: number;
  adminOnly?: boolean;
}

const ROWS: RowDef[] = [
  { key: 'audit_logs', label: 'Nhật ký hành động (audit)', hint: 'Giữ nguyên các sự kiện bảo mật có hạn riêng.', minDays: 7 },
  { key: 'task_audit_logs', label: 'Lịch sử công việc định kỳ', hint: 'Log thao tác trên Task.', minDays: 7 },
  { key: 'notifications', label: 'Thông báo', hint: 'Thông báo đã đọc xoá theo số ngày này; chưa đọc giữ lâu hơn (bên dưới).', minDays: 7 },
  {
    key: 'attendance_logs',
    label: 'Log chấm công',
    hint: 'Dữ liệu chấm công/lương — tối thiểu 365 ngày, chỉ Admin được đổi.',
    minDays: 365,
    adminOnly: true,
  },
];

type Draft = Pick<RetentionSettings, 'intervalDays' | 'auditLogs' | 'taskAuditLogs' | 'notifications' | 'attendanceLogs'>;

function toDraft(s: RetentionSettings): Draft {
  return {
    intervalDays: s.intervalDays,
    auditLogs: { ...s.auditLogs },
    taskAuditLogs: { ...s.taskAuditLogs },
    notifications: { ...s.notifications },
    attendanceLogs: { ...s.attendanceLogs },
  };
}

function draftKey(t: RetentionTargetKey): 'auditLogs' | 'taskAuditLogs' | 'notifications' | 'attendanceLogs' {
  return t === 'audit_logs' ? 'auditLogs' : t === 'task_audit_logs' ? 'taskAuditLogs' : t === 'notifications' ? 'notifications' : 'attendanceLogs';
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(Math.floor(totalSeconds), 0);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  if (days > 0) return `${days} ngày${hours ? ` ${hours} giờ` : ''}`;
  const minutes = Math.floor((s % 3600) / 60);
  if (hours > 0) return `${hours} giờ${minutes ? ` ${minutes} phút` : ''}`;
  return `${Math.max(minutes, 1)} phút`;
}

/**
 * Cài đặt Retention tự động (PLAN_RETENTION_SECURITY_ROADMAP Phase 1): bật/tắt + số ngày giữ cho từng đối tượng,
 * chu kỳ chạy (14/30 ngày/tuỳ chỉnh), lần chạy gần nhất / tiếp theo, nút "Chạy thử".
 * Hiển thị khi `audit.manage` (GET cần `audit.view`). Dùng chung cho trang audit và trang lịch sử công việc.
 */
export function RetentionSettingsPanel() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { can } = useMyPermissions();
  const isAdmin = useAuthStore((s) => s.user?.role) === 'admin';
  const canManage = can('audit.manage');

  const { data, isLoading } = useQuery({ queryKey: QUERY_KEY, queryFn: retentionApi.getSettings, enabled: can('audit.view') });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [customInterval, setCustomInterval] = useState(false);
  const [preview, setPreview] = useState<RetentionRunResult | null>(null);

  useEffect(() => {
    if (data) {
      setDraft(toDraft(data));
      setCustomInterval(!PRESET_INTERVALS.includes(data.intervalDays));
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload: UpdateRetentionSettingsPayload) => retentionApi.updateSettings(payload),
    onSuccess: () => {
      message.success('Đã lưu cấu hình dọn dẹp');
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['audit-meta', 'settings'] });
    },
  });

  const dryRunMutation = useMutation({
    mutationFn: () => retentionApi.runNow({ dryRun: true }),
    onSuccess: (res) => setPreview(res),
  });

  const runMutation = useMutation({
    mutationFn: () => retentionApi.runNow({ dryRun: false }),
    onSuccess: (res) => {
      message.success(`Đã chạy dọn dẹp: xoá ${res.affected ?? 0} dòng${res.status === 'partial' ? ' (còn dữ liệu, sẽ làm tiếp lần kích hoạt sau)' : ''}`);
      setPreview(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  if (!can('audit.view')) return null;
  if (isLoading || !draft || !data) return <Card loading style={{ borderRadius: 8 }} />;

  const schedule = data.schedule;
  const nextDue = schedule.dueNow ? 'ở lần kích hoạt kế tiếp (đã đến hạn)' : `${dayjs().add(schedule.nextDueInSeconds, 'second').format('DD/MM/YYYY')} (còn ${formatDuration(schedule.nextDueInSeconds)})`;

  const handleSave = () => {
    const payload: UpdateRetentionSettingsPayload = {
      intervalDays: draft.intervalDays,
      auditLogs: draft.auditLogs,
      taskAuditLogs: draft.taskAuditLogs,
      notifications: draft.notifications,
      ...(isAdmin ? { attendanceLogs: draft.attendanceLogs } : {}),
    };
    saveMutation.mutate(payload);
  };

  const handleRunNow = () => {
    modal.confirm({
      title: 'Chạy dọn dẹp ngay?',
      content: 'Xoá VĨNH VIỄN các bản ghi quá hạn của những đối tượng đang bật. Nên bấm "Chạy thử" trước để xem số dòng sẽ xoá. Không thể hoàn tác.',
      okText: 'Chạy ngay',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: () => runMutation.mutateAsync(),
    });
  };

  const previewRows = (preview?.results ?? []).map((r) => ({ ...r, label: ROWS.find((x) => x.key === r.target)?.label ?? r.target }));

  return (
    <Card title="Dọn dẹp dữ liệu tự động (Retention)" style={{ maxWidth: 760, borderRadius: 8 }}>
      <Space orientation={'vertical' as never} size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          title="Cách hoạt động"
          description="Hệ thống kiểm tra mỗi ngày và chỉ thực sự dọn khi đã đến hạn theo chu kỳ bên dưới. Đối tượng đang tắt sẽ không bao giờ bị xoá."
        />

        <div>
          <Text strong>Chu kỳ chạy: </Text>
          <Radio.Group
            disabled={!canManage}
            value={customInterval ? 'custom' : draft.intervalDays}
            onChange={(e) => {
              if (e.target.value === 'custom') setCustomInterval(true);
              else {
                setCustomInterval(false);
                setDraft({ ...draft, intervalDays: e.target.value as number });
              }
            }}
          >
            <Radio.Button value={14}>14 ngày</Radio.Button>
            <Radio.Button value={30}>30 ngày</Radio.Button>
            <Radio.Button value="custom">Tuỳ chỉnh</Radio.Button>
          </Radio.Group>
          {customInterval && (
            <InputNumber
              style={{ marginLeft: 8 }}
              min={7}
              max={90}
              disabled={!canManage}
              value={draft.intervalDays}
              onChange={(v) => setDraft({ ...draft, intervalDays: Number(v) || 30 })}
              suffix="ngày"
            />
          )}
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">
              Lần chạy gần nhất:{' '}
              {schedule.lastRun
                ? `${formatDuration(schedule.lastRun.ageSeconds)} trước — ${schedule.lastRun.status === 'success' ? 'thành công' : schedule.lastRun.status === 'partial' ? 'chưa xong (sẽ làm tiếp)' : schedule.lastRun.status === 'failed' ? 'có lỗi (sẽ thử lại)' : 'đang chạy'}, xoá ${schedule.lastRun.affected} dòng`
                : 'chưa chạy lần nào'}
              <br />
              Lần chạy tiếp theo (dự kiến): {nextDue}
            </Text>
          </div>
        </div>

        <Divider style={{ margin: 0 }} />

        {ROWS.map((row) => {
          const k = draftKey(row.key);
          const value = draft[k];
          const locked = !canManage || (row.adminOnly && !isAdmin);
          return (
            <div key={row.key}>
              <Space wrap align="center">
                <Switch checked={value.enabled} disabled={locked} onChange={(v) => setDraft({ ...draft, [k]: { ...value, enabled: v } })} />
                <Text strong style={{ minWidth: 200, display: 'inline-block' }}>{row.label}</Text>
                <InputNumber
                  min={row.minDays}
                  disabled={locked}
                  value={value.retentionDays}
                  onChange={(v) => setDraft({ ...draft, [k]: { ...value, retentionDays: Number(v) || row.minDays } })}
                  suffix="ngày"
                />
                {row.key === 'notifications' && (
                  <>
                    <Text type="secondary">Chưa đọc:</Text>
                    <InputNumber
                      min={30}
                      disabled={locked}
                      value={draft.notifications.unreadRetentionDays}
                      onChange={(v) => setDraft({ ...draft, notifications: { ...draft.notifications, unreadRetentionDays: Number(v) || 180 } })}
                      suffix="ngày"
                    />
                  </>
                )}
                {row.adminOnly && <Tag color="red">Chỉ Admin</Tag>}
              </Space>
              <div><Text type="secondary" style={{ fontSize: 12 }}>{row.hint}</Text></div>
            </div>
          );
        })}

        {canManage && (
          <Space wrap>
            <Button type="primary" icon={<SaveOutlined />} loading={saveMutation.isPending} onClick={handleSave}>
              Lưu cấu hình
            </Button>
            <Button loading={dryRunMutation.isPending} onClick={() => dryRunMutation.mutate()}>
              Chạy thử (chỉ đếm)
            </Button>
            {isAdmin && (
              <Button danger icon={<PlayCircleOutlined />} loading={runMutation.isPending} onClick={handleRunNow}>
                Chạy ngay
              </Button>
            )}
          </Space>
        )}

        {preview && (
          <Table
            size="small"
            pagination={false}
            rowKey="target"
            dataSource={previewRows}
            columns={[
              { title: 'Đối tượng', dataIndex: 'label' },
              {
                title: 'Khoảng thời gian bị xoá',
                key: 'range',
                render: (_: unknown, r) => {
                  if (r.skipped || r.error || !r.count || !r.from || !r.to) return '—';
                  const from = dayjs(r.from).format('DD/MM/YYYY');
                  const to = dayjs(r.to).format('DD/MM/YYYY');
                  return from === to ? from : `${from} → ${to}`;
                },
              },
              {
                title: 'Sẽ xoá',
                dataIndex: 'count',
                align: 'right',
                render: (c: number, r) => (r.skipped ? <Tag>Đang tắt</Tag> : r.error ? <Tag color="red">Lỗi</Tag> : c.toLocaleString()),
              },
            ]}
            footer={() => <Text strong>Tổng: {(preview.affected ?? 0).toLocaleString()} dòng (chưa xoá gì)</Text>}
          />
        )}
      </Space>
    </Card>
  );
}
