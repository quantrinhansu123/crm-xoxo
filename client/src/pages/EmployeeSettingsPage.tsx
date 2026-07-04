import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Rocket,
  Clock,
  DollarSign,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Info,
  Pencil,
  Plus,
  Shield,
} from 'lucide-react';
import { ViewPermissionsPanel } from '@/components/employee-settings/ViewPermissionsTab';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

type SettingsTab = 'init' | 'attendance' | 'salary' | 'workdays' | 'permissions';

interface SetupStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  linkText: string;
  actionLabel: string;
}

interface Holiday {
  id: string;
  name: string;
  fromDate: string;
  toDate: string;
  days: number;
}

interface Branch {
  id: string;
  name: string;
  workDays: string;
  status: 'active' | 'inactive';
}

// ─── Constants ───────────────────────────────────────────────────────────────

const sidebarTabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'init', label: 'Khởi tạo', icon: <Rocket className="h-4 w-4" /> },
  { id: 'attendance', label: 'Chấm công', icon: <Clock className="h-4 w-4" /> },
  { id: 'salary', label: 'Tính lương', icon: <DollarSign className="h-4 w-4" /> },
  { id: 'workdays', label: 'Ngày làm & Nghỉ', icon: <CalendarDays className="h-4 w-4" /> },
  { id: 'permissions', label: 'Phân quyền', icon: <Shield className="h-4 w-4" /> },
];

// ─── Tooltip Component ──────────────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center ml-1.5">
      <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs text-white bg-gray-800 rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-lg">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
      </span>
    </span>
  );
}

// ─── Initialization Tab ─────────────────────────────────────────────────────

