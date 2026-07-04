import type { User, Lead, Order, Product, Transaction, DashboardStats, Invoice } from '@/types';

// All users with different roles
export const users: User[] = [
    {
        id: 'u1',
        name: 'Nguyễn Thị Hương',
        email: 'huong.nguyen@company.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=huong',
        role: 'manager',
        phone: '0912345678'
    },
    {
        id: 'u2',
        name: 'Trần Văn Minh',
        email: 'minh.tran@company.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=minh',
        role: 'sale',
        phone: '0923456789'
    },
    {
        id: 'u3',
        name: 'Lê Thị Mai',
        email: 'mai.le@company.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mai',
        role: 'technician',
        phone: '0934567890'
    },
    {
        id: 'u4',
        name: 'Phạm Văn Đức',
        email: 'duc.pham@company.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=duc',
        role: 'accountant',
        phone: '0945678901'
    },
    {
        id: 'u5',
        name: 'Hoàng Thị Lan',
        email: 'lan.hoang@company.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lan',
        role: 'sale',
        phone: '0956789012'
    },
    {
        id: 'u6',
        name: 'Nguyễn Thị Phương',
        email: 'phuong@company.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=phuong',
        role: 'sale',
        phone: '0967890123'
    },
    {
        id: 'u7',
        name: 'Trần Văn Tuấn',
        email: 'tuan@company.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=tuan',
        role: 'technician',
        phone: '0978901234'
    },
    {
        id: 'u8',
        name: 'Lê Thị Trang',
        email: 'trang@company.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=trang',
        role: 'sale',
        phone: '0989012345'
    },
    {
        id: 'u9',
        name: 'Phạm Văn Dũng',
        email: 'dung@company.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=dung',
        role: 'manager',
        phone: '0990123456'
    },
    {
        id: 'u10',
        name: 'Hoàng Thị My',
        email: 'my@company.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=my',
        role: 'sale',
        phone: '0901234568'
    }
];

export let currentUser: User = users[0];

export const setCurrentUser = (user: User) => {
    currentUser = user;
};

