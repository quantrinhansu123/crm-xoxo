# CRM Backend API

Backend API cho hệ thống CRM sử dụng Node.js, TypeScript, Express và Supabase.

## Yêu cầu

- Node.js >= 18
- npm hoặc yarn
- Tài khoản Supabase

## Cài đặt

### 1. Cài đặt dependencies

```bash
cd server
npm install
```

### 2. Cấu hình môi trường

Copy file `.env.example` thành `.env` và điền thông tin:

```env
PORT=3001
NODE_ENV=development

# Supabase - Lấy từ Settings > API trong Supabase Dashboard
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# JWT
JWT_SECRET=your_super_secret_key_change_in_production
JWT_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=http://localhost:5173
```

### 3. Tạo Database

1. Đăng nhập vào [Supabase Dashboard](https://supabase.com/dashboard)
2. Tạo project mới hoặc sử dụng project hiện có
3. Vào **SQL Editor**
4. Copy nội dung file `database/schema.sql` và chạy

### 4. Chạy server

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

Server sẽ chạy tại `http://localhost:3001`

## API Endpoints

### Authentication
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/auth/login` | Đăng nhập |
| POST | `/api/auth/register` | Tạo tài khoản (Manager only) |
| GET | `/api/auth/me` | Lấy thông tin user hiện tại |
| POST | `/api/auth/change-password` | Đổi mật khẩu |
| POST | `/api/auth/logout` | Đăng xuất |

### Users
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/users` | Danh sách users |
| GET | `/api/users/:id` | Chi tiết user |
| PUT | `/api/users/:id` | Cập nhật user |
| DELETE | `/api/users/:id` | Vô hiệu hóa user |

### Leads
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/leads` | Danh sách leads |
| GET | `/api/leads/:id` | Chi tiết lead |
| POST | `/api/leads` | Tạo lead mới |
| PUT | `/api/leads/:id` | Cập nhật lead |
| DELETE | `/api/leads/:id` | Xóa lead |
| POST | `/api/leads/:id/convert` | Chuyển lead thành customer |

### Customers
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/customers` | Danh sách khách hàng |
| GET | `/api/customers/:id` | Chi tiết khách hàng |
| POST | `/api/customers` | Tạo khách hàng mới |
| PUT | `/api/customers/:id` | Cập nhật khách hàng |
| DELETE | `/api/customers/:id` | Vô hiệu hóa khách hàng |

### Orders
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/orders` | Danh sách đơn hàng |
| GET | `/api/orders/:id` | Chi tiết đơn hàng |
| POST | `/api/orders` | Tạo đơn hàng mới |
| PATCH | `/api/orders/:id/status` | Cập nhật trạng thái |
| DELETE | `/api/orders/:id` | Xóa đơn hàng |

### Invoices
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/invoices` | Danh sách hóa đơn |
| GET | `/api/invoices/:id` | Chi tiết hóa đơn |
| POST | `/api/invoices` | Tạo hóa đơn từ đơn hàng |
| PATCH | `/api/invoices/:id/status` | Cập nhật trạng thái |

### Products
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/products` | Danh sách sản phẩm |
| GET | `/api/products/:id` | Chi tiết sản phẩm |
| POST | `/api/products` | Tạo sản phẩm mới |
| PUT | `/api/products/:id` | Cập nhật sản phẩm |
| DELETE | `/api/products/:id` | Vô hiệu hóa sản phẩm |

### Services
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/services` | Danh sách dịch vụ |
| GET | `/api/services/:id` | Chi tiết dịch vụ |
| POST | `/api/services` | Tạo dịch vụ mới |
| PUT | `/api/services/:id` | Cập nhật dịch vụ |
| DELETE | `/api/services/:id` | Vô hiệu hóa dịch vụ |
| GET | `/api/services/packages/list` | Danh sách gói dịch vụ |
| GET | `/api/services/vouchers/list` | Danh sách voucher |

### Finance
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/finance/transactions` | Danh sách giao dịch |
| POST | `/api/finance/income` | Tạo phiếu thu |
| POST | `/api/finance/expense` | Tạo phiếu chi |
| PATCH | `/api/finance/transactions/:id/approve` | Duyệt giao dịch |
| PATCH | `/api/finance/transactions/:id/reject` | Từ chối giao dịch |
| GET | `/api/finance/summary` | Tổng hợp thu chi |

### KPI
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/kpi/overview` | Tổng quan KPI |
| GET | `/api/kpi/user/:userId` | KPI theo user |
| POST | `/api/kpi/target` | Đặt mục tiêu KPI |
| PATCH | `/api/kpi/update/:userId` | Cập nhật KPI thực tế |
| GET | `/api/kpi/leaderboard` | Bảng xếp hạng |

### Salary
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/salary` | Danh sách bảng lương |
| GET | `/api/salary/user/:userId` | Lương theo user |
| POST | `/api/salary/calculate` | Tính lương |
| PATCH | `/api/salary/:id/approve` | Duyệt lương |
| PATCH | `/api/salary/:id/pay` | Thanh toán lương |

### Reports
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/reports/revenue` | Báo cáo doanh thu |
| GET | `/api/reports/sales` | Báo cáo bán hàng |
| GET | `/api/reports/customers` | Báo cáo khách hàng |
| GET | `/api/reports/financial` | Báo cáo tài chính |

### Interactions
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/interactions` | Danh sách tương tác |
| GET | `/api/interactions/:id` | Chi tiết tương tác |
| POST | `/api/interactions` | Tạo tương tác mới |
| PUT | `/api/interactions/:id` | Cập nhật tương tác |
| DELETE | `/api/interactions/:id` | Xóa tương tác |
| GET | `/api/interactions/followups/pending` | Danh sách cần follow-up |

## Demo Users

| Email | Password | Role | Quyền |
|-------|----------|------|-------|
| manager@demo.com | 123456 | Manager | Toàn quyền |
| accountant@demo.com | 123456 | Accountant | Thu chi, hóa đơn, lương |
| sale@demo.com | 123456 | Sale | Leads, Khách hàng, Đơn hàng |
| tech@demo.com | 123456 | Tech | Công việc kỹ thuật |

## Cấu trúc thư mục

```
server/
├── src/
│   ├── config/
│   │   ├── index.ts          # Cấu hình chung
│   │   └── supabase.ts       # Supabase client
│   ├── middleware/
│   │   ├── auth.ts           # Authentication & Authorization
│   │   └── errorHandler.ts   # Error handling
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   ├── leads.ts
│   │   ├── customers.ts
│   │   ├── orders.ts
│   │   ├── invoices.ts
│   │   ├── products.ts
│   │   ├── services.ts
│   │   ├── finance.ts
│   │   ├── kpi.ts
│   │   ├── salary.ts
│   │   ├── reports.ts
│   │   └── interactions.ts
│   └── index.ts              # Entry point
├── database/
│   └── schema.sql            # Database schema
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT
