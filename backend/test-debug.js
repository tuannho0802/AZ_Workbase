async function testBackend() {
  try {
    console.log('1. Đăng nhập Admin...');
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@azworkbase.com', password: 'Admin@123' })
    });
    const loginData = await loginRes.json();
    
    if (!loginData.access_token) {
      console.log('Login Failed:', loginData);
      return;
    }
    
    console.log('Login Response User Role:', loginData.user.role);

    console.log('2. Lấy danh sách Customers...');
    const customersRes = await fetch('http://localhost:3001/api/customers', {
      headers: { Authorization: `Bearer ${loginData.access_token}` }
    });
    const customersData = await customersRes.json();

    console.log('Total Customers Returned:', customersData.total);
    console.log('Data length:', customersData.data ? customersData.data.length : 'NO DATA');
  } catch (error) {
    console.error('LỖI TEST API:', error);
  }
}
testBackend();