export const leads: Lead[] = [
    {
        id: 'l1',
        customerName: 'Nguyễn Thị Hà',
        phone: '0901234567',
        source: 'Facebook',
        status: 'new',
        assignedTo: users[1],
        createdAt: '2026-01-26T10:30:00',
        notes: 'Quan tâm gói dịch vụ Premium',
        history: [
            {
                id: 'lh1',
                type: 'created',
                content: 'Lead được tạo từ Facebook Ads - Campaign "Tháng 1"',
                createdAt: '2026-01-26T10:30:00',
                createdBy: users[1]
            }
        ]
    },
    {
        id: 'l2',
        customerName: 'Trần Thị Bình',
        phone: '0912345678',
        source: 'Zalo',
        status: 'nurturing',
        assignedTo: users[4],
        createdAt: '2026-01-25T14:20:00',
        notes: 'Đã tư vấn qua Zalo, hẹn gặp cuối tuần',
        history: [
            {
                id: 'lh2',
                type: 'created',
                content: 'Lead được tạo từ Zalo OA',
                createdAt: '2026-01-25T14:20:00',
                createdBy: users[4]
            },
            {
                id: 'lh3',
                type: 'call',
                content: 'Gọi điện tư vấn gói Premium, khách quan tâm báo giá',
                createdAt: '2026-01-25T16:00:00',
                createdBy: users[4]
            },
            {
                id: 'lh4',
                type: 'note',
                content: 'Khách hẹn tới công ty cuối tuần để xem demo',
                createdAt: '2026-01-26T09:00:00',
                createdBy: users[4]
            }
        ]
    },
    {
        id: 'l3',
        customerName: 'Lê Văn Cường',
        phone: '0923456789',
        source: 'Google',
        status: 'closed',
        assignedTo: users[1],
        createdAt: '2026-01-20T09:15:00',
        notes: 'Đã chốt đơn gói VIP Enterprise',
        history: [
            {
                id: 'lh5',
                type: 'created',
                content: 'Lead từ Google Ads - Tìm kiếm giải pháp CRM',
                createdAt: '2026-01-20T09:15:00',
                createdBy: users[1]
            },
            {
                id: 'lh5b',
                type: 'assigned',
                content: 'Chuyển lead cho Trần Văn Minh (Sale Senior)',
                createdAt: '2026-01-20T09:30:00',
                createdBy: users[0]
            },
            {
                id: 'lh6',
                type: 'call',
                content: 'Tư vấn qua điện thoại về giá và các gói dịch vụ',
                createdAt: '2026-01-20T11:00:00',
                createdBy: users[1]
            },
            {
                id: 'lh6b',
                type: 'note',
                content: 'Khách là CTY TNHH ABC, cần giải pháp cho 50 users',
                createdAt: '2026-01-21T08:00:00',
                createdBy: users[1]
            },
            {
                id: 'lh7',
                type: 'closed',
                content: 'Chốt đơn gói VIP Enterprise 12 tháng - 150,000,000đ',
                createdAt: '2026-01-22T15:30:00',
                createdBy: users[1]
            }
        ]
    },
    {
        id: 'l4',
        customerName: 'Phạm Thị Dung',
        phone: '0934567890',
        source: 'Referral',
        status: 'nurturing',
        assignedTo: users[5],
        createdAt: '2026-01-24T16:45:00',
        notes: 'Được giới thiệu bởi khách VIP',
        history: [
            {
                id: 'lh8',
                type: 'created',
                content: 'Lead được giới thiệu bởi anh Cường (CTY ABC)',
                createdAt: '2026-01-24T16:45:00',
                createdBy: users[5]
            },
            {
                id: 'lh9',
                type: 'note',
                content: 'Khách quan tâm dịch vụ tư vấn triển khai',
                createdAt: '2026-01-25T10:00:00',
                createdBy: users[5]
            }
        ]
    },
    {
        id: 'l5',
        customerName: 'Hoàng Văn Em',
        phone: '0945678901',
        source: 'Walk-in',
        status: 'cancelled',
        assignedTo: users[1],
        createdAt: '2026-01-23T11:00:00',
        notes: 'Khách không phù hợp ngân sách',
        history: [
            {
                id: 'lh10',
                type: 'created',
                content: 'Khách walk-in hỏi thăm dịch vụ',
                createdAt: '2026-01-23T11:00:00',
                createdBy: users[1]
            },
            {
                id: 'lh10b',
                type: 'call',
                content: 'Follow-up sau buổi gặp, khách cân nhắc budget',
                createdAt: '2026-01-23T16:00:00',
                createdBy: users[1]
            },
            {
                id: 'lh11',
                type: 'cancelled',
                content: 'Khách feedback giá cao hơn ngân sách, tạm dừng theo dõi',
                createdAt: '2026-01-24T09:00:00',
                createdBy: users[1]
            }
        ]
    },
    {
        id: 'l6',
        customerName: 'Công ty TNHH XYZ',
        phone: '0956789012',
        source: 'Website',
        status: 'new',
        assignedTo: users[7],
        createdAt: '2026-01-26T08:00:00',
        notes: 'Điền form trên website, cần liên hệ lại',
        history: [
            {
                id: 'lh12',
                type: 'created',
                content: 'Lead từ form liên hệ website - Yêu cầu demo sản phẩm',
                createdAt: '2026-01-26T08:00:00',
                createdBy: users[7]
            }
        ]
    }
];

