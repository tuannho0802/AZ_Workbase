'use client';

import { useState } from 'react';
import { Alert, App, Button, Card, Col, InputNumber, Row, Space, Statistic, Typography } from 'antd';
import type { Fanpage } from '@/lib/api/fanpages.api';
import { useFanpagePosts, useUpdateFanpage } from '@/lib/hooks/useFanpages';
import { toastApiError } from '@/lib/utils/error-message.util';
import { formatSinceLastPost, formatWeekProgress, postsNeeded } from '@/lib/utils/fanpageCadence';
import { CadenceBadge } from './CadenceBadge';
import { HealthTag } from './HealthTag';
import { FanpageHeatmap } from './FanpageHeatmap';
import { fmtNum, formatDelta } from '@/lib/utils/fanpageMetrics';

const { Text } = Typography;

interface Props {
    fanpage: Fanpage;
    /** Chuyển sang tab "Bài đăng" (sửa bài chưa có ngày, hoặc xem bài của 1 ngày khi bấm ô heatmap). */
    onOpenPosts: (date?: string) => void;
}

/** Tab "Tổng quan" của Drawer (4 chỉ số + heatmap 12 tuần). Mọi số lấy từ `fanpage.cadence` (BE tính), không tự tính lại. */
export function FanpageOverviewTab({ fanpage, onOpenPosts }: Props) {
    const { message } = App.useApp();
    const { posts } = useFanpagePosts(fanpage.id);
    const updateMut = useUpdateFanpage();
    const [target, setTarget] = useState<number | null>(fanpage.targetPostsPerWeek ?? null);
    const cadence = fanpage.cadence;
    const undated = posts.filter((p) => !p.postedDate).length;
    const dirty = (fanpage.targetPostsPerWeek ?? null) !== target;

    const saveTarget = async () => {
        try {
            await updateMut.mutateAsync({ id: fanpage.id, data: { targetPostsPerWeek: target } });
            message.success(target == null ? 'Đã bỏ mục tiêu đăng bài' : 'Đã cập nhật mục tiêu đăng bài');
        } catch (err) {
            toastApiError(message, err, 'Không thể cập nhật mục tiêu');
        }
    };

    if (!cadence) return null;
    const need = postsNeeded(cadence);

    return (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Space wrap>
                <CadenceBadge cadence={cadence} />
                <HealthTag health={fanpage.health} note={fanpage.healthNote} />
                {fanpage.isOrphan && <Text type="warning">Chưa có người phụ trách đang hoạt động</Text>}
            </Space>
            <Row gutter={[12, 12]}>
                <Col xs={12} md={6}>
                    <Card size="small">
                        <Statistic title="Nhịp tuần" value={formatWeekProgress(cadence)} />
                        {need > 0 && <Text type="secondary">Còn thiếu {need} bài</Text>}
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card size="small">
                        <Statistic title="Chuỗi ngày có bài" value={cadence.streak} suffix="ngày" />
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card size="small">
                        <Statistic title="Followers" value={fanpage.latestMetrics ? fmtNum(fanpage.latestMetrics.followers) : '—'} />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {fanpage.latestMetrics
                                ? (formatDelta(fanpage.latestMetrics.delta, fanpage.latestMetrics.deltaDays) || 'Mới có 1 lần nhập')
                                : 'Chưa có số liệu'}
                        </Text>
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card size="small">
                        <Statistic title="Bài gần nhất" value={formatSinceLastPost(cadence)} styles={{ content: { fontSize: 18 } }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>{fanpage.posts30d ?? 0} bài / 30 ngày</Text>
                    </Card>
                </Col>
            </Row>
            <Card size="small" title="Nhịp đăng 12 tuần">
                <FanpageHeatmap fanpageId={fanpage.id} weeks={12} onPickDate={(d) => onOpenPosts(d)} />
            </Card>
            {fanpage.flags.canEdit && (
                <Card size="small" title="Mục tiêu đăng bài / tuần">
                    <Space wrap>
                        <InputNumber min={1} max={35} precision={0} value={target} onChange={(v) => setTarget(v)} placeholder="Chưa đặt" />
                        <Button type="primary" disabled={!dirty} loading={updateMut.isPending} onClick={saveTarget}>
                            Lưu
                        </Button>
                        <Text type="secondary">Tuần tính từ Thứ Hai đến Chủ Nhật (giờ Việt Nam). Để trống = không đặt mục tiêu, không nhắc.</Text>
                    </Space>
                </Card>
            )}
            {undated > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    title={`${undated} bài chưa có ngày đăng — không được tính vào nhịp đăng.`}
                    action={
                        <Button size="small" onClick={() => onOpenPosts()}>
                            Sửa ngày
                        </Button>
                    }
                />
            )}
        </Space>
    );
}