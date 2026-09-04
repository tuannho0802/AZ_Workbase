'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button } from 'antd';
import { HomeOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import logo from './logo.png';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-white p-8 md:p-12 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 max-w-lg w-full flex flex-col items-center">
        <div className="mb-8">
          <Image 
            src={logo} 
            alt="AZWorkbase" 
            width={72} 
            height={72} 
            className="object-contain hover:scale-110 transition-transform duration-300" 
            priority 
          />
        </div>
        
        <h1 className="text-7xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-500 tracking-tighter mb-2">
          404
        </h1>
        
        <h2 className="text-xl md:text-2xl font-bold text-slate-800 mb-3">
          Không tìm thấy trang
        </h2>
        
        <p className="text-slate-500 mb-8 max-w-sm text-sm md:text-base leading-relaxed">
          Đường dẫn bạn truy cập không tồn tại, có thể đã bị đổi tên, bị xoá, hoặc bạn không có quyền truy cập.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
          <Button 
            icon={<ArrowLeftOutlined />} 
            size="large" 
            onClick={() => router.back()}
            className="w-full sm:w-auto min-w-[140px]"
          >
            Quay lại
          </Button>
          <Link href="/" className="w-full sm:w-auto">
            <Button 
              type="primary" 
              icon={<HomeOutlined />} 
              size="large" 
              className="w-full min-w-[140px]"
            >
              Về trang chủ
            </Button>
          </Link>
        </div>
      </div>
      
      <div className="mt-8 text-slate-400 text-xs">
        © {new Date().getFullYear()} AZWorkbase. All rights reserved.
      </div>
    </div>
  );
}
