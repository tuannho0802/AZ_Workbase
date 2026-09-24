'use client';

import React from 'react';
import { App } from 'antd';
import { parseLinks, truncateSegments } from '@/lib/utils/linkify';

interface LinkifiedTextProps {
  text: string;
  /** Cắt hiển thị theo ký tự (không làm hỏng URL). */
  maxLength?: number;
  /** Màu link - dùng màu sáng hơn khi nằm trong Tooltip nền tối. */
  linkColor?: string;
}

/**
 * Render text, tự nhận URL (http/https/www) thành link bấm được.
 * Bấm link -> hiện Modal xác nhận, chọn "Mở liên kết" mới mở tab mới
 * (noopener,noreferrer). Chặn lan click lên cha (Card/Checklist đang có onClick).
 */
export const LinkifiedText: React.FC<LinkifiedTextProps> = ({ text, maxLength, linkColor = '#1677ff' }) => {
  const { modal } = App.useApp();

  let segments = parseLinks(text);
  if (maxLength !== undefined) segments = truncateSegments(segments, maxLength);

  const confirmOpen = (href: string) => {
    modal.confirm({
      title: 'Mở liên kết ngoài?',
      content: <div style={{ wordBreak: 'break-all' }}>Bạn sắp chuyển đến: <strong>{href}</strong></div>,
      okText: 'Mở liên kết',
      cancelText: 'Hủy',
      onOk: () => {
        window.open(href, '_blank', 'noopener,noreferrer');
      },
    });
  };

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <React.Fragment key={i}>{seg.value}</React.Fragment>
        ) : (
          // Không đặt `href` thật để Ctrl/Middle-click không qua mặt được Modal xác nhận.
          <a
            key={i}
            role="link"
            tabIndex={0}
            title={seg.href}
            style={{ color: linkColor, textDecoration: 'underline', cursor: 'pointer', overflowWrap: 'anywhere' }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              confirmOpen(seg.href);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                confirmOpen(seg.href);
              }
            }}
          >
            {seg.value}
          </a>
        ),
      )}
    </>
  );
};
