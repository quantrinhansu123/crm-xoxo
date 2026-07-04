import { useState, useEffect } from 'react';
import { Award, Calendar, Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useKPI } from '@/hooks/useKPI';
import { formatCurrency } from '@/lib/utils';

const rankColors: Record<string, string> = {
    'A+': 'bg-emerald-100 text-emerald-800 border-emerald-300',
    'A': 'bg-blue-100 text-blue-800 border-blue-300',
    'B': 'bg-amber-100 text-amber-800 border-amber-300',
    'C': 'bg-orange-100 text-orange-800 border-orange-300',
    'D': 'bg-red-100 text-red-800 border-red-300',
};

const roleLabels: Record<string, string> = {
    sale: 'Sale',
    technician: 'Kỹ thuật',
    manager: 'Quản lý',
    accountant: 'Kế toán',
};

function getMonthOptions() {
    const options = [];
    const now = new Date();
    for (let i = 2; i >= -6; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
        options.push({ key, label });
    }
    return options;
}

export function KPILeaderboardTab() {
    const { leaderboard, fetchLeaderboard } = useKPI();

    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [monthKey, setMonthKey] = useState(defaultMonth);
    const [roleFilter, setRoleFilter] = useState('all');

    const monthOptions = getMonthOptions();

    useEffect(() => {
        fetchLeaderboard({
            month_key: monthKey,
            role: roleFilter !== 'all' ? roleFilter : undefined,
            limit: 50,
        });
    }, [fetchLeaderboard, monthKey, roleFilter]);

    const getPositionDisplay = (pos: number) => {
        if (pos === 1) return <span className="text-2xl">🥇</span>;
        if (pos === 2) return <span className="text-2xl">🥈</span>;
        if (pos === 3) return <span className="text-2xl">🥉</span>;
        return <span className="text-lg font-bold text-muted-foreground">{pos}</span>;
    };

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center gap-2">
                <Select value={monthKey} onValueChange={setMonthKey}>
                    <SelectTrigger className="w-48">
                        <Calendar className="h-4 w-4 mr-2" />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {monthOptions.map(o => (
                            <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-36">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Tất cả role</SelectItem>
                        <SelectItem value="sale">Sale</SelectItem>
                        <SelectItem value="technician">Kỹ thuật</SelectItem>
                        <SelectItem value="manager">Quản lý</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Top 3 highlight */}
            {leaderboard.length >= 3 && (
                <div className="grid grid-cols-3 gap-4">
                    {leaderboard.slice(0, 3).map((item: any, idx: number) => (
                        <Card key={item.id} className={idx === 0 ? 'border-amber-300 bg-amber-50/50' : ''}>
                            <CardContent className="p-4 text-center">
                                <div className="mb-2">{getPositionDisplay(idx + 1)}</div>
                                <Avatar className="h-14 w-14 mx-auto mb-2">
                                    <AvatarImage src={item.employee?.avatar} />
                                    <AvatarFallback>{item.employee?.name?.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <p className="font-bold">{item.employee?.name}</p>
                                <Badge variant="outline" className="text-xs mt-1">{roleLabels[item.employee?.role] || item.employee?.role}</Badge>
                                <div className="mt-2">
                                    <span className={`inline-block px-3 py-1 rounded-full text-lg font-bold border ${rankColors[item.rank] || 'bg-gray-100'}`}>
                                        {item.rank}
                                    </span>
                                </div>
                                <p className="text-2xl font-bold mt-1">{Number(item.total_score).toFixed(1)}</p>
                                <p className="text-xs text-muted-foreground">điểm</p>
                                {Number(item.kpi_bonus_amount) > 0 && (
                                    <p className="text-sm text-emerald-600 font-medium mt-1">
                                        +{formatCurrency(item.kpi_bonus_amount)}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Full leaderboard table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Trophy className="h-5 w-5 text-amber-500" />
                        Bảng xếp hạng KPI
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-muted/50 border-y">
                                <tr>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground w-16">#</th>
                                    <th className="p-3 text-left text-sm font-medium text-muted-foreground">Nhân sự</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Điểm</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Xếp loại</th>
                                    <th className="p-3 text-right text-sm font-medium text-muted-foreground">Thưởng</th>
                                    <th className="p-3 text-right text-sm font-medium text-muted-foreground">Phạt</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Hệ số HH</th>
                                    <th className="p-3 text-center text-sm font-medium text-muted-foreground">Trạng thái</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboard.length === 0 ? (
                                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">
                                        Chưa có dữ liệu KPI cho tháng này
                                    </td></tr>
                                ) : (
                                    leaderboard.map((item: any) => (
                                        <tr key={item.id} className="border-b hover:bg-muted/30 transition-colors">
                                            <td className="p-3 text-center">{getPositionDisplay(item.position)}</td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={item.employee?.avatar} />
                                                        <AvatarFallback>{item.employee?.name?.charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <p className="font-medium">{item.employee?.name}</p>
                                                        <Badge variant="outline" className="text-xs">{roleLabels[item.employee?.role] || item.employee?.role}</Badge>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className={`text-lg font-bold ${
                                                    item.total_score >= 85 ? 'text-emerald-600' :
                                                    item.total_score >= 65 ? 'text-amber-600' : 'text-red-600'
                                                }`}>
                                                    {Number(item.total_score).toFixed(1)}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold border ${rankColors[item.rank] || ''}`}>
                                                    {item.rank || '-'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-right text-emerald-600 font-medium">
                                                {Number(item.kpi_bonus_amount) > 0 ? formatCurrency(item.kpi_bonus_amount) : '-'}
                                            </td>
                                            <td className="p-3 text-right text-red-600 font-medium">
                                                {Number(item.kpi_penalty_amount) > 0 ? formatCurrency(item.kpi_penalty_amount) : '-'}
                                            </td>
                                            <td className="p-3 text-center font-medium">
                                                x{Number(item.kpi_commission_factor).toFixed(2)}
                                            </td>
                                            <td className="p-3 text-center">
                                                <Badge variant={item.status === 'locked' ? 'success' : 'secondary'} className="text-xs">
                                                    {item.status === 'locked' ? 'Đã khóa' : item.status}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
