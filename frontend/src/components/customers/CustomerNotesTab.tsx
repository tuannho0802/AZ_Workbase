'use client';

import { useState } from 'react';
import { Card, Form, Input, Space, Select, Switch, Button, Tag, Typography, Empty, App, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { CustomerNote } from '@/lib/types/customer.types';
import { customersApi } from '@/lib/api/customers.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import dayjs from 'dayjs';

const { Text } = Typography;

const NOTE_TYPE_OPTIONS = [
  { value: 'general', label: 'Chung' },
  { value: 'call', label: 'Cuộc gọi' },
  { value: 'meeting', label: 'Cuộc họp' },
  { value: 'follow_up', label: 'Theo dõi' },
];

interface Props {
  customerId: number;
  notes: CustomerNote[];
  onNoteAdded: () => void;
}

export const CustomerNotesTab = ({ customerId, notes, onNoteAdded }: Props) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  const currentUser = useAuthStore((s) => s.user);
  const { can } = useMyPermissions();

  // Sửa/xoá ghi chú CHÍNH MÌNH tạo luôn được phép (BE tự cho qua không cần
  // permission - xem CustomersService.updateNote/deleteNote), sửa/xoá ghi
  // chú CỦA NGƯỜI KHÁC cần permission customer_notes.edit/.delete tương ứng
  // (Admin/Assistant toàn bộ, Manager trong phòng ban quản lý - xem migration
  // SplitCustomerNotesPermissions). BE luôn là nguồn kiểm tra thật cuối cùng,
  // đây chỉ là điều kiện ẩn/hiện nút cho gọn giao diện.
  const canEditNote = (note: CustomerNote) => note.createdBy === currentUser?.id || can('customer_notes.edit');
  const canDeleteNote = (note: CustomerNote) => note.createdBy === currentUser?.id || can('customer_notes.delete');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleSubmit = async (values: { note: string; noteType: string; isImportant?: boolean }) => {
    setLoading(true);
    try {
      await customersApi.createNote(customerId, values);
      message.success('Đã thêm ghi chú');
      form.resetFields();
      onNoteAdded();
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Lỗi khi thêm ghi chú'));
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (note: CustomerNote) => {
    setEditingId(note.id);
    setEditValue(note.note);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const saveEdit = async (noteId: number) => {
    if (!editValue.trim()) {
      message.error('Nội dung ghi chú không được để trống');
      return;
    }
    setEditSaving(true);
    try {
      await customersApi.updateNote(customerId, noteId, { note: editValue.trim() });
      message.success('Đã cập nhật ghi chú');
      cancelEdit();
      onNoteAdded(); // dùng lại callback refetch có sẵn (tên cũ nhưng đúng nhu cầu: load lại danh sách note)
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Lỗi khi sửa ghi chú'));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (noteId: number) => {
    setDeletingId(noteId);
    try {
      await customersApi.deleteNote(customerId, noteId);
      message.success('Đã xoá ghi chú');
      onNoteAdded();
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Lỗi khi xoá ghi chú'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ padding: '0px 8px' }}>
      <Card size="small" title="Thêm ghi chú mới" style={{ marginBottom: 16 }}>
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item name="note" rules={[{ required: true, message: 'Vui lòng nhập nội dung' }]}>
            <Input.TextArea placeholder="Nhập ghi chú quan trọng..." rows={3} />
          </Form.Item>
          <Space>
            <Form.Item name="noteType" initialValue="general" style={{ marginBottom: 0 }}>
              <Select style={{ width: 120 }} options={NOTE_TYPE_OPTIONS} />
            </Form.Item>
            <Form.Item name="isImportant" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch checkedChildren="🔥" unCheckedChildren="Bình thường" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} icon={<PlusOutlined />}>
              Thêm
            </Button>
          </Space>
        </Form>
      </Card>

      <div className="notes-list" style={{ marginTop: 16 }}>
        {notes.length === 0 ? (
          <Empty description="Chưa có ghi chú nào" />
        ) : (
            notes.map((item: CustomerNote) => {
              const isEditing = editingId === item.id;
              return (
                <div
                  key={item.id}
                  style={{
                    padding: '12px',
                    borderBottom: '1px solid #f0f0f0',
                    backgroundColor: item.isImportant ? '#fff1f0' : 'transparent',
                  borderRadius: item.isImportant ? '4px' : '0',
                }}
              >
                <Space style={{ marginBottom: 4, width: '100%', justifyContent: 'space-between' }}>
                  <Space>
                    <Text strong>{item.createdByUser?.name || 'Hệ thống'}</Text>
                    <Tag color={item.isImportant ? 'error' : 'default'}>{item.noteType}</Tag>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {dayjs(item.createdAt).format('DD/MM/YYYY HH:mm')}
                    </Text>
                  </Space>
                  {!isEditing && (
                    <Space size={4}>
                      {canEditNote(item) && (
                        <Button
                          size="small"
                          type="text"
                          icon={<EditOutlined />}
                          onClick={() => startEdit(item)}
                        />
                      )}
                      {canDeleteNote(item) && (
                        <Popconfirm
                          title="Xoá ghi chú này?"
                          okText="Xoá"
                          cancelText="Huỷ"
                          onConfirm={() => handleDelete(item.id)}
                        >
                          <Button
                            size="small"
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            loading={deletingId === item.id}
                          />
                        </Popconfirm>
                      )}
                    </Space>
                  )}
                </Space>

                {isEditing ? (
                  <div>
                    <Input.TextArea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      rows={3}
                      autoFocus
                      style={{ marginBottom: 8 }}
                    />
                    <Space>
                      <Button
                        size="small"
                        type="primary"
                        icon={<CheckOutlined />}
                        loading={editSaving}
                        onClick={() => saveEdit(item.id)}
                      >
                        Lưu
                      </Button>
                      <Button size="small" icon={<CloseOutlined />} onClick={cancelEdit}>
                        Huỷ
                      </Button>
                    </Space>
                  </div>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', color: '#262626', fontSize: '14px' }}>{item.note}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};