import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Form, Button } from 'antd';
import { PasswordExpiryField } from './PasswordExpiryField';

function Harness({ onSubmit }: { onSubmit: (v: { passwordExpiryDays: number | null }) => void }) {
  return (
    <Form onFinish={onSubmit}>
      <PasswordExpiryField />
      <Button htmlType="submit">gui</Button>
    </Form>
  );
}

describe('PasswordExpiryField (P6)', () => {
  it('mặc định "Vô hạn" -> gửi null, không hiện ô số ngày', async () => {
    let got: unknown = 'chua';
    render(<Harness onSubmit={(v) => { got = v.passwordExpiryDays; }} />);
    expect(screen.queryByLabelText('Số ngày hạn mật khẩu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('gui'));
    await waitFor(() => expect(got).toBeNull());
  });

  it('chọn "Có hạn" -> hiện ô số ngày mặc định 90 và gửi 90', async () => {
    let got: unknown = 'chua';
    render(<Harness onSubmit={(v) => { got = v.passwordExpiryDays; }} />);
    fireEvent.click(screen.getByLabelText('Có hạn'));
    const input = await screen.findByLabelText('Số ngày hạn mật khẩu');
    expect(input).toHaveValue('90');
    fireEvent.click(screen.getByText('gui'));
    await waitFor(() => expect(got).toBe(90));
  });

  it('quay lại "Vô hạn" -> gửi null', async () => {
    let got: unknown = 'chua';
    render(<Harness onSubmit={(v) => { got = v.passwordExpiryDays; }} />);
    fireEvent.click(screen.getByLabelText('Có hạn'));
    fireEvent.click(screen.getByLabelText('Vô hạn'));
    fireEvent.click(screen.getByText('gui'));
    await waitFor(() => expect(got).toBeNull());
  });
});