export const orders: Order[] = [
    {
        id: 'o1',
        orderCode: 'DH-2026-0126-001',
        customerId: 'c1',
        customerName: 'Nguyễn Thị Hà',
        customerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ha',
        totalAmount: 25000000,
        status: 'before_sale',
        assignedTo: users[2],
        services: ['Gói Standard 6 tháng'],
        products: ['Training onsite'],
        createdAt: '2026-01-26T09:00:00',
        slaDeadline: '2026-01-26T17:00:00'
    },
    {
        id: 'o2',
        orderCode: 'DH-2026-0126-002',
        customerId: 'c2',
        customerName: 'Trần Thị Bình',
        customerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=binh',
        totalAmount: 58000000,
        status: 'in_progress',
        assignedTo: users[6],
        services: ['Triển khai hệ thống', 'Customize module'],
        products: [],
        createdAt: '2026-01-25T14:00:00',
        slaDeadline: '2026-01-27T14:00:00'
    },
    {
        id: 'o3',
        orderCode: 'DH-2026-0125-001',
        customerId: 'c3',
        customerName: 'CTY TNHH ABC',
        customerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=abc',
        totalAmount: 150000000,
        status: 'in_progress',
        assignedTo: users[6],
        services: ['Gói Enterprise 12 tháng'],
        products: ['50 user licenses', 'Support 24/7'],
        createdAt: '2026-01-22T15:30:00',
        slaDeadline: '2026-01-28T15:30:00',
        notes: 'Khách VIP - Ưu tiên cao'
    },
    {
        id: 'o4',
        orderCode: 'DH-2026-0124-001',
        customerId: 'c4',
        customerName: 'Phạm Thị Dung',
        customerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=dung2',
        totalAmount: 12000000,
        status: 'done',
        assignedTo: users[2],
        services: ['Tư vấn triển khai'],
        products: [],
        createdAt: '2026-01-24T10:00:00',
        slaDeadline: '2026-01-24T12:00:00'
    },
    {
        id: 'o5',
        orderCode: 'DH-2026-0123-001',
        customerId: 'c5',
        customerName: 'Hoàng Văn Em',
        customerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=em',
        totalAmount: 8000000,
        status: 'cancelled',
        assignedTo: users[2],
        services: ['Gói Basic'],
        products: [],
        createdAt: '2026-01-23T11:30:00',
        slaDeadline: '2026-01-23T13:30:00',
        notes: 'Khách hủy đơn do thay đổi kế hoạch'
    },
    {
        id: 'o6',
        orderCode: 'DH-2026-0126-003',
        customerId: 'c6',
        customerName: 'Đặng Thị Phương',
        customerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=phuong2',
        totalAmount: 35000000,
        status: 'before_sale',
        assignedTo: users[6],
        services: ['Migration data'],
        products: ['Import/Export module'],
        createdAt: '2026-01-26T11:00:00',
        slaDeadline: '2026-01-27T11:00:00'
    },
    {
        id: 'o7',
        orderCode: 'DH-2026-0125-002',
        customerId: 'c7',
        customerName: 'Vũ Thị Quyên',
        customerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=quyen',
        totalAmount: 42000000,
        status: 'in_progress',
        assignedTo: users[6],
        services: ['API Integration'],
        products: [],
        createdAt: '2026-01-25T09:00:00',
        slaDeadline: '2026-01-26T18:00:00'
    },
    {
        id: 'o8',
        orderCode: 'DH-2026-0126-004',
        customerId: 'c8',
        customerName: 'CTY XYZ Corp',
        customerAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=xyz',
        totalAmount: 85000000,
        status: 'before_sale',
        assignedTo: users[2],
        services: ['Gói Premium'],
        products: ['20 user licenses'],
        createdAt: '2026-01-26T14:00:00',
        slaDeadline: '2026-01-28T14:00:00'
    }
];

export const products: Product[] = [
    // Sản phẩm
    { id: 'p1', name: 'License User Standard', code: 'SP001', price: 500000, category: 'product', unit: 'user/tháng', stock: 999 },
    { id: 'p2', name: 'License User Premium', code: 'SP002', price: 1000000, category: 'product', unit: 'user/tháng', stock: 999 },
    { id: 'p3', name: 'License User Enterprise', code: 'SP003', price: 2000000, category: 'product', unit: 'user/tháng', stock: 999 },
    { id: 'p4', name: 'Module Import/Export', code: 'SP004', price: 5000000, category: 'product', unit: 'module', stock: 999 },
    { id: 'p5', name: 'Module API Integration', code: 'SP005', price: 15000000, category: 'product', unit: 'module', stock: 999 },
    { id: 'p6', name: 'Support 24/7 Add-on', code: 'SP006', price: 10000000, category: 'product', unit: 'tháng', stock: 999 },

    // Dịch vụ
    { id: 's1', name: 'Tư vấn triển khai', code: 'DV001', price: 5000000, category: 'service', unit: 'buổi' },
    { id: 's2', name: 'Training onsite', code: 'DV002', price: 8000000, category: 'service', unit: 'ngày' },
    { id: 's3', name: 'Training online', code: 'DV003', price: 3000000, category: 'service', unit: 'buổi' },
    { id: 's4', name: 'Customize module', code: 'DV004', price: 20000000, category: 'service', unit: 'module' },
    { id: 's5', name: 'Migration data', code: 'DV005', price: 15000000, category: 'service', unit: 'lần' },
    { id: 's6', name: 'API Integration', code: 'DV006', price: 25000000, category: 'service', unit: 'integration' },
    { id: 's7', name: 'Maintenance hàng tháng', code: 'DV007', price: 5000000, category: 'service', unit: 'tháng' },

    // Gói dịch vụ
    { id: 'g1', name: 'Gói Basic (3 tháng)', code: 'GOI001', price: 15000000, category: 'package', unit: 'gói' },
    { id: 'g2', name: 'Gói Standard (6 tháng)', code: 'GOI002', price: 45000000, category: 'package', unit: 'gói' },
    { id: 'g3', name: 'Gói Premium (12 tháng)', code: 'GOI003', price: 80000000, category: 'package', unit: 'gói' },
    { id: 'g4', name: 'Gói Enterprise (12 tháng)', code: 'GOI004', price: 150000000, category: 'package', unit: 'gói' },

    // Thẻ/Voucher
    { id: 'v1', name: 'Voucher 5,000,000đ', code: 'VC001', price: 5000000, category: 'voucher', unit: 'thẻ' },
    { id: 'v2', name: 'Voucher 10,000,000đ', code: 'VC002', price: 10000000, category: 'voucher', unit: 'thẻ' },
    { id: 'v3', name: 'Thẻ Partner Gold', code: 'VC003', price: 50000000, category: 'voucher', unit: 'thẻ' }
];

