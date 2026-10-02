'use client';

import { Space } from 'antd';
import { UtmTag } from '@/components/utms/UtmTag';
import type { GuideDemo } from '../guide-demo.types';

/** Mẫu của module UTM (`/quan-ly-utm`). */
export const UTM_DEMOS: GuideDemo[] = [
    {
        id: 'utm-tags',
        title: 'Tag UTM (bình thường và đã khoá)',
        description: 'UTM đã khoá hiện mờ + gạch ngang',
        render: () => (
            <Space wrap>
                <UtmTag name="FB_Q4" color="#1677ff" />
                <UtmTag name="TT_Summer" color="#eb2f96" />
                <UtmTag name="GG_Old" color="#52c41a" inactive />
            </Space>
        ),
    },
];
