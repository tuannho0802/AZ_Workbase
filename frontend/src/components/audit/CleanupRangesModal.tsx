'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Checkbox, DatePicker, Input, Modal, Space, Table, Typography } from 'antd';
import { DeleteOutlined, EyeOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { CleanupRangesPayload, CleanupRangesResult } from '@/lib/api/audit.api';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';

const { RangePicker } = DatePicker;
const { Text } = Typography;

/** PLAN_RETENTION Phase 2 (A2). Chữ xác nhận dùng CHUNG cho cả 2 trang (khớp các modal xoá sẵn có). */
export const CLEANUP_CONFIRM_TEXT = 'XÁC NHẬN';
export const MAX_CLEANUP_RANGES = 20;

type RangeValue = [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;

export interface CleanupRangesModalProps {
  open: boolean;
  onClose: () => void;
  /** 'audit' có thêm checkbox "Bao gồm sự kiện bảo mật"; 'task-audit' thì không. */
  scope: 'audit' | 'task-audit';
  /** Gọi API tương ứng (`dryRun=true` = xem trước, không ghi gì). */
  run: (payload: CleanupRangesPayload, dryRun: boolean) => Promise<CleanupRangesResult>;
  /** Gọi sau khi xoá thật xong (trang dùng để tải lại/invalidate danh sách). */
  onDone: () => void;
}

const isComplete = (r: RangeValue): r is [dayjs.Dayjs, dayjs.Dayjs] => !!r && !!r[0] && !!r[1];
const fmt = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD'); // KHÔNG dùng toISOString() (lệch múi giờ)
const show = (s: string) => dayjs(s).format('DD/MM/YYYY');

export function CleanupRangesModal({ open, onClose, scope, run, onDone }: CleanupRangesModalProps) {
  const { message } = App.useApp();
  const [ranges, setRanges] = useState<RangeValue[]>([null]);
  const [includeSecurity, setIncludeSecurity] = useState(false);
  const [preview, setPreview] = useState<CleanupRangesResult | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const allFilled = ranges.length > 0 && ranges.every(isComplete);
  const canDelete =
    !!preview && preview.total > 0 && confirmText === CLEANUP_CONFIRM_TEXT && !deleting && !previewing;

  // Đổi bất kỳ đầu vào nào -> kết quả xem trước cũ không còn đúng: bắt buộc xem trước lại + gõ lại xác nhận.
  const invalidate = () => {
    setPreview(null);
    setConfirmText('');
  };

  const payload = (): CleanupRangesPayload => ({
    ranges: ranges.filter(isComplete).map(([a, b]) => ({ from: fmt(a), to: fmt(b) })),
    ...(scope === 'audit' ? { includeSecurityEvents: includeSecurity } : {}),
  });

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      setPreview(await run(payload(), true));
      setConfirmText('');
    } catch (e) {
      message.error(getApiErrorMessage(e, 'Không thể xem trước'));
    } finally {
      setPreviewing(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete) return; // chống bấm đúp / bỏ qua nút bị khoá
    setDeleting(true);
    try {
      const res = await run(payload(), false);
      if (res.partial) {
        message.warning(`Đã xoá ${res.total.toLocaleString()} bản ghi nhưng còn dữ liệu - hãy xem trước và xoá lại.`);
        onDone();
        invalidate();
      } else {
        message.success(`Đã xoá ${res.total.toLocaleString()} bản ghi`);
        onDone();
        handleClose();
      }
    } catch (e) {
      message.error(getApiErrorMessage(e, 'Không thể xoá'));
    } finally {
      setDeleting(false);
    }
  };

  const handleClose = () => {
    setRanges([null]);
    setIncludeSecurity(false);
    invalidate();
    onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title="Xóa nhật ký theo nhiều khoảng ngày"
      width={640}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={handleClose}>Đóng</Button>
          <Button
            icon={<EyeOutlined />}
            onClick={handlePreview}
            loading={previewing}
            disabled={!allFilled || deleting}
            data-testid="cleanup-preview-btn"
          >
            Xem trước
          </Button>
          <Button
            danger
            type="primary"
            icon={<DeleteOutlined />}
            onClick={handleDelete}
            loading={deleting}
            disabled={!canDelete}
            data-testid="cleanup-delete-btn"
          >
            Xóa
          </Button>
        </Space>
      }
    >
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <Text type="secondary">
          Chọn tối đa {MAX_CLEANUP_RANGES} khoảng ngày (giờ Việt Nam). Hôm nay và tương lai sẽ không bị xóa.
        </Text>

        {ranges.map((r, i) => (
          <Space key={i} style={{ width: '100%' }}>
            <RangePicker
              data-testid={`cleanup-range-${i}`}
              value={r as [dayjs.Dayjs, dayjs.Dayjs] | null}
              format="DD/MM/YYYY"
              placeholder={['Từ ngày', 'Đến ngày']}
              disabledDate={(d) => d.isAfter(dayjs().subtract(1, 'day'), 'day')}
              onChange={(v) => {
                setRanges((prev) => prev.map((x, idx) => (idx === i ? (v as RangeValue) : x)));
                invalidate();
              }}
            />
            {ranges.length > 1 && (
              <Button
                type="text"
                danger
                icon={<MinusCircleOutlined />}
                aria-label={`Bỏ khoảng ${i + 1}`}
                data-testid={`cleanup-remove-${i}`}
                onClick={() => {
                  setRanges((prev) => prev.filter((_, idx) => idx !== i));
                  invalidate();
                }}
              />
            )}
          </Space>
        ))}

        <Button
          type="dashed"
          icon={<PlusOutlined />}
          disabled={ranges.length >= MAX_CLEANUP_RANGES}
          data-testid="cleanup-add-range"
          onClick={() => {
            setRanges((prev) => [...prev, null]);
            invalidate();
          }}
        >
          Thêm khoảng ngày ({ranges.length}/{MAX_CLEANUP_RANGES})
        </Button>

        {scope === 'audit' && (
          <Checkbox
            checked={includeSecurity}
            onChange={(e) => {
              setIncludeSecurity(e.target.checked);
              invalidate();
            }}
          >
            Bao gồm sự kiện bảo mật (mặc định được giữ lại)
          </Checkbox>
        )}

        {preview && (
          <>
            <Table
              size="small"
              pagination={false}
              rowKey={(r) => `${r.from}_${r.to}`}
              dataSource={preview.perRange}
              columns={[
                { title: 'Khoảng ngày', render: (_, r) => `${show(r.from)} → ${show(r.to)}` },
                { title: 'Số dòng sẽ xóa', dataIndex: 'count', align: 'right', render: (n: number) => n.toLocaleString() },
              ]}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <Text strong>Tổng</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <Text strong data-testid="cleanup-total">{preview.total.toLocaleString()}</Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
            {scope === 'audit' && (preview.securityEvents ?? 0) > 0 && (
              <Alert
                type="info"
                showIcon
                title={`Có ${(preview.securityEvents ?? 0).toLocaleString()} sự kiện bảo mật trong các khoảng này - ${
                  preview.includeSecurityEvents ? 'SẼ bị xóa (đã tick).' : 'được giữ lại (chưa tick).'
                }`}
              />
            )}
            {preview.dropped.length > 0 && (
              <Alert
                type="warning"
                showIcon
                title={`Đã bỏ ${preview.dropped.length} khoảng nằm từ hôm nay trở đi: ${preview.dropped
                  .map((d) => `${show(d.from)} → ${show(d.to)}`)
                  .join(', ')}`}
              />
            )}
            {preview.total === 0 ? (
              <Alert type="success" showIcon title="Không có bản ghi nào để xóa." />
            ) : (
              <div>
                <Text type="danger">Hành động này không thể hoàn tác. Nhập &quot;{CLEANUP_CONFIRM_TEXT}&quot; để xóa:</Text>
                <Input
                  style={{ marginTop: 8 }}
                  value={confirmText}
                  placeholder={CLEANUP_CONFIRM_TEXT}
                  data-testid="cleanup-confirm-input"
                  onChange={(e) => setConfirmText(e.target.value)}
                />
              </div>
            )}
          </>
        )}
      </Space>
    </Modal>
  );
}
