# 🏢 AZWorkbase - All-in-One Management System

## 📋 Project Overview

**Purpose:** Enterprise management system for employee, project, and customer data management  
**Priority Module:** Marketing Data (Top Tier)  
**Timeline:** 4 weeks (MVP)  
**Tech Stack:** Next.js + Nest.js + MySQL + FastPanel

---

## 🎯 Core Objectives

### Phase 1 (Month 1) - MVP
1. ✅ **Marketing Data Module** (Top Tier) - MUST COMPLETE
2. ✅ **Authentication & RBAC** (4 Roles)
3. ✅ **Data Sharing System** (Between Sales)

### Phase 2 (Month 2+) - Deferred
- Leave Request Management (A Tier)
- Project Management (B Tier)
- Task Management (C Tier)

---

## 👥 User Roles & Permissions

| Role | Access Level | Marketing Data | Data Sharing |
|------|-------------|----------------|--------------|
| **Administrator** | Full Access | View All + Edit All | Manage All |
| **Manager** | Department Level | View All + Edit All | View All Shares |
| **Assistant** | Department Level | View All + Edit Own | View Assigned |
| **Employee** | Personal Level | View Own + Shared | Receive Only |

---

## 🏗️ System Architecture

### Infrastructure
```
Domain: azworkbase.com
├── Frontend (Next.js)      → Port 3000 → /
├── Backend (Nest.js)       → Port 3001 → /api/*
└── Database (MySQL)        → Port 3306 (Internal)

Reverse Proxy: Nginx (FastPanel)
Process Manager: PM2
SSL: Let's Encrypt (via FastPanel)
```

### Tech Stack Details

**Frontend:**
- Next.js 14+ (App Router)
- TypeScript
- Ant Design 5.x (UI Components)
- Axios (API Client)
- React Query (Data Fetching)
- Zustand (State Management)

**Backend:**
- Nest.js 10+
- TypeScript
- TypeORM (Database ORM)
- Passport JWT (Authentication)
- class-validator (DTO Validation)
- Swagger (API Documentation)

**Database:**
- MySQL 8.0+
- InnoDB Engine
- UTF8MB4 Charset

---

## 📅 4-Week Development Roadmap

### 🔧 Week 0: Technical Foundation (3 days)

**Objective:** Validate infrastructure feasibility

**Day 1: VPS Setup**
- [ ] Provision FastPanel VPS (Min: 4GB RAM, 2 CPU cores)
- [ ] Install Node.js LTS (v20.x)
- [ ] Install PM2 globally: `npm install -g pm2`
- [ ] Install MySQL client: `apt-get install mysql-client`

**Day 2: POC Deployment**
- [ ] Deploy Next.js Hello World on port 3000
- [ ] Deploy Nest.js Hello World on port 3001
- [ ] Test both services with `curl localhost:3000` and `curl localhost:3001`
- [ ] Create MySQL database: `azworkbase_db`
- [ ] Test database connection from Node.js

**Day 3: Nginx Configuration**
- [ ] Configure reverse proxy (see Nginx section below)
- [ ] Test routing: `curl https://azworkbase.com/` → Next.js
- [ ] Test routing: `curl https://azworkbase.com/api/health` → Nest.js
- [ ] Setup SSL certificate via FastPanel
- [ ] **Decision Gate:** If any issues, escalate immediately

---

### 🗄️ Week 1: Database & Authentication (5 days)

**Objective:** Foundation for all features

**Day 1-2: Database Design**

Create database schema (see Database Schema section):
- [ ] Design ERD (Entity Relationship Diagram)
- [ ] Create migration files using TypeORM
- [ ] Define indexes for performance
- [ ] Setup foreign keys with cascading rules
- [ ] Seed initial data (departments, admin user)

**Day 3-4: Authentication System**
- [ ] Nest.js: Create `auth` module
- [ ] Implement JWT strategy (access token 1h, refresh token 7d)
- [ ] Create role guards: `@Roles('admin', 'manager')`
- [ ] Create endpoints:
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `POST /api/auth/refresh`
  - `GET /api/auth/me`
- [ ] Write unit tests for auth service

**Day 5: Frontend Setup & Wireframe**
- [ ] Initialize Next.js project with TypeScript
- [ ] Install and configure Ant Design
- [ ] Setup Axios instance with JWT interceptor
- [ ] Create wireframe for main table (14 columns)
- [ ] Sketch customer detail modal layout
- [ ] **Review wireframe with stakeholders**

---

### ⚙️ Week 2: Backend API - Marketing Module (5 days)

**Objective:** Complete REST API for customer management

