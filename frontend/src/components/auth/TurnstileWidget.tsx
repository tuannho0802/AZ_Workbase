'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Script from 'next/script';

interface TurnstileRenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'flexible' | 'compact';
}

interface TurnstileApi {
  render: (container: string | HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
  /**
   * Theo doc chính thức (mục "Advanced SPA implementation"): `window.turnstile`
   * có thể đã tồn tại (script đã load xong) nhưng CHƯA hoàn tất khởi tạo nội
   * bộ ngay lập tức - gọi `.render()` quá sớm có thể fail âm thầm. `.ready()`
   * đảm bảo callback chỉ chạy khi thực sự sẵn sàng render.
   */
  ready: (callback: () => void) => void;
}

// Khai báo kiểu cho `window.turnstile` - script Cloudflare tự gắn global này
// sau khi load xong, không có type chính thức từ npm nên khai báo thủ công
// (dự án bật `@typescript-eslint/no-explicit-any` = ERROR, không được dùng `any`).
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

interface TurnstileWidgetProps {
  siteKey: string;
  onVerify: (token: string) => void;
  /** Gọi khi token hết hạn (Turnstile token chỉ dùng được ~5 phút) - nên reset lại state token ở form cha. */
  onExpire?: () => void;
  /** Gọi khi widget tự báo lỗi (mạng, site key sai...) - nên báo người dùng thử tải lại trang. */
  onError?: () => void;
}

/**
 * Render Cloudflare Turnstile (CAPTCHA-less, chỉ cần render + đợi callback,
 * không bắt người dùng chọn ảnh/gõ chữ như reCAPTCHA cũ). Đây là 1 trong 3
 * lớp chống bot đăng ký (cộng dồn với rate-limit theo IP + honeypot ở
 * `register/page.tsx`) - khớp `TurnstileService` ở BE.
 *
 * Dùng `next/script` (`onReady` thay vì `onLoad`) để widget render lại đúng
 * mỗi lần component mount, kể cả khi script Cloudflare đã được load sẵn từ
 * trước (onLoad chỉ bắn 1 lần cho cả app, onReady bắn lại mỗi lần mount).
 */
export function TurnstileWidget({ siteKey, onVerify, onExpire, onError }: TurnstileWidgetProps) {
  // useId() sinh ra chuỗi có dấu ":" (vd ":r0:") không hợp lệ làm CSS
  // selector/id thuần - thay bằng "-" cho an toàn khi query bằng `#id`.
  const containerId = `turnstile-${useId().replace(/:/g, '-')}`;
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!scriptReady || !window.turnstile || widgetIdRef.current) return;

    // window.turnstile.ready() theo đúng khuyến nghị chính thức (mục
    // "Advanced SPA implementation" trong doc) - tránh race condition hiếm
    // gặp: script đã bắn xong sự kiện load (onReady=true) nhưng object
    // `window.turnstile` bên trong CHƯA hoàn tất init, khiến .render() gọi
    // quá sớm bị bỏ qua âm thầm (không lỗi, không log, chỉ đơn giản là
    // KHÔNG render - rất khó debug nếu gặp phải). Bọc trong .ready() đảm
    // bảo callback chỉ chạy đúng lúc thư viện thực sự sẵn sàng.
    window.turnstile.ready(() => {
      if (widgetIdRef.current || !window.turnstile) return; // đã render trong lúc chờ .ready() (StrictMode double-effect)

      widgetIdRef.current = window.turnstile.render(`#${containerId}`, {
        sitekey: siteKey,
        callback: onVerify,
        'expired-callback': () => {
          onVerify('');
          onExpire?.();
        },
        'error-callback': () => {
          onVerify('');
          onError?.();
        },
      });
    });

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ render lại khi script/siteKey đổi, không phải mỗi lần onVerify đổi identity
  }, [scriptReady, siteKey, containerId]);

  return (
    <>
      <Script
        // ?render=explicit theo đúng doc chính thức cho luồng "Explicit
        // rendering" (SPA) - tắt cơ chế TỰ QUÉT DOM tìm class `cf-turnstile`
        // (implicit rendering, dùng cho site HTML tĩnh). Component này chủ
        // động gọi `.render()` bằng tay ở trên nên không cần/không nên để
        // Turnstile tự quét - dù container hiện tại không mang class đó nên
        // về mặt thực tế 2 cách chạy giống nhau, thêm query param này để
        // khớp đúng 100% pattern SPA chính thức, tránh phụ thuộc hành vi
        // ngầm định không được doc đảm bảo lâu dài.
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div id={containerId} />
    </>
  );
}