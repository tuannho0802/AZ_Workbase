'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Input, Select, DatePicker, Row, Col, App, Tag, Typography, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { customersApi } from '@/lib/api/customers.api';
import { useMediaSources } from '@/lib/hooks/useMediaSources';
import { useCustomerStatuses } from '@/lib/hooks/useCustomerStatuses';
import { useAllActiveLinkGroups } from '@/lib/hooks/useLinkGroups';
import { customerGroupMembershipsApi } from '@/lib/api/link-groups.api';
import { SalesUserSelect, type UserOption } from './SalesUserSelect';
import { useAssignmentGroupUsers } from '@/lib/hooks/useAssignmentGroups';
import { SourceTag } from './SourceTag';
import { GroupPickerModal } from './GroupPickerModal';
import { Customer } from '@/lib/types/customer.types';
import dayjs, { Dayjs } from 'dayjs';
import { isFutureVnDate } from '@/lib/utils/date-vn';
import { useMyHiddenElements } from '@/lib/hooks/useUiVisibility';

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

  // ⚠️ MỚI (đồng bộ /quan-ly-status-khach, thay ENUM cứng cũ - xem migration
  // CreateCustomerStatuses1781400000000) - trước đây dropdown "Trạng thái"
  // hardcode 5 option cố định trong chính component này (không biết tới 4
  // trạng thái mới hay trạng thái tuỳ chỉnh admin tự thêm sau). Lấy động từ
  // /customer-statuses, mirror đúng cách `sources` ở trên.
  const { statuses } = useCustomerStatuses();

  // ⚠️ MỚI - rà soát Vị trí 2026-09-10 (đồng bộ với CustomerFilters.tsx +
  // cột bảng ở page.tsx): field:sales_assignment/field:marketing_assignment
  // bị ẩn qua Position override thì Modal Thêm/Sửa cũng PHẢI ẩn đúng 2 field
  // "Sales phụ trách"/"Marketing phụ trách" - trước đây modal này không hề
  // biết tới rule ẩn, luôn hiện đủ cả 2 field bất kể cấu hình gì.
  const { hiddenKeys } = useMyHiddenElements('customers');
  const hideSalesField = hiddenKeys.includes('field:sales_assignment');
  const hideMarketingField = hiddenKeys.includes('field:marketing_assignment');

  // ⚠️ SỬA (2026-09-10, theo phản hồi người dùng - "Sao lại filter mất luôn
  // rồi" / "User thuộc phòng ban mới vừa update đâu?"): bản trước tự dò
  // phòng ban theo TÊN cứng ('kinh doanh'/'marketing') qua useDepartments()
  // + .find(), CHỈ khớp ĐÚNG 1 phòng ban duy nhất. Khi Admin vào trang
  // "/quan-ly-phu-trach" thêm phòng ban thứ 2 (vd "Phòng Hỗ trợ kỹ thuật")
  // vào config `sales`, nhân viên phòng đó vẫn KHÔNG hiện ra ở đây vì code
  // chưa hề đọc config này - "Quản lý phụ trách" tồn tại chính là để đổi
  // filter mà không cần sửa FE, nhưng modal này chưa được wire vào đó.
  // Đổi sang dùng thẳng `useAssignmentGroupUsers('sales'|'marketing')` -
  // ĐÚNG NGUỒN mà bộ lọc bảng danh sách khách hàng (customers/page.tsx,
  // salesUsersInDept/marketingUsersInDept) đã dùng từ trước - giờ đồng bộ 1
  // nguồn duy nhất, sửa config ở /quan-ly-phu-trach có tác dụng ngay ở cả 2 nơi.
  const { users: salesCandidatesRaw } = useAssignmentGroupUsers('sales');
  const { users: marketingCandidatesRaw } = useAssignmentGroupUsers('marketing');
  const salesCandidates: UserOption[] = useMemo(
    () =>
      salesCandidatesRaw.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        department: u.department ?? undefined,
        position: u.position ?? undefined,
      })),
    [salesCandidatesRaw],
  );
  const marketingCandidates: UserOption[] = useMemo(
    () =>
      marketingCandidatesRaw.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        department: u.department ?? undefined,
        position: u.position ?? undefined,
      })),
    [marketingCandidatesRaw],
  );

  // ── "Tham gia nhóm" - chọn TỰ DO, KHÔNG còn ràng buộc trùng Category với
  // Nguồn đã chọn nữa. Trước đây bắt buộc trùng tên (Nguồn "Facebook" chỉ
  // chọn được nhóm thuộc category "Facebook") - đã bỏ vì không đúng thực tế
  // (khách đến từ Facebook vẫn có thể được mời vào nhóm Zalo để chăm sóc) và
  // Backend cũng không hề bắt buộc quan hệ này (đã kiểm tra
  // `CustomerGroupMembershipsService.setMembership()` - chỉ validate
  // customer/group tồn tại, không check chéo category/source nào) - xem
  // thêm ghi chú ở `GroupPickerModal.tsx`.
  //
  // UI: field trông như 1 Select đã đóng (hiện Tag tên các nhóm đã chọn),
  // bấm vào mở `GroupPickerModal` - modal phụ để chọn nhóm giữa TẤT CẢ nhóm
  // đang active, không giới hạn category nào.
  const { groups: allGroups, isLoading: loadingAllGroups } = useAllActiveLinkGroups();
  const groupById = useMemo(() => new Map(allGroups.map((g) => [g.id, g])), [allGroups]);

  // Trạng thái checkbox NGƯỜI DÙNG đang chọn (cả 2 chế độ tạo mới/sửa).
  const [checkedGroupIds, setCheckedGroupIds] = useState<Set<number>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);

  // Trạng thái "đã join" THẬT SỰ đang lưu trong DB (chỉ có ý nghĩa khi SỬA
  // khách hàng đã tồn tại) - dùng để biết group nào cần gọi API đổi trạng
  // thái khi lưu (bỏ qua group không đổi gì, tránh gọi API thừa).
  const [savedJoinedGroupIds, setSavedJoinedGroupIds] = useState<Set<number>>(new Set());

  // Khi SỬA: nạp toàn bộ membership hiện có của khách hàng 1 lần khi mở modal,
  // rồi dùng THẲNG làm trạng thái checkbox ban đầu - không cần lọc theo
  // category nào nữa (khác bản cũ), nên không còn nguy cơ vòng lặp vô hạn
  // đã từng gặp phải khi đồng bộ theo category đổi liên tục.
  useEffect(() => {
    if (open && customer) {
      customerGroupMembershipsApi
        .getForCustomer(customer.id)
        .then(({ items }) => {
          const joined = new Set(items.filter((r) => r.joined).map((r) => r.groupId));
          setSavedJoinedGroupIds(joined);
          setCheckedGroupIds(joined);
        })
        .catch(() => {
          // Không chặn việc sửa khách hàng chỉ vì lấy checklist nhóm lỗi -
          // im lặng bỏ qua, checklist sẽ hiện rỗng (an toàn, không mất dữ liệu).
          setSavedJoinedGroupIds(new Set());
          setCheckedGroupIds(new Set());
        });
    } else if (open && !customer) {
      setSavedJoinedGroupIds(new Set());
      setCheckedGroupIds(new Set());
    }
  }, [open, customer]);

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

  // Mirror đúng `sourceOptions` phía trên - lấy TẤT CẢ trạng thái đang có
  // (kể cả không phải hệ thống) làm option dropdown, tô Tag đúng màu đã cấu
  // hình ở /quan-ly-status-khach.
  const statusOptions: { label: React.ReactNode; value: string; disabled?: boolean }[] =
    statuses.map((s) => ({ value: s.code, label: <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.name}</Tag> }));
  // Nếu đang SỬA 1 khách hàng có status không còn khớp dòng nào trong
  // customer_statuses (dữ liệu cũ từ trước khi có cơ chế bắt buộc fallback
  // khi xoá) - vẫn hiện đúng giá trị đó thay vì để dropdown trống trơn.
  if (customer?.status && !statusOptions.some((o) => o.value === customer.status)) {
    statusOptions.push({
      label: (
        <Tag color="default" style={{ marginInlineEnd: 0 }}>
          {customer.status} (không xác định)
        </Tag>
      ),
      value: customer.status,
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
          // Mặc định 'pending' (Chờ xử lý) nếu còn tồn tại - đúng vai trò
          // "mặc định khi vừa nhập khách" ghi trong migration
          // CreateCustomerStatuses1781400000000; nếu admin lỡ xoá cả status
          // 'pending' (không nên xảy ra vì đây là status hệ thống, nhưng vẫn
          // phòng hờ), fallback về status ĐẦU TIÊN đang có thay vì trỏ vào 1
          // giá trị không tồn tại.
          status: statuses.some((s) => s.code === 'pending') ? 'pending' : statuses[0]?.code,
          inputDate: dayjs(),
          // Mặc định nguồn đầu tiên đang MỞ thay vì hardcode 'Facebook' -
          // nếu admin đã khoá/xoá Facebook, hardcode sẽ trỏ vào 1 option
          // không còn tồn tại trong dropdown.
          source: sources[0]?.name,
        });
      }
    }
  }, [open, customer, form, sources, statuses]);

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

      // Áp dụng lựa chọn "tham gia nhóm" - CHỈ gọi API cho group nào có THAY
      // ĐỔI so với trạng thái đã lưu, tránh gọi thừa cho group người dùng
      // không đụng tới. Không còn giới hạn theo "joinableGroups" (category
      // khớp Nguồn) như bản cũ - checkedGroupIds giờ có thể là BẤT KỲ group
      // active nào, lấy trực tiếp từ GroupPickerModal.
      const allGroupIds = new Set([...checkedGroupIds, ...savedJoinedGroupIds]);
      const membershipChanges = Array.from(allGroupIds)
        .filter((groupId) => checkedGroupIds.has(groupId) !== savedJoinedGroupIds.has(groupId))
        .map((groupId) => ({ groupId, joined: checkedGroupIds.has(groupId) }));

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
            <Form.Item
              label="Tham gia nhóm"
              tooltip="Chọn TỰ DO trong mọi nhóm đang hoạt động, không cần trùng Category với Nguồn đã chọn ở trên. Quản lý Category/Group tại 'Quản lý nhóm liên kết'."
            >
              {/* Field trông như 1 Select đã đóng - bấm vào (hoặc bấm nút
                  "Chọn nhóm") để mở GroupPickerModal, KHÔNG dùng antd
                  <Select> thật vì danh sách nhóm cần hiện theo từng cụm
                  category + có ô tìm kiếm riêng, antd Select mặc định không
                  hỗ trợ tốt kiểu bố cục phân nhóm 2 cấp này. */}
              <div
                onClick={() => setPickerOpen(true)}
                style={{
                  minHeight: 32,
                  border: '1px solid #d9d9d9',
                  borderRadius: 6,
                  padding: '4px 11px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 4,
                  alignItems: 'center',
                }}
              >
                {loadingAllGroups ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>Đang tải danh sách nhóm...</Text>
                ) : checkedGroupIds.size === 0 ? (
                  <Text type="secondary">Bấm để chọn nhóm tham gia...</Text>
                ) : (
                  [...checkedGroupIds].map((id) => {
                    const g = groupById.get(id);
                    return (
                      <Tag
                        key={id}
                        color={g?.category?.color ?? 'default'}
                        closable
                        onClose={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setCheckedGroupIds((prev) => {
                            const next = new Set(prev);
                            next.delete(id);
                            return next;
                          });
                        }}
                      >
                        {g?.name ?? `Nhóm #${id}`}
                      </Tag>
                    );
                  })
                )}
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPickerOpen(true);
                  }}
                >
                  Chọn nhóm
                </Button>
              </div>
            </Form.Item>
          </Col>
        </Row>

        {(!hideSalesField || !hideMarketingField) && (
          <Row gutter={16}>
            {!hideSalesField && (
              <Col span={hideMarketingField ? 24 : 12}>
                <Form.Item name="salesUserId" label="Sales phụ trách">
                  <SalesUserSelect users={salesCandidates} />
                </Form.Item>
              </Col>
            )}
            {!hideMarketingField && (
              <Col span={hideSalesField ? 24 : 12}>
                <Form.Item name="marketingUserId" label="Marketing phụ trách">
                  <SalesUserSelect placeholder="Chọn Marketing đang hoạt động..." users={marketingCandidates} />
                </Form.Item>
              </Col>
            )}
          </Row>
        )}

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
          <Select options={statusOptions} placeholder="Chọn trạng thái" />
        </Form.Item>

        <Form.Item name="note" label="Ghi chú">
          <Input.TextArea rows={3} placeholder="Ghi chú quan trọng về khách hàng..." />
        </Form.Item>
      </Form>

      <GroupPickerModal
        open={pickerOpen}
        loading={loadingAllGroups}
        allGroups={allGroups}
        value={checkedGroupIds}
        onOk={(next) => {
          setCheckedGroupIds(next);
          setPickerOpen(false);
        }}
        onCancel={() => setPickerOpen(false)}
      />
    </Modal>
  );
};