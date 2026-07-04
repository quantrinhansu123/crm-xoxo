import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, LogIn, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';

const LOGIN_IMAGES = {
    shoes: '/images/login/leather-shoes.jpg',
    handbag: '/images/login/handbag.jpg',
    bag: '/images/login/leather-bag.jpg',
} as const;

const HERO_FEATURES = [
    'Quản lý đơn giày, túi & phụ kiện da',
    'Theo dõi quy trình sửa chữa theo thời gian thực',
    'Báo cáo doanh thu & hoa hồng chi tiết',
    'Phân quyền Sale, Kỹ thuật, Kế toán',
] as const;

const HERO_STATS = [
    { value: '1,500+', label: 'Khách hàng' },
    { value: '50M+', label: 'Doanh thu/tháng' },
    { value: '98%', label: 'Hài lòng' },
    { value: '24/7', label: 'Hỗ trợ' },
] as const;

export function LoginPage() {
    const { login, isLoading: authLoading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!email || !password) {
            setError('Vui lòng nhập email và mật khẩu');
            return;
        }

        setIsLoading(true);

        try {
            await login(email, password);
        } catch (err: unknown) {
            const message =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                'Đăng nhập thất bại. Vui lòng thử lại.';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    };

    const loading = isLoading || authLoading;

    return (
        <div className="min-h-screen flex">
            {/* Left side - Login Form */}
            <div className="flex-1 flex items-center justify-center p-8 bg-white">
                <div className="w-full max-w-md">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-700 to-stone-900 text-white font-bold text-2xl shadow-lg shadow-amber-900/25">
                            C
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">
                                CRM<span className="text-amber-700">Pro</span>
                            </h1>
                            <p className="text-sm text-muted-foreground">Chăm sóc giày & túi da cao cấp</p>
                        </div>
                    </div>

                    <div className="mb-8">
                        <h2 className="text-3xl font-bold text-foreground mb-2">Đăng nhập</h2>
                        <p className="text-muted-foreground">
                            Chào mừng bạn quay trở lại! Vui lòng đăng nhập để tiếp tục.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="name@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="pl-11 h-12"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Mật khẩu</Label>
                                <button type="button" className="text-sm text-amber-700 hover:underline">
                                    Quên mật khẩu?
                                </button>
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-11 pr-11 h-12"
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="remember"
                                checked={rememberMe}
                                onCheckedChange={(checked) => setRememberMe(!!checked)}
                            />
                            <Label htmlFor="remember" className="cursor-pointer text-sm">
                                Ghi nhớ đăng nhập
                            </Label>
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
                                {error}
                            </div>
                        )}

                        <Button type="submit" className="w-full h-12 text-base bg-amber-800 hover:bg-amber-900" disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                    Đang đăng nhập...
                                </>
                            ) : (
                                <>
                                    <LogIn className="h-5 w-5 mr-2" />
                                    Đăng nhập
                                </>
                            )}
                        </Button>
                    </form>
                </div>
            </div>

            {/* Right side - Brand hero with leather goods imagery */}
            <div className="hidden lg:flex flex-1 relative overflow-hidden bg-stone-900">
                <div className="absolute inset-0 grid grid-cols-2">
                    <img
                        src={LOGIN_IMAGES.shoes}
                        alt="Giày da cao cấp"
                        className="h-full w-full object-cover"
                    />
                    <div className="grid grid-rows-2 h-full">
                        <img
                            src={LOGIN_IMAGES.handbag}
                            alt="Túi xách da thời trang"
                            className="h-full w-full object-cover"
                        />
                        <img
                            src={LOGIN_IMAGES.bag}
                            alt="Phụ kiện da cao cấp"
                            className="h-full w-full object-cover"
                        />
                    </div>
                </div>

                <div
                    className="absolute inset-0 bg-gradient-to-br from-stone-950/85 via-amber-950/75 to-stone-900/90"
                    aria-hidden
                />

                <div className="absolute right-8 top-1/2 -translate-y-1/2 z-20 hidden xl:flex flex-col gap-4 w-52">
                    <div className="rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/20 rotate-2 hover:rotate-0 transition-transform duration-500">
                        <img src={LOGIN_IMAGES.shoes} alt="Giày da" className="h-36 w-full object-cover" />
                        <div className="bg-white/95 px-3 py-2">
                            <p className="text-xs font-semibold text-stone-800 tracking-wide uppercase">Giày da</p>
                            <p className="text-[10px] text-stone-500">Chăm sóc & bảo dưỡng</p>
                        </div>
                    </div>
                    <div className="rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/20 -rotate-2 hover:rotate-0 transition-transform duration-500 ml-6">
                        <img src={LOGIN_IMAGES.handbag} alt="Túi xách" className="h-36 w-full object-cover" />
                        <div className="bg-white/95 px-3 py-2">
                            <p className="text-xs font-semibold text-stone-800 tracking-wide uppercase">Túi xách</p>
                            <p className="text-[10px] text-stone-500">Phục hồi & làm mới</p>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 flex flex-col justify-center p-12 text-white max-w-xl">
                    <p className="text-amber-300/90 text-sm font-medium tracking-widest uppercase mb-3">
                        Thương hiệu đồ da cao cấp
                    </p>

                    <div className="grid grid-cols-2 gap-3 mb-8">
                        {HERO_STATS.map((stat) => (
                            <div
                                key={stat.label}
                                className="p-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/10"
                            >
                                <p className="text-2xl font-bold">{stat.value}</p>
                                <p className="text-white/75 text-sm">{stat.label}</p>
                            </div>
                        ))}
                    </div>

                    <h2 className="text-3xl font-bold mb-4 leading-tight">
                        Quản lý xưởng giày & túi da chuyên nghiệp
                    </h2>
                    <p className="text-white/80 text-lg mb-8 leading-relaxed">
                        CRM/ERP dành cho shop đồ hiệu — theo dõi đơn chăm sóc giày, túi,
                        khách hàng và doanh thu trên một nền tảng.
                    </p>

                    <ul className="space-y-3">
                        {HERO_FEATURES.map((feature, i) => (
                            <li key={i} className="flex items-center gap-3">
                                <div className="h-6 w-6 rounded-full bg-amber-400/25 flex items-center justify-center shrink-0">
                                    <svg className="h-4 w-4 text-amber-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <span className="text-white/90">{feature}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="absolute bottom-8 right-8 z-10 text-white/50 text-sm">
                    © 2026 CRMPro. All rights reserved.
                </div>
            </div>
        </div>
    );
}
