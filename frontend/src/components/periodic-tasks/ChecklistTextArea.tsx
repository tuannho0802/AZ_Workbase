'use client';

import { useState } from 'react';
import { Input, Tooltip } from 'antd';
import type { TextAreaProps } from 'antd/es/input';
import { CHECKLIST_CONTENT_MAX_LENGTH } from '@/lib/api/periodic-task-checklist-items.api';

/**
 * ChecklistTextArea - ô nhập nội dung checklist item, dùng chung cho Modal và
 * Inline: hiển thị bộ đếm ký tự ở góc phải dưới (vd `30/500`, chuyển đỏ khi
 * chạm giới hạn) + Tooltip cảnh báo khi đã đạt giới hạn (chỉ hiện lúc đang
 * focus để không che UI khi user không còn gõ).
 */
interface ChecklistTextAreaProps extends TextAreaProps {
  /** antd vẽ bộ đếm ký tự BÊN DƯỚI ô nhập (ngoài khung) nên có thể bị phần tử
   * kế tiếp (vd Pagination) đè lên - bật cờ này ở ô SỬA item (nằm giữa danh
   * sách) để chừa sẵn khoảng trống cho bộ đếm. */
  reserveCountSpace?: boolean;
}

export function ChecklistTextArea({ value, onFocus, onBlur, reserveCountSpace, ...rest }: ChecklistTextAreaProps) {
  const [focused, setFocused] = useState(false);
  const length = typeof value === 'string' ? value.length : 0;
  const atLimit = length >= CHECKLIST_CONTENT_MAX_LENGTH;

  const input = (
    <Tooltip
      open={atLimit && focused}
      placement="topRight"
      color="#f5222d"
      title={`Đã đạt giới hạn ${CHECKLIST_CONTENT_MAX_LENGTH} ký tự cho 1 checklist.`}
    >
      <Input.TextArea
        {...rest}
        style={reserveCountSpace ? { ...rest.style, width: '100%' } : rest.style}
        value={value}
        maxLength={CHECKLIST_CONTENT_MAX_LENGTH}
        status={atLimit ? 'warning' : undefined}
        count={{
          show: ({ count, maxLength }) => (
            <span style={{ color: atLimit ? '#f5222d' : undefined }}>
              {count}/{maxLength}
            </span>
          ),
          max: CHECKLIST_CONTENT_MAX_LENGTH,
        }}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
      />
    </Tooltip>
  );

  if (!reserveCountSpace) return input;
  return <div style={{ flex: 1, minWidth: 0, paddingBottom: 22 }}>{input}</div>;
}
