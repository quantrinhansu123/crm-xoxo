import { useState } from 'react';
import { Target, BarChart3, AlertTriangle, Trophy, Settings, UserPlus } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KPIPoliciesTab } from '@/components/kpi/KPIPoliciesTab';
import { KPIMonthlyTab } from '@/components/kpi/KPIMonthlyTab';
import { KPIViolationsTab } from '@/components/kpi/KPIViolationsTab';
import { KPILeaderboardTab } from '@/components/kpi/KPILeaderboardTab';
import { KPISettingsTab } from '@/components/kpi/KPISettingsTab';
import { KPIAssignmentsTab } from '@/components/kpi/KPIAssignmentsTab';

export function KPIPage() {
    const [activeTab, setActiveTab] = useState('monthly');

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground">KPI & Hiệu suất</h1>
                <p className="text-muted-foreground">Quản lý chính sách, theo dõi và đánh giá hiệu suất nhân viên</p>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="bg-muted/50 p-1">
                    <TabsTrigger value="policies" className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        <span className="hidden sm:inline">Chính sách KPI</span>
                        <span className="sm:hidden">CS</span>
                    </TabsTrigger>
                    <TabsTrigger value="assignments" className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4" />
                        <span className="hidden sm:inline">Gán KPI</span>
                        <span className="sm:hidden">Gan</span>
                    </TabsTrigger>
                    <TabsTrigger value="monthly" className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        <span className="hidden sm:inline">KPI Tháng</span>
                        <span className="sm:hidden">Tháng</span>
                    </TabsTrigger>
                    <TabsTrigger value="violations" className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="hidden sm:inline">Vi phạm / Phạt</span>
                        <span className="sm:hidden">VP</span>
                    </TabsTrigger>
                    <TabsTrigger value="leaderboard" className="flex items-center gap-2">
                        <Trophy className="h-4 w-4" />
                        <span className="hidden sm:inline">Xếp hạng</span>
                        <span className="sm:hidden">XH</span>
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        <span className="hidden sm:inline">Thiết lập</span>
                        <span className="sm:hidden">TL</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="policies" className="mt-4">
                    <KPIPoliciesTab />
                </TabsContent>

                <TabsContent value="assignments" className="mt-4">
                    <KPIAssignmentsTab />
                </TabsContent>

                <TabsContent value="monthly" className="mt-4">
                    <KPIMonthlyTab />
                </TabsContent>

                <TabsContent value="violations" className="mt-4">
                    <KPIViolationsTab />
                </TabsContent>

                <TabsContent value="leaderboard" className="mt-4">
                    <KPILeaderboardTab />
                </TabsContent>

                <TabsContent value="settings" className="mt-4">
                    <KPISettingsTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