**Day 1: Customer CRUD - Part 1**
- [ ] Create `customers` module
- [ ] Define Customer DTO with validation:
  ```typescript
  class CreateCustomerDto {
    @IsString() name: string;
    @IsPhoneNumber('VN') phone: string;
    @IsEmail() email: string;
    // ... 11 more fields
  }
  ```
- [ ] Implement `POST /api/customers` (Create)
- [ ] Implement `GET /api/customers/:id` (Read)
- [ ] Write unit tests

**Day 2: Customer CRUD - Part 2**
- [ ] Implement `PUT /api/customers/:id` (Update)
- [ ] Implement `DELETE /api/customers/:id` (Soft delete)
- [ ] Add audit fields (created_by, updated_by, deleted_at)
- [ ] Write unit tests

**Day 3: List & Filter API**
- [ ] Implement `GET /api/customers` with query params:
  - `?page=1&limit=20` (Pagination)
  - `?department=1` (Filter by department)
  - `?sales_id=5` (Filter by sales)
  - `?status=closed` (Filter by status)
  - `?search=John` (Search by name/phone/email)
- [ ] Optimize query with proper JOIN and indexes
- [ ] Return metadata: `{ data: [], total: 100, page: 1, limit: 20 }`

**Day 4: FTD (Deposits) Module**
- [ ] Create `deposits` module
- [ ] Implement `POST /api/customers/:id/deposits` (Add deposit)
- [ ] Implement `GET /api/customers/:id/deposits` (Deposit history)
- [ ] Write query to get latest deposit for table display:
  ```sql
  SELECT c.*, 
         (SELECT amount FROM deposits 
          WHERE customer_id = c.id 
          ORDER BY deposit_date DESC LIMIT 1) as latest_ftd
  FROM customers c;
  ```
- [ ] Test with 100+ deposits per customer

**Day 5: Swagger Documentation & Testing**
- [ ] Setup Swagger UI: `/api/docs`
- [ ] Document all endpoints with examples
- [ ] Seed 100 fake customers for testing
- [ ] Deploy backend to FastPanel
- [ ] Test all endpoints with Postman

---

### 🎨 Week 3: Frontend UI - Marketing Module (5 days)

**Objective:** Functional UI for customer management

**Day 1-2: Main Table Component**
- [ ] Create `CustomerTable.tsx` with Ant Design Table
- [ ] Implement 14 columns:
  - STT (Auto-increment)
  - Ngày Nhập Khách (Date)
  - Họ và Tên (String)
  - Số điện thoại (Phone with flag)
  - Email (String)
  - Nguồn (Dropdown: Facebook, TikTok, Google)
  - Chiến dịch (String)
  - Tên Sales (User dropdown)
  - Status (Badge: Closed, Pending, Potential)
  - FTD (Currency format)
  - Broker (String)
  - Ngày chốt (Date)
  - Department (String)
  - Note (Truncated with tooltip)
  - Action (Edit, View, Share buttons)
- [ ] Make header sticky: `scroll={{ x: 2000, y: 600 }}`
- [ ] Implement server-side pagination
- [ ] Add loading skeleton

**Day 3: Filters & Search**
- [ ] Create filter bar above table:
  - Department select (searchable)
  - Sales select (searchable)
  - Status select
  - Source select
  - Date range picker (Ngày nhập khách)
- [ ] Use Ant Design `Select` with `showSearch` prop
- [ ] Implement debounced search (300ms)
- [ ] Add "Clear Filters" button

**Day 4: Customer Detail Modal**
- [ ] Create `CustomerDetailModal.tsx`
- [ ] Implement 2 modes:
  - **View Mode:** Display all fields as text (disabled inputs)
  - **Edit Mode:** Editable form with validation
- [ ] Add mode toggle button: "Chỉnh sửa" / "Hủy"
- [ ] Create tabs inside modal:
  - Tab 1: Thông tin chung (General info)
  - Tab 2: Lịch sử FTD (Deposit history table)
  - Tab 3: Ghi chú (Notes with timestamp)
- [ ] Implement save/cancel logic

**Day 5: Integration & Bug Fixes**
- [ ] Connect frontend to backend API
- [ ] Test CRUD operations: Create → Read → Update → Delete
- [ ] Test filters with various combinations
- [ ] Handle error states (Network error, 401, 403, 500)
- [ ] Deploy frontend to FastPanel
- [ ] **E2E Test:** Admin login → View table → Edit customer → Save

---

### 🔐 Week 4: RBAC & Data Sharing (5 days)

**Objective:** Go-live with complete permission system

**Day 1-2: Data Sharing Logic**
- [ ] Create `data_sharing` table (see schema)
- [ ] Backend: Create `sharing` module
- [ ] Implement endpoints:
  - `POST /api/customers/:id/share` (Share customer)
    ```typescript
    {
      shared_with_user_id: 5,
      permission: 'view' | 'edit'
    }
    ```
  - `GET /api/customers/:id/shares` (List who has access)
  - `DELETE /api/customers/:id/share/:user_id` (Revoke access)