export const transactions: Transaction[] = [
    {
        id: 't1',
        code: 'PT-2026-0126-001',
        date: '2026-01-26',
        type: 'income',
        category: 'Dịch vụ triển khai',
        amount: 58000000,
        paymentMethod: 'transfer',
        status: 'approved',
        notes: 'Thu tiền hóa đơn HD-001 - CTY XYZ',
        createdBy: users[3],
        approvedBy: users[0],
        createdAt: '2026-01-26T09:30:00'
    },
    {
        id: 't2',
        code: 'PT-2026-0126-002',
        date: '2026-01-26',
        type: 'income',
        category: 'Bán license',
        amount: 25000000,
        paymentMethod: 'cash',
        status: 'approved',
        notes: 'Thu tiền gói Standard 6 tháng',
        createdBy: users[3],
        approvedBy: users[0],
        createdAt: '2026-01-26T11:00:00'
    },
    {
        id: 't3',
        code: 'PC-2026-0126-001',
        date: '2026-01-26',
        type: 'expense',
        category: 'Chi phí server',
        amount: 15000000,
        paymentMethod: 'transfer',
        status: 'pending',
        notes: 'Thanh toán AWS Cloud tháng 01/2026',
        createdBy: users[3],
        createdAt: '2026-01-26T14:00:00'
    },
    {
        id: 't4',
        code: 'PC-2026-0125-001',
        date: '2026-01-25',
        type: 'expense',
        category: 'Lương nhân viên',
        amount: 180000000,
        paymentMethod: 'transfer',
        status: 'approved',
        notes: 'Chi lương tháng 01/2026 - 10 nhân viên',
        createdBy: users[3],
        approvedBy: users[0],
        createdAt: '2026-01-25T16:00:00'
    },
    {
        id: 't5',
        code: 'PT-2026-0125-001',
        date: '2026-01-25',
        type: 'income',
        category: 'Gói dịch vụ',
        amount: 150000000,
        paymentMethod: 'transfer',
        status: 'approved',
        notes: 'Thu tiền gói Enterprise 12 tháng - CTY ABC',
        createdBy: users[3],
        approvedBy: users[0],
        createdAt: '2026-01-25T10:00:00'
    },
    {
        id: 't6',
        code: 'PC-2026-0124-001',
        date: '2026-01-24',
        type: 'expense',
        category: 'Tiền thuê văn phòng',
        amount: 35000000,
        paymentMethod: 'transfer',
        status: 'approved',
        notes: 'Thanh toán tiền thuê VP tháng 02',
        createdBy: users[3],
        approvedBy: users[0],
        createdAt: '2026-01-24T09:00:00'
    },
    {
        id: 't7',
        code: 'PT-2026-0124-001',
        date: '2026-01-24',
        type: 'income',
        category: 'Training',
        amount: 24000000,
        paymentMethod: 'transfer',
        status: 'approved',
        notes: 'Thu tiền training 3 ngày onsite',
        createdBy: users[3],
        approvedBy: users[0],
        createdAt: '2026-01-24T15:00:00'
    }
];

