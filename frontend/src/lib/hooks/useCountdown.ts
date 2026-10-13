import { useEffect, useRef, useState } from 'react';

/** 125 -> "02:05". */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(Math.floor(totalSeconds), 0);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Đếm ngược từ `seconds` về 0 (cập nhật mỗi giây). Tính theo MỐC THỜI GIAN (deadline) chứ không trừ dần,
 * nên tab bị trình duyệt làm chậm timer ở nền vẫn hiện đúng khi quay lại. `seconds` đổi giá trị -> đếm lại.
 * `onExpire` gọi đúng 1 lần khi về 0 (không gọi nếu bắt đầu từ 0).
 */
export function useCountdown(seconds: number | null | undefined, onExpire?: () => void): number {
  const initial = Math.max(Math.ceil(seconds ?? 0), 0);
  // `from` = giá trị `initial` mà `left` được tính ra. Khi `seconds` đổi (initial khác `from`) thì render dùng
  // luôn `initial` mới - không cần setState đồng bộ trong effect (tránh render lan truyền).
  const [tick, setTick] = useState({ from: initial, left: initial });
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (initial <= 0) return;
    const deadline = Date.now() + initial * 1000;
    const id = setInterval(() => {
      const left = Math.max(Math.ceil((deadline - Date.now()) / 1000), 0);
      setTick({ from: initial, left });
      if (left <= 0) {
        clearInterval(id);
        onExpireRef.current?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [initial]);

  return tick.from === initial ? tick.left : initial;
}
