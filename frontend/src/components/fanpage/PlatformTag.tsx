import { Tag } from 'antd';
import type { FanpagePlatform } from '@/lib/api/fanpages.api';

/** Tag nền tảng theo màu cấu hình; nền tảng đã khoá hiện mờ + hậu tố để người xem biết. */
export function PlatformTag({ platform }: { platform: Pick<FanpagePlatform, 'name' | 'color' | 'isActive'> }) {
    return (
        <Tag color={platform.color} style={platform.isActive ? undefined : { opacity: 0.6 }}>
            {platform.name}
            {platform.isActive ? '' : ' (đã khoá)'}
        </Tag>
    );
}