export const invoices: Invoice[] = [
    {
        id: 'inv1',
        invoiceCode: 'HD-2026-0126-001',
        customerId: 'c2',
        customerName: 'Trần Thị Bình',
        invoiceDate: '2026-01-26',
        type: 'service',
        items: [
            { id: 'ii1', productId: 's4', productName: 'Customize module', quantity: 1, unitPrice: 20000000, total: 20000000 },
            { id: 'ii2', productId: 's5', productName: 'Migration data', quantity: 1, unitPrice: 15000000, total: 15000000 },
            { id: 'ii3', productId: 's2', productName: 'Training onsite', quantity: 3, unitPrice: 8000000, total: 24000000 }
        ],
        commissions: [
            { id: 'ce1', employeeId: 'u2', employeeName: 'Trần Văn Minh', role: 'Sale', percentage: 5, amount: 2900000 },
            { id: 'ce2', employeeId: 'u7', employeeName: 'Trần Văn Tuấn', role: 'Technician', percentage: 3, amount: 1740000 }
        ],
        subtotal: 59000000,
        discount: 1000000,
        discountType: 'amount',
        total: 58000000,
        paymentMethod: 'transfer',
        status: 'completed',
        notes: 'Khách mới - Giảm giá chào mừng',
        createdAt: '2026-01-26T10:00:00',
        createdBy: users[1]
    },
    {
        id: 'inv2',
        invoiceCode: 'HD-2026-0125-001',
        customerId: 'c3',
        customerName: 'CTY TNHH ABC',
        invoiceDate: '2026-01-25',
        type: 'package',
        items: [
            { id: 'ii4', productId: 'g4', productName: 'Gói Enterprise (12 tháng)', quantity: 1, unitPrice: 150000000, total: 150000000 }
        ],
        commissions: [
            { id: 'ce3', employeeId: 'u2', employeeName: 'Trần Văn Minh', role: 'Sale', percentage: 4, amount: 6000000 },
            { id: 'ce4', employeeId: 'u5', employeeName: 'Hoàng Thị Lan', role: 'Consultant', percentage: 2, amount: 3000000 }
        ],
        subtotal: 150000000,
        discount: 0,
        discountType: 'amount',
        total: 150000000,
        paymentMethod: 'transfer',
        status: 'completed',
        notes: 'Deal lớn từ Google Ads',
        createdAt: '2026-01-25T15:30:00',
        createdBy: users[1]
    }
];

export const dashboardStats: DashboardStats = {
    openingBalance: 500000000,
    totalIncome: 356000000,
    totalExpense: 230000000,
    closingBalance: 626000000,
    netRevenue: 126000000,
    incomeGrowth: 18.5,
    expenseGrowth: -8.2,
    revenueGrowth: 25.3
};

export const incomeCategories = [
    'Dịch vụ triển khai',
    'Bán license',
    'Gói dịch vụ',
    'Training',
    'Tư vấn',
    'Maintenance',
    'Khác'
];

export const expenseCategories = [
    'Lương nhân viên',
    'Chi phí server',
    'Tiền thuê văn phòng',
    'Tiền điện',
    'Marketing',
    'Thiết bị văn phòng',
    'Công tác phí',
    'Khác'
];

// Customer data for search
export const customers = [
    { id: 'c1', name: 'Nguyễn Thị Hà', phone: '0901234567', company: '' },
    { id: 'c2', name: 'Trần Thị Bình', phone: '0912345678', company: '' },
    { id: 'c3', name: 'Lê Văn Cường', phone: '0923456789', company: 'CTY TNHH ABC' },
    { id: 'c4', name: 'Phạm Thị Dung', phone: '0934567890', company: '' },
    { id: 'c5', name: 'Hoàng Văn Em', phone: '0945678901', company: '' },
    { id: 'c6', name: 'Đặng Thị Phương', phone: '0956789012', company: '' },
    { id: 'c7', name: 'Vũ Thị Quyên', phone: '0967890123', company: '' },
    { id: 'c8', name: 'Nguyễn Văn Hùng', phone: '0978901234', company: 'CTY XYZ Corp' },
];

// Role labels for display
export const roleLabels: Record<string, string> = {
    admin: 'Quản trị viên',
    manager: 'Quản lý',
    accountant: 'Kế toán',
    sale: 'Sale',
    technician: 'Kỹ thuật'
};
