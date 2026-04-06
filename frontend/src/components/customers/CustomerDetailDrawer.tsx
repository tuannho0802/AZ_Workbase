'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Drawer, 
  Tabs, 
  Space, 
  Typography, 
  Button, 
  Spin, 
  App
} from 'antd';
import { 
  TeamOutlined, 
  ReloadOutlined,
  InfoCircleOutlined,
  FileTextOutlined,
  DollarOutlined
} from '@ant-design/icons';
import { Customer } from '@/lib/types/customer.types';
import { customersApi } from '@/lib/api/customers.api';
import { CustomerDepositTable } from './CustomerDepositTable';
import { CustomerInfoTab } from './CustomerInfoTab';
import { CustomerNotesTab } from './CustomerNotesTab';
import { DepositForm } from './DepositForm';
import { CustomerForm } from './CustomerForm';

// const { TabPane } = Tabs; // Removed for antd 5.x items prop
const { Text } = Typography;

interface CustomerDetailDrawerProps {
  open: boolean;
  customerId: number | null;
  onClose: () => void;
  onUpdate?: () => void;
}

export const CustomerDetailDrawer = ({ open, customerId, onClose, onUpdate }: CustomerDetailDrawerProps) => {
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [activeTab, setActiveTab] = useState('info');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { message } = App.useApp();
  const [depositRefreshTrigger, setDepositRefreshTrigger] = useState(0);

  const fetchDetail = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const data = await customersApi.getCustomer(customerId);
      setCustomer(data);
    } catch (error) {
      message.error('Không thể lấy thông tin khách hàng');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [customerId, message, onClose]);

  useEffect(() => {
    if (open && customerId) {
      fetchDetail();
    } else {
      setCustomer(null);
      setActiveTab('info');
      setIsModalOpen(false);
    }
  }, [open, customerId, fetchDetail]);

  const handleNoteAdded = () => {
    fetchDetail();
    onUpdate?.();
  };

  const handleDepositSuccess = () => {
    setDepositRefreshTrigger(prev => prev + 1);
    fetchDetail();
    onUpdate?.();
  };

  return (
    <Drawer
      title={
        <Space>
          <TeamOutlined />
          <span>Chi tiết khách hàng: <Text strong>{customer?.name || '...'}</Text></span>
        </Space>
      }
      size="large"
      onClose={onClose}
      open={open}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchDetail} loading={loading}>
            Làm mới
          </Button>
        </Space>
      }
    >
      {loading && !customer ? (
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <Spin size="large" />
        </div>
      ) : (
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          items={[
            {
              key: 'info',
              label: (<span><InfoCircleOutlined />Chi tiết</span>),
              children: (
                <CustomerInfoTab 
                  customer={customer} 
                  onEdit={() => setIsModalOpen(true)} 
                />
              )
            },
            {
              key: 'notes',
              label: (<span><FileTextOutlined />Ghi chú ({customer?.notes?.length || 0})</span>),
              children: customerId ? (
                <CustomerNotesTab 
                  customerId={customerId} 
                  notes={customer?.notes || []} 
                  onNoteAdded={handleNoteAdded} 
                />
              ) : null
            },
            {
              key: 'deposits',
              label: (<span><DollarOutlined />Nạp tiền ({customer?.deposits?.length || 0})</span>),
              children: customerId ? (
                <>
                  <DepositForm 
                    customerId={customerId} 
                    onSuccess={handleDepositSuccess} 
                  />
                  <CustomerDepositTable 
                    customerId={customerId} 
                    refreshTrigger={depositRefreshTrigger} 
                  />
                </>
              ) : null
            }
          ]}
        />
      )}

      <CustomerForm
        open={isModalOpen}
        customer={customer}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          setIsModalOpen(false);
          fetchDetail();
          onUpdate?.();
        }}
      />
    </Drawer>
  );
};
