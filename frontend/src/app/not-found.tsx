'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button } from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import logo from './logo.png';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <Image src={logo} alt="AZWorkbase" width={64} height={64} style={{ objectFit: 'contain' }} priority />
      <div style={{ fontSize: 72, fontWeight: 700, color: '#1677ff', lineHeight: 1 }}>404</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>
        Không tìm thấy trang bạn cần
      </div>
      <div style={{ fontSize: 14, color: '#64748b', maxWidth: 420 }}>
        Trang này có thể đã bị xoá, đổi đường dẫn, hoặc bạn đã gõ nhầm URL.
      </div>
      <Link href="/">
        <Button type="primary" icon={<HomeOutlined />} size="large" style={{ marginTop: 8 }}>
          Về trang chủ
        </Button>
      </Link>
    </div>
  );
}