- [ ] Frontend: Add "Share" button in Action column
- [ ] Create Share modal with user select + permission radio
- [ ] Test: Sale 1 shares → Sale 2 can view → Sale 3 can edit

**Day 3: RBAC Implementation**
- [ ] Backend: Modify `GET /api/customers` query:
  ```typescript
  // Admin/Manager/Assistant: See all
  if (user.role === 'admin' || user.role === 'manager' || user.role === 'assistant') {
    return allCustomers;
  }
  
  // Employee: See own + shared
  return customersWhereCreatedBy(user.id)
    .orWhere(sharedWith(user.id));
  ```
- [ ] Frontend: Hide/show buttons based on role:
  - Admin: All buttons enabled
  - Manager: All buttons enabled
  - Assistant: All buttons enabled
  - Employee: Only edit own or shared-with-edit-permission
- [ ] Test all 4 roles

**Day 4: Testing & Bug Fixes**
- [ ] E2E Test Scenarios:
  1. Admin logs in → Sees all customers
  2. Employee logs in → Sees only own customers
  3. Sale 1 shares customer with Sale 2 (view-only)
  4. Sale 2 tries to edit → Should be blocked
  5. Sale 1 changes permission to 'edit'
  6. Sale 2 can now edit
- [ ] Performance test: Load 1000 customers
- [ ] Fix critical bugs (P0/P1 only)

**Day 5: Deployment & Go-Live**
- [ ] Final deployment checklist:
  - [ ] Backend deployed with PM2: `pm2 start ecosystem.config.js`
  - [ ] Frontend deployed with PM2
  - [ ] Nginx config verified
  - [ ] SSL certificate active
  - [ ] Database backup created
  - [ ] Environment variables set
- [ ] Create admin account for production
- [ ] User training session (30 mins):
  - How to add customer
  - How to update FTD
  - How to share data
- [ ] Monitor PM2 logs: `pm2 logs`
- [ ] **GO-LIVE** 🚀

---

## 🗄️ Database Schema

### Core Tables

```sql
-- Users & Authentication
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role ENUM('admin', 'manager', 'assistant', 'employee') NOT NULL,
  department_id INT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id),
  INDEX idx_email (email),
  INDEX idx_role (role)
);

-- Departments
CREATE TABLE departments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers (Marketing Data)
CREATE TABLE customers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  source ENUM('Facebook', 'TikTok', 'Google', 'Instagram', 'Other') NOT NULL,
  campaign VARCHAR(100),
  sales_user_id INT NOT NULL,
  status ENUM('closed', 'pending', 'potential', 'lost') DEFAULT 'pending',
  broker VARCHAR(100),
  closed_date DATE,
  department_id INT NOT NULL,
  note TEXT,
  created_by INT NOT NULL,
  updated_by INT,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (sales_user_id) REFERENCES users(id),
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (updated_by) REFERENCES users(id),
  INDEX idx_phone (phone),
  INDEX idx_email (email),
  INDEX idx_sales (sales_user_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_deleted_at (deleted_at) -- For soft delete queries
);

-- Deposits (FTD History)
CREATE TABLE deposits (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  deposit_date DATE NOT NULL,
  note TEXT,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_customer_date (customer_id, deposit_date DESC) -- For latest FTD query
);

-- Data Sharing
CREATE TABLE data_sharing (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL,
  owner_user_id INT NOT NULL,
  shared_with_user_id INT NOT NULL,
  permission ENUM('view', 'edit') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(id),
  FOREIGN KEY (shared_with_user_id) REFERENCES users(id),
  UNIQUE KEY uk_sharing (customer_id, shared_with_user_id),
  INDEX idx_shared_with (shared_with_user_id)
);

-- Notes (Per Customer)
CREATE TABLE customer_notes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customer_id INT NOT NULL,
  note TEXT NOT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_customer (customer_id)
);

-- Audit Logs (Optional but recommended)
CREATE TABLE audit_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete', 'share'
  entity_type VARCHAR(50) NOT NULL, -- 'customer', 'deposit', 'user'
  entity_id INT NOT NULL,
  old_data JSON,
  new_data JSON,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_created_at (created_at)
);
```

### Initial Seed Data

```sql
-- Insert departments
INSERT INTO departments (name, description) VALUES
('Sales', 'Sales team'),
('Marketing', 'Marketing team'),
('Operations', 'Operations team'),
('IT', 'IT support team');

-- Insert admin user (password: 'admin123' hashed with bcrypt)
INSERT INTO users (email, password, name, role, department_id) VALUES
('admin@azworkbase.com', '$2b$10$...', 'System Admin', 'admin', NULL);
```

