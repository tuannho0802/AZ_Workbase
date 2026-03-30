import React, { useState } from 'react';
import { Modal, Upload, message, Table, Button, notification } from 'antd';
import { InboxOutlined, DownloadOutlined } from '@ant-design/icons';
import type { UploadProps, UploadFile } from 'antd';
import { generateTemplateFile } from '@/lib/utils/excel-template';
import axiosInstance from '@/lib/api/axios-instance';

const { Dragger } = Upload;

interface ImportExcelModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ImportExcelModal: React.FC<ImportExcelModalProps> = ({ open, onClose, onSuccess }) => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorData, setErrorData] = useState<any[]>(null as any);

  const handleUpload = async () => {
    if (fileList.length === 0) return;
    
    const formData = new FormData();
    formData.append('file', fileList[0].originFileObj as Blob);

    setLoading(true);
    try {
      const response = await axiosInstance.post('/customers/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = response.data;
      
      if (data.skipCount === 0) {
        notification.success({ message: `✅ Nhập thành công ${data.successCount} khách hàng` });
        onSuccess();
        handleClose();
      } else {
        notification.warning({ message: `⚠️ Đã nhập ${data.successCount} khách hàng. Bỏ qua ${data.skipCount} dòng bị lỗi.` });
        setErrorData(data.errors);
        onSuccess();
      }
    } catch (error: any) {
      notification.error({ message: 'Lỗi Import', description: error.response?.data?.message || 'Có lỗi xảy ra' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFileList([]);
    setErrorData(null as any);
    onClose();
  };

  const draggerProps: UploadProps = {
    onRemove: (file) => {
      setFileList(prev => prev.filter(f => f.uid !== file.uid));
    },
    beforeUpload: (file) => {
      const isExcelOrCsv = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.type === 'text/csv' || file.name.endsWith('.xlsx') || file.name.endsWith('.csv');
      if (!isExcelOrCsv) {
        message.error('Chỉ chấp nhận file .xlsx hoặc .csv');
        return Upload.LIST_IGNORE;
      }
      const isLt5M = file.size / 1024 / 1024 < 5;
      if (!isLt5M) {
        message.error('File không được vượt quá 5MB');
        return Upload.LIST_IGNORE;
      }
      setFileList([file]);
      return false;
    },
    fileList,
    maxCount: 1,
  };

  return (
    <Modal
      title="Nhập dữ liệu khách hàng từ Excel"
      open={open}
      onCancel={handleClose}
      footer={[
        <Button key="cancel" onClick={handleClose}>Hủy</Button>,
        <Button key="submit" type="primary" loading={loading} disabled={fileList.length === 0} onClick={handleUpload}>Nhập dữ liệu</Button>
      ]}
      width={errorData ? 800 : 520}
    >
      {!errorData ? (
        <>
          <div className="mb-4 text-right">
            <Button type="link" icon={<DownloadOutlined />} onClick={generateTemplateFile}>
              Tải file mẫu (.xlsx)
            </Button>
          </div>
          <Dragger {...draggerProps}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Kéo thả file vào đây hoặc nhấn để chọn</p>
            <p className="ant-upload-hint">Hỗ trợ định dạng .xlsx, .csv. Tối đa 5MB, 1000 dòng.</p>
          </Dragger>
        </>
      ) : (
        <div>
          <Table 
            size="small"
            dataSource={errorData} 
            rowKey={(r) => r.row + r.phone}
            columns={[
              { title: 'Dòng', dataIndex: 'row', width: 60 },
              { title: 'Họ và tên', dataIndex: 'name', width: 150 },
              { title: 'SĐT', dataIndex: 'phone', width: 120 },
              { title: 'Lý do bị từ chối', dataIndex: 'reason' },
            ]}
            pagination={{ pageSize: 5 }}
            className="mt-4"
          />
        </div>
      )}
    </Modal>
  );
};
