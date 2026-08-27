'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Input, Select, DatePicker, Row, Col, App, Tag, Checkbox, Typography, Spin, Space } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { customersApi } from '@/lib/api/customers.api';
import { useMediaSources } from '@/lib/hooks/useMediaSources';
import { useLinkCategories, useLinkGroups } from '@/lib/hooks/useLinkGroups';
import { customerGroupMembershipsApi } from '@/lib/api/link-groups.api';
import { SalesUserSelect } from './SalesUserSelect';
import { SourceTag } from './SourceTag';
import { Customer } from '@/lib/types/customer.types';
import dayjs, { Dayjs } from 'dayjs';
import { isFutureVnDate } from '@/lib/utils/date-vn';

const { Text } = Typography;

interface CustomerFormProps {
  open: boolean;
  customer?: Customer | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const CustomerForm: React.FC<CustomerFormProps> = ({ open, customer, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  // ⚠️ Trước đây danh sách "Nguồn" hardcode cứng trong component
  // (Facebook/TikTok/Google/Instagram/Other) - admin không có cách nào thêm
  // nguồn mới mà không sửa code. Giờ lấy động từ /media-sources (chỉ nguồn
  // đang MỞ - activeOnly=true) - quản lý tại trang /nguon-media.
  const { sources } = useMediaSources(true);

  // ── Checklist "Tham gia nhóm" theo Nguồn đã chọn ──────────────────────────
  // Category (Zalo/FB/Threads...) khớp theo TÊN với Nguồn (media source) -
  // 2 bảng độc lập nhau ở BE, khớp bằng tên là quy ước phía FE (xem ghi chú
  // ở trang /nhom-lien-ket). "Nguồn" đổi -> checklist nhóm đổi theo ngay.
  const sourceValue = Form.useWatch('source', form);
  const { categories: linkCategories } = useLinkCategories(false);
  const matchedCategory = useMemo(
    () => linkCategories.find((c) => c.name.trim().toLowerCase() === (sourceValue || '').trim().toLowerCase()),
    [linkCategories, sourceValue],
  );
  const { groups: joinableGroups, isLoading: loadingJoinableGroups } = useLinkGroups(matchedCategory?.id, true);

  // Trạng thái "đã join" THẬT SỰ đang lưu trong DB (chỉ có ý nghĩa khi SỬA
  // khách hàng đã tồn tại) - dùng để biết group nào cần gọi API đổi trạng
  // thái khi lưu (bỏ qua group không đổi gì, tránh gọi API thừa).
  const [savedJoinedGroupIds, setSavedJoinedGroupIds] = useState<Set<number>>(new Set());
  // Trạng thái checkbox NGƯỜI DÙNG đang chọn trên UI (cả 2 chế độ tạo mới/sửa).
  const [checkedGroupIds, setCheckedGroupIds] = useState<Set<number>>(new Set());

  // Khi SỬA: nạp toàn bộ membership hiện có của khách hàng 1 lần khi mở modal.
  useEffect(() => {
    if (open && customer) {
      customerGroupMembershipsApi
        .getForCustomer(customer.id)
        .then((rows) => {
          setSavedJoinedGroupIds(new Set(rows.filter((r) => r.joined).map((r) => r.groupId)));
        })
        .catch(() => {
          // Không chặn việc sửa khách hàng chỉ vì lấy checklist nhóm lỗi -
          // im lặng bỏ qua, checklist sẽ hiện rỗng (an toàn, không mất dữ liệu).
          setSavedJoinedGroupIds(new Set());
        });
    } else if (open && !customer) {
      setSavedJoinedGroupIds(new Set());
    }
  }, [open, customer]);

  // Khi category khớp với Nguồn THAY ĐỔI (đổi Nguồn, hoặc vừa mở modal) ->
  // đồng bộ lại checkbox theo đúng trạng thái đã lưu của category đó.
  //
  // ⚠️ Bug infinite loop đã từng xảy ra ở đây: `joinableGroups` (từ
  // useLinkGroups) trước đây fallback `data ?? []` - literal `[]` này là 1
  // ARRAY MỚI mỗi lần render khi data chưa có (vd category chưa xác định),
  // khiến effect này (phụ thuộc `joinableGroups`) chạy lại MỖI RENDER, bên
  // trong lại setState -> re-render -> `[]` mới lại được tạo -> lặp vô hạn.
  // Đã fix ở NGUỒN (useLinkGroups.ts dùng 1 EMPTY_ARRAY hằng số dùng chung).
  // Giữ thêm guard này ở đây làm lớp phòng thủ thứ 2: dùng functional update
  // + so sánh nội dung, trả về ĐÚNG reference cũ (`prev`) khi tập hợp không
  // đổi gì - React sẽ tự bail-out (không re-render) khi updater trả về cùng
  // reference, chặn đứng vòng lặp dù có hook nào khác sau này lại tái phạm
  // lỗi tương tự (không phụ thuộc join JS reference đến từ ngoài).
  useEffect(() => {
    const idsInThisCategory = new Set(joinableGroups.map((g) => g.id));
    const nextIds = matchedCategory
      ? new Set([...savedJoinedGroupIds].filter((id) => idsInThisCategory.has(id)))
      : new Set<number>();

    setCheckedGroupIds((prev) => {
      if (prev.size === nextIds.size && [...prev].every((id) => nextIds.has(id))) {
        return prev; // không đổi gì -> trả nguyên reference cũ để React bail-out
      }
      return nextIds;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedCategory?.id, joinableGroups, savedJoinedGroupIds]);

  // Dùng chung <SourceTag> cho label của từng option - cùng 1 nguồn màu dữ
  // liệu với mọi nơi khác hiển thị nguồn (bảng khách hàng, Chia Data, Thùng
  // rác...), tránh mỗi chỗ tự vẽ Tag riêng rồi lệch màu nhau.
  const sourceOptions: { label: React.ReactNode; value: string; disabled?: boolean }[] =
    sources.map((s) => ({ label: <SourceTag source={s.name} />, value: s.name }));
  // Nếu đang SỬA 1 khách hàng có source đã bị KHOÁ/xoá khỏi danh sách đang
  // mở kể từ lúc tạo, vẫn cần hiện đúng giá trị đó (không để field trông
  // như trống/lỗi) - thêm nó vào options dưới dạng 1 lựa chọn riêng, gắn
  // thêm Tag "Đã khoá" bên cạnh SourceTag, và disable để không ai chọn lại
  // nguồn đã khoá cho khách hàng khác (chỉ giữ hiển thị cho khách này).
  if (customer?.source && !sourceOptions.some((o) => o.value === customer.source)) {
    sourceOptions.push({
      label: (
        <span>
          <SourceTag source={customer.source} />
          <Tag color="default" style={{ marginLeft: 4 }}>Đã khoá</Tag>
        </span>
      ),
      value: customer.source,
      disabled: true,
    });
  }


  useEffect(() => {
    if (open) {
      if (customer) {
        form.setFieldsValue({
          ...customer,
          inputDate: customer.inputDate ? dayjs(customer.inputDate) : dayjs(),
          assignedDate: customer.assignedDate ? dayjs(customer.assignedDate) : null,
          closedDate: customer.closedDate ? dayjs(customer.closedDate) : null,
          salesUserId: customer.salesUser?.id,
          marketingUserId: customer.marketingUser?.id,
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          status: 'pending',
          inputDate: dayjs(),
          // Mặc định nguồn đầu tiên đang MỞ thay vì hardcode 'Facebook' -
          // nếu admin đã khoá/xoá Facebook, hardcode sẽ trỏ vào 1 option
          // không còn tồn tại trong dropdown.
          source: sources[0]?.name,
        });
      }
    }
  }, [open, customer, form, sources]);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const payload = {
        ...values,
        salesUserId: values.salesUserId ? Number(values.salesUserId) : null,
        marketingUserId: values.marketingUserId ? Number(values.marketingUserId) : null,
        inputDate: values.inputDate.format('YYYY-MM-DD'),
        assignedDate: values.assignedDate?.format('YYYY-MM-DD') || null,
        closedDate: values.closedDate?.format('YYYY-MM-DD') || null,
      };

      let targetCustomerId: number;
      if (customer) {
        await customersApi.updateCustomer(customer.id, payload);
        targetCustomerId = customer.id;
        message.success('Cập nhật khách hàng thành công');
      } else {
        const created = await customersApi.createCustomer(payload);
        targetCustomerId = created.id;
        message.success('Thêm khách hàng thành công');
      }

      // Áp dụng checklist "tham gia nhóm" - CHỈ với các group đang hiện
      // trong checklist (thuộc category khớp Nguồn hiện tại), và CHỈ gọi
      // API cho group nào có THAY ĐỔI so với trạng thái đã lưu - tránh gọi
      // thừa cho những group người dùng không đụng tới.
      const membershipChanges = joinableGroups
        .filter((g) => checkedGroupIds.has(g.id) !== savedJoinedGroupIds.has(g.id))
        .map((g) => ({ groupId: g.id, joined: checkedGroupIds.has(g.id) }));

      if (membershipChanges.length > 0) {
        try {
          await Promise.all(
            membershipChanges.map(({ groupId, joined }) =>
              customerGroupMembershipsApi.setMembership(targetCustomerId, groupId, joined),
            ),
          );
        } catch (membershipErr) {
          console.error(membershipErr);
          message.warning('Đã lưu khách hàng nhưng có lỗi khi cập nhật checklist tham gia nhóm - vào tab "Nhóm" trong chi tiết khách hàng để kiểm tra lại.');
        }
      }
      
      onSuccess();
      onClose();
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorMsg = errorData?.message || 'Có lỗi xảy ra';
      if (Array.isArray(errorMsg)) {
        errorMsg.forEach((msg: string) => message.error(msg));
      } else {
        message.error(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={customer ? `Chỉnh sửa: ${customer.name}` : "Thêm khách hàng mới"}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={loading}
      width={700}
      okText={customer ? "Lưu thay đổi" : "Thêm khách hàng"}
      cancelText="Hủy"
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        style={{ marginTop: 16 }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="name" label="Họ tên" rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}>
              <Input placeholder="Nguyễn Văn A" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item 
              name="phone" 
              label="Số điện thoại (Tuỳ chọn)" 
              rules={[
                { pattern: /^(09|08|07|03|05)[0-9]{8}$/, message: 'SĐT không hợp lệ' }
              ]}
            >
              <Input placeholder="Số điện thoại (Không bắt buộc)" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
              <Input placeholder="example@gmail.com" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="source" label="Nguồn" rules={[{ required: true }]}>
              <Select options={sourceOptions} placeholder="Chọn nguồn" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="campaign" label="UTM">
              <Input placeholder="Ví dụ: D_T01_BOT_AP" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Tham gia nhóm" tooltip="Chỉ hiện các nhóm thuộc Category trùng tên với Nguồn đã chọn ở trên. Quản lý Category/Group tại 'Quản lý nhóm liên kết'.">
              {!sourceValue ? (
                <Text type="secondary" style={{ fontSize: 12 }}>Chọn Nguồn trước để xem danh sách nhóm</Text>
              ) : loadingJoinableGroups ? (
                <Spin size="small" />
              ) : !matchedCategory ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Chưa có Category nào tên trùng "{sourceValue}" trong Quản lý nhóm liên kết
                </Text>
              ) : joinableGroups.length === 0 ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Category "{matchedCategory.name}" chưa có nhóm nào đang hiện
                </Text>
              ) : (
                <div style={{ maxHeight: 110, overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: 6, padding: 8 }}>
                  <Checkbox.Group
                    style={{ width: '100%' }}
                    value={[...checkedGroupIds]}
                    onChange={(vals) => setCheckedGroupIds(new Set(vals as number[]))}
                  >
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      {joinableGroups.map((g) => (
                        <Checkbox key={g.id} value={g.id}>
                          <Text>{g.name}</Text>
                          <a href={g.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ marginLeft: 6, fontSize: 12 }}>
                            <LinkOutlined />
                          </a>
                        </Checkbox>
                      ))}
                    </Space>
                  </Checkbox.Group>
                </div>
              )}
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="salesUserId" label="Sales phụ trách">
              <SalesUserSelect />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="marketingUserId" label="Marketing phụ trách">
              <SalesUserSelect placeholder="Chọn Marketing đang hoạt động..." />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="inputDate"
              label="Ngày nhập data"
              rules={[
                { required: true, message: 'Vui lòng chọn ngày nhập data' },
                {
                  validator: (_rule, value: Dayjs | null) =>
                    isFutureVnDate(value)
                      ? Promise.reject(new Error('Ngày nhập data không được lớn hơn ngày hiện tại'))
                      : Promise.resolve(),
                },
              ]}
            >
              {/* disabledDate: chặn chọn ngày tương lai (so với chuẩn GMT+7,
                  đồng bộ với validation phía BE) ngay trên UI, thay vì để
                  người dùng chọn xong mới báo lỗi. */}
              <DatePicker
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                disabledDate={(current) => isFutureVnDate(current)}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="assignedDate" label="Ngày nhận KH">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Chưa nhận" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="closedDate" label="Ngày chốt">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Chưa chốt" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="status" label="Trạng thái">
          <Select
            options={[
              { value: 'pending', label: 'Chờ xử lý' },
              { value: 'potential', label: 'Tiềm năng' },
              { value: 'closed', label: 'Đã chốt' },
              { value: 'lost', label: 'Mất' },
              { value: 'inactive', label: 'Ngừng chăm sóc' },
            ]}
          />
        </Form.Item>

        <Form.Item name="note" label="Ghi chú">
          <Input.TextArea rows={3} placeholder="Ghi chú quan trọng về khách hàng..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};