---

## 🔧 Configuration Files

### 1. Nginx Configuration (FastPanel)

Edit site config in FastPanel:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name azworkbase.com www.azworkbase.com;
    
    # SSL Config (Let's Encrypt via FastPanel)
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    
    # API Routes → Nest.js (Port 3001)
    location /api/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # All other routes → Next.js (Port 3000)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Static files caching (for Next.js _next folder)
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 2. PM2 Ecosystem (Backend)

`backend/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'azworkbase-api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '500M',
    },
  ],
};
```

### 3. PM2 Ecosystem (Frontend)

`frontend/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'azworkbase-web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '800M',
    },
  ],
};
```

### 4. Backend Environment Variables

`backend/.env.production`:

```bash
# Application
NODE_ENV=production
PORT=3001
API_PREFIX=api

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=azworkbase_user
DB_PASSWORD=<SECURE_PASSWORD>
DB_DATABASE=azworkbase_db

# JWT
JWT_SECRET=<GENERATE_RANDOM_SECRET>
JWT_EXPIRES_IN=1h
JWT_REFRESH_SECRET=<GENERATE_RANDOM_SECRET>
JWT_REFRESH_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=https://azworkbase.com

# Logging
LOG_LEVEL=info
```

### 5. Frontend Environment Variables

`frontend/.env.production`:

```bash
NEXT_PUBLIC_API_URL=https://azworkbase.com/api
NEXT_PUBLIC_APP_NAME=AZWorkbase
```

---

## 📦 Deployment Commands

### Initial Deployment

```bash
# Backend
cd backend
npm install --production
npm run build
pm2 start ecosystem.config.js
pm2 save

# Frontend
cd frontend
npm install --production
npm run build
pm2 start ecosystem.config.js
pm2 save

# Setup PM2 startup
pm2 startup
# Follow the command it outputs
```

### Update Deployment

```bash
# Backend
cd backend
git pull
npm install --production
npm run build
pm2 restart azworkbase-api

# Frontend
cd frontend
git pull
npm install --production
npm run build
pm2 restart azworkbase-web
```

### Monitoring

```bash
# View logs
pm2 logs azworkbase-api
pm2 logs azworkbase-web

# Check status
pm2 status

# Monitor resources
pm2 monit
```

---

## 🧪 Testing Strategy

### Unit Tests (70% Coverage Target)

**Backend (Jest):**
```bash
cd backend
npm run test
npm run test:cov
```

**Frontend (Jest + React Testing Library):**
```bash
cd frontend
npm run test
npm run test:cov
```

### Integration Tests

**API Endpoints (Supertest):**
```bash
cd backend
npm run test:e2e
```

### Load Testing (K6)

Test with 50 concurrent users:

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: 50,
  duration: '30s',
};

export default function () {
  let res = http.get('https://azworkbase.com/api/customers');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);
}
```

Run: `k6 run load-test.js`

---

## 🐛 Common Issues & Solutions

### Issue 1: CORS Error
**Symptom:** Frontend can't call API  
**Solution:** Check Nginx config has proper headers, verify CORS_ORIGIN in backend .env

### Issue 2: PM2 App Not Starting
**Symptom:** `pm2 status` shows "errored"  
**Solution:** Check logs with `pm2 logs`, verify .env file exists, check database connection

### Issue 3: Database Connection Failed
**Symptom:** Backend crashes with "ER_ACCESS_DENIED_ERROR"  
**Solution:** Verify DB credentials, check MySQL user has proper permissions:
```sql
GRANT ALL PRIVILEGES ON azworkbase_db.* TO 'azworkbase_user'@'localhost';
FLUSH PRIVILEGES;
```

### Issue 4: Next.js Build Failed
**Symptom:** `npm run build` fails  
**Solution:** Clear cache: `rm -rf .next node_modules && npm install`

---

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Nest.js Documentation](https://docs.nestjs.com)
- [Ant Design Components](https://ant.design/components/overview)
- [TypeORM Guide](https://typeorm.io)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)

---

## 🚀 Post-Launch Checklist

- [ ] Setup daily database backup (cronjob)
- [ ] Configure monitoring (Uptime Robot / Pingdom)
- [ ] Setup error tracking (Sentry)
- [ ] Create user documentation
- [ ] Plan Phase 2 features (Leave requests)
- [ ] Collect user feedback
- [ ] Performance optimization based on real usage

---

## 📞 Support

For issues or questions, contact:
- **Technical Lead:** [Your Name]
- **Email:** dev@azworkbase.com
- **Project Repository:** [GitHub Link]

---

**Last Updated:** 2024-01-XX  
**Version:** 1.0.0 (MVP)