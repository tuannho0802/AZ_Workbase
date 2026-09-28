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
export function ChecklistTextArea({ value, onFocus, onBlur, ...rest }: TextAreaProps) {
  const [focused, setFocused] = useState(false);
  const length = typeof value === 'string' ? value.length : 0;
  const atLimit = length >= CHECKLIST_CONTENT_MAX_LENGTH;

  return (
    <Tooltip
      open={atLimit && focused}
      placement="topRight"
      color="#f5222d"
      title={`Đã đạt giới hạn ${CHECKLIST_CONTENT_MAX_LENGTH} ký tự cho 1 checklist.`}
    >
      <Input.TextArea
        {...rest}
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
}