function InitTab() {
  const navigate = useNavigate();
  const [steps] = useState<SetupStep[]>([
    {
      id: 'add-employee',
      title: 'Thêm nhân viên',
      description: 'Cửa hàng đang có 12 nhân viên.',
      completed: true,
      linkText: 'Xem danh sách',
      actionLabel: 'Thêm nhân viên',
    },
    {
      id: 'create-shift',
      title: 'Tạo ca làm việc',
      description: 'Cửa hàng đang có 2 ca làm việc.',
      completed: true,
      linkText: 'Xem danh sách',
      actionLabel: 'Tạo ca',
    },
    {
      id: 'schedule',
      title: 'Xếp lịch làm việc',
      description: 'Đã xếp lịch cho 12/12 nhân viên trong cửa hàng.',
      completed: true,
      linkText: 'Xem lịch',
      actionLabel: 'Xếp lịch',
    },
    {
      id: 'attendance-method',
      title: 'Hình thức chấm công',
      description: 'Cửa hàng đã thiết lập hình thức chấm công.',
      completed: true,
      linkText: 'Xem chi tiết',
      actionLabel: 'Thiết lập',
    },
    {
      id: 'salary-setup',
      title: 'Thiết lập lương',
      description: 'Đã thiết lập lương cho 12/12 nhân viên.',
      completed: true,
      linkText: 'Xem chi tiết',
      actionLabel: 'Thiết lập',
    },
    {
      id: 'payroll-setup',
      title: 'Thiết lập bảng lương',
      description: 'Theo dõi chính xác và tự động tính lương của nhân viên.',
      completed: false,
      linkText: 'Xem danh sách',
      actionLabel: 'Tạo bảng lương',
    },
  ]);

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-[17px] font-bold text-gray-900">Thiết lập nhanh</h2>
        <p className="text-[13px] text-gray-500 mt-1">
          Chỉ vài bước cài đặt để quản lý nhân viên hiệu quả, tối ưu vận hành và tính lương chính xác
        </p>
      </div>

      {/* Steps List */}
      <div className="space-y-0 divide-y divide-gray-100">
        {steps.map((step) => (
          <div
            key={step.id}
            className="flex items-center gap-4 py-5 px-1 group"
          >
            {/* Completion icon */}
            <div className="flex-shrink-0">
              {step.completed ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-[14px] font-semibold text-gray-900">{step.title}</h3>
              <p className="text-[13px] text-gray-500 mt-0.5">
                {step.description}{' '}
                {step.linkText && (
                  <button className="text-blue-600 hover:text-blue-700 font-medium hover:underline">
                    {step.linkText}
                  </button>
                )}
              </p>
            </div>

            {/* Action button */}
            <Button
              variant="outline"
              className="flex-shrink-0 h-[36px] px-4 text-[13px] font-medium text-gray-700 border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm"
              onClick={() => {
                if (step.id === 'add-employee') navigate('/employees');
                if (step.id === 'schedule') navigate('/work-schedule');
                if (step.id === 'salary-setup') navigate('/salary');
                if (step.id === 'payroll-setup') navigate('/salary');
              }}
            >
              {step.actionLabel}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Attendance Tab ──────────────────────────────────────────────────────────

function AttendanceTab() {
  const [standardHours, setStandardHours] = useState('8');
  const [halfDayEnabled, setHalfDayEnabled] = useState(false);
  const [maxHours, setMaxHours] = useState('4 giờ 30 phút');
  const [minHours, setMinHours] = useState('0 giờ');
  const [lateAfter, setLateAfter] = useState('0');
  const [earlyBefore, setEarlyBefore] = useState('0');
  const [countLateAfter, setCountLateAfter] = useState(true);
  const [countEarlyBefore, setCountEarlyBefore] = useState(true);
  const [overtimeBefore, setOvertimeBefore] = useState('0');
  const [overtimeAfter, setOvertimeAfter] = useState('0');
  const [countOvertimeBefore, setCountOvertimeBefore] = useState(true);
  const [countOvertimeAfter, setCountOvertimeAfter] = useState(true);
  const [allowSingleCheckIn, setAllowSingleCheckIn] = useState(false);
  const [autoAttendance, setAutoAttendance] = useState(false);

  // Right sidebar anchor items
  const rightSidebarItems = [
    { id: 'attendance-setup', label: 'Thiết lập chấm công' },
  ];

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 space-y-8">
        {/* Shift Setup */}
        <div className="pb-6">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-[15px] font-bold text-gray-900">Thiết lập ca làm việc</h3>
              <p className="text-[13px] text-gray-500 mt-0.5">Quản lý các ca làm việc của cửa hàng</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-gray-700 font-medium">2 ca làm việc</span>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-100" />

        {/* Standard Hour Settings */}
        <div id="attendance-setup" className="space-y-5">
          <div>
            <h3 className="text-[14px] font-bold text-orange-600">Số giờ của ngày công chuẩn</h3>
            <p className="text-[13px] text-gray-500 mt-0.5">
              Thiết lập số giờ tính 1 công hay 0,5 công của loại lương Theo ngày công chuẩn
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-[13px] text-gray-700 font-medium whitespace-nowrap">
              Số giờ của 1 ngày công chuẩn là
            </label>
            <div className="relative">
              <Input
                value={standardHours}
                onChange={(e) => setStandardHours(e.target.value)}
                className="w-[80px] h-[36px] text-center text-[13px] border-gray-300 rounded-lg"
              />
            </div>
            <span className="text-[13px] text-gray-600">giờ</span>
            <InfoTooltip text="Số giờ chuẩn cho 1 ngày công" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox
                id="half-day"
                checked={halfDayEnabled}
                onCheckedChange={(v) => setHalfDayEnabled(!!v)}
              />
              <label htmlFor="half-day" className="text-[13px] text-gray-700 cursor-pointer">
                Tính nửa công nếu nhân viên làm dưới
              </label>
              <InfoTooltip text="Nếu nhân viên làm ít hơn số giờ quy định sẽ tính 0.5 công" />
            </div>

            {halfDayEnabled && (
              <div className="ml-8 space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-[13px] text-gray-600">Làm tối đa</label>
                  <Input
                    value={maxHours}
                    onChange={(e) => setMaxHours(e.target.value)}
                    className="w-[120px] h-[36px] text-center text-[13px] border-gray-300 rounded-lg"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-[13px] text-gray-600">Làm tối thiểu</label>
                  <Input
                    value={minHours}
                    onChange={(e) => setMinHours(e.target.value)}
                    className="w-[120px] h-[36px] text-center text-[13px] border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="h-px bg-gray-100" />

        {/* Late & Early Settings */}
        <div className="space-y-4">
          <div>
            <h3 className="text-[14px] font-bold text-orange-600">Cài đặt đi muộn - về sớm</h3>
            <p className="text-[13px] text-gray-500 mt-0.5">
              Cài đặt thời gian tối đa được đi muộn hoặc về sớm
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox
                id="late-after"
                checked={countLateAfter}
                onCheckedChange={(v) => setCountLateAfter(!!v)}
              />
              <label htmlFor="late-after" className="text-[13px] text-gray-700 cursor-pointer">
                Tính đi muộn sau
              </label>
              <Input
                value={lateAfter}
                onChange={(e) => setLateAfter(e.target.value)}
                className="w-[70px] h-[36px] text-center text-[13px] border-gray-300 rounded-lg"
              />
              <span className="text-[13px] text-gray-600">phút</span>
              <InfoTooltip text="Số phút được phép đi muộn trước khi tính muộn" />
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="early-before"
                checked={countEarlyBefore}
                onCheckedChange={(v) => setCountEarlyBefore(!!v)}
              />
              <label htmlFor="early-before" className="text-[13px] text-gray-700 cursor-pointer">
                Tính về sớm trước
              </label>
              <Input
                value={earlyBefore}
                onChange={(e) => setEarlyBefore(e.target.value)}
                className="w-[70px] h-[36px] text-center text-[13px] border-gray-300 rounded-lg"
              />
              <span className="text-[13px] text-gray-600">phút</span>
              <InfoTooltip text="Số phút tối đa được về sớm" />
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-100" />

        {/* Overtime Settings */}
        <div className="space-y-4">
          <div>
            <h3 className="text-[14px] font-bold text-orange-600">Cài đặt làm thêm giờ</h3>
            <p className="text-[13px] text-gray-500 mt-0.5">
              Tính làm thêm giờ cho nhân viên khi vào ca sớm hoặc tan ca muộn
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox
                id="overtime-before"
                checked={countOvertimeBefore}
                onCheckedChange={(v) => setCountOvertimeBefore(!!v)}
              />
              <label htmlFor="overtime-before" className="text-[13px] text-gray-700 cursor-pointer">
                Tính làm thêm giờ trước ca
              </label>
              <Input
                value={overtimeBefore}
                onChange={(e) => setOvertimeBefore(e.target.value)}
                className="w-[70px] h-[36px] text-center text-[13px] border-gray-300 rounded-lg"
              />
              <span className="text-[13px] text-gray-600">phút</span>
              <InfoTooltip text="Số phút đến sớm trước ca tính là làm thêm giờ" />
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="overtime-after"
                checked={countOvertimeAfter}
                onCheckedChange={(v) => setCountOvertimeAfter(!!v)}
              />
              <label htmlFor="overtime-after" className="text-[13px] text-gray-700 cursor-pointer">
                Tính làm thêm giờ sau ca
              </label>
              <Input
                value={overtimeAfter}
                onChange={(e) => setOvertimeAfter(e.target.value)}
                className="w-[70px] h-[36px] text-center text-[13px] border-gray-300 rounded-lg"
              />
              <span className="text-[13px] text-gray-600">phút</span>
              <InfoTooltip text="Số phút ở lại sau ca tính là làm thêm giờ" />
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-100" />

        {/* Single Check-in */}
        <div className="flex items-start justify-between py-1">
          <div className="flex-1">
            <h3 className="text-[14px] font-bold text-gray-900">
              Cho phép chấm 1 lượt Vào - Ra khi làm nhiều ca liên tục
            </h3>
            <p className="text-[13px] text-gray-500 mt-1 leading-relaxed max-w-[700px]">
              Ví dụ: Ca 1 (7:00 - 12:00), Ca 2 (13:00 - 18:00). Bạn chỉ cần chấm công Vào ca 1, chấm công Ra ca 2 (bằng mã QR hoặc chấm vân tay), hệ thống sẽ tự động ghi nhận Ra ca 1 lúc 12:00, Vào ca 2 lúc 13:00
            </p>
          </div>
          <Switch
            checked={allowSingleCheckIn}
            onCheckedChange={setAllowSingleCheckIn}
          />
        </div>

        <div className="h-px bg-gray-100" />

        {/* Auto Attendance */}
        <div className="flex items-start justify-between py-1">
          <div className="flex-1">
            <h3 className="text-[14px] font-bold text-gray-900">Tự động chấm công</h3>
            <p className="text-[13px] text-gray-500 mt-1">
              Nhân viên không phải chủ động chấm công. Hệ thống sẽ tự động chấm công thay nhân viên
            </p>
          </div>
          <Switch
            checked={autoAttendance}
            onCheckedChange={setAutoAttendance}
          />
        </div>
      </div>

      {/* Right sidebar anchors */}
      <div className="hidden xl:block w-[180px] flex-shrink-0">
        <div className="sticky top-4 space-y-1">
          {rightSidebarItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="block text-[13px] text-orange-600 font-medium hover:text-orange-700 py-1 border-l-2 border-orange-500 pl-3"
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Salary Tab ──────────────────────────────────────────────────────────────

function SalaryTab() {
  const [payrollDay, setPayrollDay] = useState('1');
  const [autoCreatePayroll, setAutoCreatePayroll] = useState(true);
  const [autoUpdatePayroll, setAutoUpdatePayroll] = useState(true);
  const [multiServiceAll, setMultiServiceAll] = useState(true);
  const [multiSaleAll, setMultiSaleAll] = useState(true);
  const [revenueDefault, setRevenueDefault] = useState(true);

  const rightSidebarItems = [
    { id: 'salary-setup', label: 'Thiết lập tính lương' },
    { id: 'commission-setup', label: 'Thiết lập hoa hồng và thưởng' },
  ];

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 space-y-8">
        {/* Payroll Setup */}
        <div id="salary-setup" className="space-y-6">
          <div>
            <h2 className="text-[17px] font-bold text-gray-900">Thiết lập tính lương</h2>
          </div>

          {/* Payroll day */}
          <div className="space-y-3">
            <div>
              <h3 className="text-[14px] font-bold text-orange-600">Ngày tính lương</h3>
              <p className="text-[13px] text-gray-500 mt-0.5">
                Ngày bắt đầu tính công cho nhân viên có kỳ lương hàng tháng
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-[13px] text-gray-700 font-medium">
                Chọn ngày bắt đầu kỳ lương hàng tháng
              </label>
              <Select value={payrollDay} onValueChange={setPayrollDay}>
                <SelectTrigger className="w-[100px] h-[36px] text-[13px] border-gray-300 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)} className="text-[13px]">
                      Ngày {i + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <InfoTooltip text="Ngày bắt đầu tính lương hàng tháng" />
            </div>
          </div>

          <div className="h-px bg-gray-100" />

          {/* Auto Create Payroll */}
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-[14px] font-bold text-gray-900">Tự động tạo bảng tính lương</h3>
              <p className="text-[13px] text-gray-500 mt-0.5">
                Bảng tính lương sẽ được tự động tạo mới vào mỗi kỳ lương
              </p>
            </div>
            <Switch checked={autoCreatePayroll} onCheckedChange={setAutoCreatePayroll} />
          </div>

          <div className="h-px bg-gray-100" />

          {/* Auto Update Payroll */}
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-[14px] font-bold text-gray-900">Tự động cập nhật bảng tính lương</h3>
              <p className="text-[13px] text-gray-500 mt-0.5">
                Bảng tính lương sẽ được tự động cập nhật mỗi ngày
              </p>
            </div>
            <Switch checked={autoUpdatePayroll} onCheckedChange={setAutoUpdatePayroll} />
          </div>

          <div className="h-px bg-gray-100" />

          {/* Salary Templates */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-bold text-gray-900">Thiết lập Mẫu lương</h3>
              <p className="text-[13px] text-gray-500 mt-0.5">
                Thưởng, Hoa hồng, Phụ cấp, Giảm trừ
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-gray-700 font-medium">5 mẫu lương</span>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </div>
          </div>
        </div>

        <div className="h-px bg-gray-200" />

        {/* Commission Setup */}
        <div id="commission-setup" className="space-y-6">
          <div>
            <h2 className="text-[17px] font-bold text-gray-900">Thiết lập hoa hồng và thưởng</h2>
          </div>

          {/* Multiple employees - one service */}
          <div className="space-y-3">
            <h3 className="text-[14px] font-bold text-gray-900">Khi nhiều nhân viên cùng làm một dịch vụ</h3>
            <div className="space-y-2.5 ml-1">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                  name="multi-service"
                  checked={multiServiceAll}
                  onChange={() => setMultiServiceAll(true)}
                />
                <span className="text-[13px] text-gray-700">Mỗi nhân viên đều được ghi nhận toàn bộ doanh thu</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                  name="multi-service"
                  checked={!multiServiceAll}
                  onChange={() => setMultiServiceAll(false)}
                />
                <span className="text-[13px] text-gray-700">Chia doanh thu cho nhân viên theo hệ số trên hóa đơn</span>
              </label>
            </div>
          </div>

          {/* Multiple employees - sales */}
          <div className="space-y-3">
            <h3 className="text-[14px] font-bold text-gray-900">Khi nhiều nhân viên cùng tư vấn bán hàng</h3>
            <div className="space-y-2.5 ml-1">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                  name="multi-sale"
                  checked={multiSaleAll}
                  onChange={() => setMultiSaleAll(true)}
                />
                <span className="text-[13px] text-gray-700">Mỗi nhân viên đều được ghi nhận toàn bộ doanh thu</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                  name="multi-sale"
                  checked={!multiSaleAll}
                  onChange={() => setMultiSaleAll(false)}
                />
                <span className="text-[13px] text-gray-700">Chia doanh thu cho nhân viên theo hệ số trên hóa đơn</span>
              </label>
            </div>
          </div>

          <div className="h-px bg-gray-100" />

          {/* Revenue in Package / Treatment */}
          <div className="space-y-3">
            <h3 className="text-[14px] font-bold text-gray-900">Tính doanh thu của dịch vụ trong Gói dịch vụ, liệu trình</h3>
            <div className="space-y-2.5 ml-1">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                  name="revenue"
                  checked={revenueDefault}
                  onChange={() => setRevenueDefault(true)}
                />
                <span className="text-[13px] text-gray-700">Ghi nhận theo giá bán lẻ thông thường</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                  name="revenue"
                  checked={!revenueDefault}
                  onChange={() => setRevenueDefault(false)}
                />
                <span className="text-[13px] text-gray-700">Chia theo giá trị trong Gói dịch vụ, liệu trình</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Right sidebar anchors */}
      <div className="hidden xl:block w-[180px] flex-shrink-0">
        <div className="sticky top-4 space-y-1">
          {rightSidebarItems.map((item, idx) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn(
                "block text-[13px] font-medium py-1.5 pl-3 border-l-2 transition-colors",
                idx === 0
                  ? "text-orange-600 border-orange-500"
                  : "text-gray-500 border-transparent hover:text-orange-600 hover:border-orange-300"
              )}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Work Days & Holidays Tab ────────────────────────────────────────────────

function WorkDaysTab() {
  const [branches] = useState<Branch[]>([
    {
      id: '1',
      name: 'Chi nhánh trung tâm',
      workDays: 'T2, T3, T4, T5, T6, T7, CN',
      status: 'active',
    },
  ]);

  const [holidays] = useState<Holiday[]>([]);
  const [branchSearch, setBranchSearch] = useState('');
  const [showPerPage, setShowPerPage] = useState('10');

  const rightSidebarItems = [
    { id: 'workday-settings', label: 'Ngày làm việc' },
    { id: 'holiday-settings', label: 'Ngày lễ, tết' },
  ];

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 space-y-8">
        {/* Work Days */}
        <div id="workday-settings" className="space-y-5">
          <div>
            <h3 className="text-[15px] font-bold text-orange-600">Ngày làm việc</h3>
            <p className="text-[13px] text-gray-500 mt-0.5">
              Thiết lập ngày làm việc trong tuần của các chi nhánh
            </p>
          </div>

          {/* Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-[12px] font-bold text-gray-700 uppercase tracking-wide w-12">STT</th>
                  <th className="px-4 py-3 text-[12px] font-bold text-gray-700 uppercase tracking-wide">
                    <div className="space-y-2">
                      <span>Chi nhánh</span>
                      <div>
                        <Input
                          placeholder="Tìm chi nhánh"
                          value={branchSearch}
                          onChange={(e) => setBranchSearch(e.target.value)}
                          className="h-[32px] text-[12px] border-gray-300 rounded-lg w-[160px] mt-1"
                        />
                      </div>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-[12px] font-bold text-gray-700 uppercase tracking-wide">Ngày làm việc</th>
                  <th className="px-4 py-3 text-[12px] font-bold text-gray-700 uppercase tracking-wide">Trạng thái</th>
                  <th className="px-4 py-3 text-[12px] font-bold text-gray-700 uppercase tracking-wide w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {branches
                  .filter((b) => b.name.toLowerCase().includes(branchSearch.toLowerCase()))
                  .map((branch, index) => (
                    <tr key={branch.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-[13px] text-gray-700">{index + 1}</td>
                      <td className="px-4 py-3 text-[13px] text-gray-800 font-medium">{branch.name}</td>
                      <td className="px-4 py-3 text-[13px] text-gray-700">{branch.workDays}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-green-50 text-green-700">
                          Đang hoạt động
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center gap-2 text-[13px] text-gray-500">
            <span>Hiển thị</span>
            <Select value={showPerPage} onValueChange={setShowPerPage}>
              <SelectTrigger className="w-[90px] h-[32px] text-[12px] border-gray-300 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10" className="text-[12px]">10 bản ghi</SelectItem>
                <SelectItem value="20" className="text-[12px]">20 bản ghi</SelectItem>
                <SelectItem value="50" className="text-[12px]">50 bản ghi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="h-px bg-gray-200" />

        {/* Holidays */}
        <div id="holiday-settings" className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-bold text-orange-600">Ngày lễ, tết</h3>
              <p className="text-[13px] text-gray-500 mt-0.5">
                Thiết lập các ngày lễ, tết và chính sách thưởng nếu có
              </p>
            </div>
            <Button
              variant="outline"
              className="h-[36px] px-4 text-[13px] font-medium text-gray-700 border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm gap-2"
            >
              <Plus className="h-4 w-4" />
              Thêm kỳ lễ tết
            </Button>
          </div>

          {/* Holidays Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-[12px] font-bold text-gray-700 uppercase tracking-wide w-12">STT</th>
                  <th className="px-4 py-3 text-[12px] font-bold text-gray-700 uppercase tracking-wide">Tên kỳ lễ tết</th>
                  <th className="px-4 py-3 text-[12px] font-bold text-gray-700 uppercase tracking-wide">Từ ngày</th>
                  <th className="px-4 py-3 text-[12px] font-bold text-gray-700 uppercase tracking-wide">Đến hết ngày</th>
                  <th className="px-4 py-3 text-[12px] font-bold text-gray-700 uppercase tracking-wide">Số ngày</th>
                </tr>
              </thead>
              <tbody>
                {holidays.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[13px] text-gray-400">
                      Không có kết quả phù hợp
                    </td>
                  </tr>
                ) : (
                  holidays.map((h, index) => (
                    <tr key={h.id} className="hover:bg-gray-50/50 border-t border-gray-100">
                      <td className="px-4 py-3 text-[13px] text-gray-700">{index + 1}</td>
                      <td className="px-4 py-3 text-[13px] text-gray-800 font-medium">{h.name}</td>
                      <td className="px-4 py-3 text-[13px] text-gray-700">{h.fromDate}</td>
                      <td className="px-4 py-3 text-[13px] text-gray-700">{h.toDate}</td>
                      <td className="px-4 py-3 text-[13px] text-gray-700">{h.days}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right sidebar anchors */}
      <div className="hidden xl:block w-[180px] flex-shrink-0">
        <div className="sticky top-4 space-y-1">
          {rightSidebarItems.map((item, idx) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn(
                "block text-[13px] font-medium py-1.5 pl-3 border-l-2 transition-colors",
                idx === 0
                  ? "text-orange-600 border-orange-500"
                  : "text-gray-500 border-transparent hover:text-orange-600 hover:border-orange-300"
              )}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export function EmployeeSettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('init');

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Page Title */}
      <div className="px-6 py-4 border-b border-gray-100">
        <h1 className="text-[18px] font-bold text-gray-900 tracking-tight">Thiết lập nhân viên</h1>
      </div>

      <div className="flex min-h-[calc(100vh-12rem)]">
        {/* Left Sidebar */}
        <div className="w-[200px] border-r border-gray-100 bg-[#fbfcfd] flex-shrink-0 py-4">
          <div className="px-3 mb-3">
            <p className="text-[12px] font-bold text-gray-400 uppercase tracking-widest px-2">Thiết lập</p>
          </div>
          <nav className="space-y-0.5 px-3">
            {sidebarTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all cursor-pointer",
                  activeTab === tab.id
                    ? "bg-blue-50 text-blue-600 shadow-sm"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <span className={cn(
                  "flex-shrink-0",
                  activeTab === tab.id ? "text-blue-600" : "text-gray-400"
                )}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6 overflow-auto">
          {activeTab === 'init' && <InitTab />}
          {activeTab === 'attendance' && <AttendanceTab />}
          {activeTab === 'salary' && <SalaryTab />}
          {activeTab === 'workdays' && <WorkDaysTab />}
          {activeTab === 'permissions' && <ViewPermissionsPanel />}
        </div>
      </div>
    </div>
  );
}
