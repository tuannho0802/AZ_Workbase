import type { ComponentProps } from 'react';
import { Tag } from 'antd';
import type { FanpageUserBrief } from '@/lib/api/fanpages.api';
import { ownerTagColor } from '@/lib/utils/fanpageColors';

type Props = {
    user: Pick<FanpageUserBrief, 'id' | 'name'>;
    /** Người phụ trách chính - tô đậm (solid) để phân biệt với người phụ trách phụ. */
    primary?: boolean;
} & Pick<ComponentProps<typeof Tag>, 'closable' | 'onClose' | 'onMouseDown' | 'style'>;

/** Tag người phụ trách - màu ổn định theo id user. */
export function OwnerTag({ user, primary, style, ...rest }: Props) {
    return (
        <Tag color={ownerTagColor(user.id)} variant={primary ? 'solid' : undefined} style={{ marginInlineEnd: 4, ...style }} {...rest}>
            {user.name}
        </Tag>
    );
}
