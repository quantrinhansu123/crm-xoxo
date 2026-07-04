import React, { useState, useMemo } from 'react';
import { X, Filter, RotateCcw, ChevronDown, ChevronUp, Search, User, Briefcase, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { sourceLabels } from './constants';
import { cn } from '@/lib/utils';
import type { Lead } from '@/hooks/useLeads';

interface MobileFilterSheetProps {
    open: boolean;
    onClose: () => void;
    selectedSources: string[];
    setSelectedSources: (value: string[]) => void;
    selectedEmployees: string[];
    setSelectedEmployees: (value: string[]) => void;
    onlyUnassigned: boolean;
    setOnlyUnassigned: (value: boolean) => void;
    leads: Lead[];
    employees: any[];
    onClear: () => void;
}

export function MobileFilterSheet({
    open,
    onClose,
    selectedSources,
    setSelectedSources,
    selectedEmployees,
    setSelectedEmployees,
    onlyUnassigned,
    setOnlyUnassigned,
    leads,
    employees,
    onClear
}: MobileFilterSheetProps) {
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        assignment: true, // Default open first section
        sources: false,
        employees: false
    });

    const [searchTerms, setSearchTerms] = useState({
        sources: '',
        employees: ''
    });

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // Calculate counts for each option
    const counts = useMemo(() => {
        const sourceCounts: Record<string, number> = {};
        const employeeCounts: Record<string, number> = {};
        let unassignedCount = 0;

        leads.forEach(lead => {
            if (!lead.assigned_to) {
                unassignedCount++;
            }

            const source = lead.source || 'other';
            sourceCounts[source] = (sourceCounts[source] || 0) + 1;
            
            if (lead.assigned_to) {
                employeeCounts[lead.assigned_to] = (employeeCounts[lead.assigned_to] || 0) + 1;
            }
        });

        return { sourceCounts, employeeCounts, unassignedCount };
    }, [leads]);

    const totalSelected = selectedSources.length + selectedEmployees.length + (onlyUnassigned ? 1 : 0);

    const renderAccordionSection = (
        id: string,
        label: string,
        icon: React.ReactNode,
        selectedCount: number,
        onClearSection: () => void,
        onSelectAll: (() => void) | null,
        isAllSelected: boolean,
        children: React.ReactNode
    ) => {
        const isExpanded = expandedSections[id];
        const hasSearch = id !== 'assignment';

        return (
            <div className="border-b border-slate-100 last:border-0 overflow-hidden">
                <button
                    onClick={() => toggleSection(id)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="text-slate-500">{icon}</div>
                        <span className="font-bold text-[15px] text-foreground">{label}</span>
                        {selectedCount > 0 && (
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">
                                {selectedCount}
                            </span>
                        )}
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </button>

                <div className={cn(
                    "bg-white transition-all duration-200 ease-in-out",
                    isExpanded ? "max-h-[1000px] opacity-100 pb-4" : "max-h-0 opacity-0 pointer-events-none"
                )}>
                    <div className="px-5 space-y-3">
                        {/* Internal Search (if applicable) */}
                        {hasSearch && (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                <Input
                                    placeholder={`Tìm ${label.toLowerCase()}...`}
                                    value={(searchTerms as any)[id]}
                                    onChange={(e) => setSearchTerms(prev => ({ ...prev, [id]: e.target.value }))}
                                    className="pl-9 h-9 text-sm bg-slate-50 border-slate-200 rounded-lg"
                                />
                            </div>
                        )}

                        {/* Actions (if applicable) */}
                        {onSelectAll && (
                            <div className="flex items-center justify-between text-xs py-1">
                                <div className="flex items-center gap-2">
                                    <Checkbox 
                                        id={`select-all-${id}`} 
                                        checked={isAllSelected}
                                        onCheckedChange={onSelectAll}
                                    />
                                    <label htmlFor={`select-all-${id}`} className="font-medium text-slate-500 cursor-pointer">Chọn tất cả</label>
                                </div>
                                {selectedCount > 0 && (
                                    <button onClick={onClearSection} className="text-blue-600 font-bold hover:underline">Xóa chọn</button>
                                )}
                            </div>
                        )}

                        {/* Items List */}
                        <div className="space-y-1 pt-1">
                            {children}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (!open) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-50 bg-black/40 animate-fade-in md:hidden"
                onClick={onClose}
            />

            {/* Bottom Sheet */}
            <div className="fixed inset-x-0 bottom-0 z-50 mobile-bottom-sheet md:hidden">
                <div className="bg-white rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col">
                    {/* Handle bar */}
                    <div className="flex justify-center pt-3 pb-1">
                        <div className="w-10 h-1 rounded-full bg-slate-300" />
                    </div>

                    {/* Header */}
                    <div className="px-5 pb-3 pt-1 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Filter className="h-5 w-5 text-primary" />
                            <div className="flex items-center gap-1.5">
                                <h3 className="font-bold text-lg text-foreground">Bộ lọc</h3>
                                {totalSelected > 0 && (
                                    <span className="flex items-center justify-center min-w-[20px] h-5 rounded-full bg-primary text-white text-[10px] font-bold px-1.5">
                                        {totalSelected}
                                    </span>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full hover:bg-slate-100 transition-colors -mr-2"
                        >
                            <X className="h-5 w-5 text-muted-foreground" />
                        </button>
                    </div>

                    {/* Accordion Content */}
                    <div className="overflow-y-auto flex-1">
                        {/* Bàn giao section - Replacement for "Trạng thái" */}
                        {renderAccordionSection(
                            'assignment',
                            'Bàn giao',
                            <UserX className="h-4 w-4" />,
                            onlyUnassigned ? 1 : 0,
                            () => setOnlyUnassigned(false),
                            null,
                            false,
                            <div 
                                className={cn(
                                    "flex items-center justify-between p-3 rounded-lg border border-transparent transition-all cursor-pointer",
                                    onlyUnassigned ? "bg-blue-50/80 border-blue-100" : "hover:bg-slate-50"
                                )}
                                onClick={() => setOnlyUnassigned(!onlyUnassigned)}
                            >
                                <div className="flex items-center gap-2.5">
                                    <Checkbox checked={onlyUnassigned} />
                                    <span className={cn("text-sm font-medium", onlyUnassigned ? "text-blue-700" : "text-slate-600")}>
                                        Khách CRM chưa có người phụ trách
                                    </span>
                                </div>
                                <span className="text-[11px] font-bold text-slate-400">{counts.unassignedCount}</span>
                            </div>
                        )}

                        {/* Nguồn Section */}
                        {renderAccordionSection(
                            'sources',
                            'Nguồn',
                            <Briefcase className="h-4 w-4" />, // Better icon for source
                            selectedSources.length,
                            () => setSelectedSources([]),
                            () => {
                                const allSources = Object.keys(sourceLabels);
                                if (selectedSources.length === allSources.length) setSelectedSources([]);
                                else setSelectedSources(allSources);
                            },
                            selectedSources.length === Object.keys(sourceLabels).length,
                            Object.entries(sourceLabels)
                                .filter(([_, s]) => s.label.toLowerCase().includes(searchTerms.sources.toLowerCase()))
                                .map(([key, source]) => (
                                    <div 
                                        key={key} 
                                        className={cn(
                                            "flex items-center justify-between p-2.5 rounded-lg border border-transparent transition-all cursor-pointer",
                                            selectedSources.includes(key) ? "bg-blue-50/80 border-blue-100" : "hover:bg-slate-50"
                                        )}
                                        onClick={() => {
                                            if (selectedSources.includes(key)) setSelectedSources(selectedSources.filter(s => s !== key));
                                            else setSelectedSources([...selectedSources, key]);
                                        }}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <Checkbox checked={selectedSources.includes(key)} />
                                            <span className={cn("text-sm font-medium", selectedSources.includes(key) ? "text-blue-700" : "text-slate-600")}>
                                                {source.label}
                                            </span>
                                        </div>
                                        <span className="text-[11px] font-bold text-slate-400">{counts.sourceCounts[key] || 0}</span>
                                    </div>
                                ))
                        )}

                        {/* Employee Section */}
                        {renderAccordionSection(
                            'employees',
                            'Nhân viên phụ trách',
                            <User className="h-4 w-4" />,
                            selectedEmployees.length,
                            () => setSelectedEmployees([]),
                            () => {
                                if (selectedEmployees.length === employees.length) setSelectedEmployees([]);
                                else setSelectedEmployees(employees.map(e => e.id));
                            },
                            employees.length > 0 && selectedEmployees.length === employees.length,
                            employees
                                .filter(e => e.name.toLowerCase().includes(searchTerms.employees.toLowerCase()))
                                .map(employee => (
                                    <div 
                                        key={employee.id} 
                                        className={cn(
                                            "flex items-center justify-between p-2.5 rounded-lg border border-transparent transition-all cursor-pointer",
                                            selectedEmployees.includes(employee.id) ? "bg-blue-50/80 border-blue-100" : "hover:bg-slate-50"
                                        )}
                                        onClick={() => {
                                            if (selectedEmployees.includes(employee.id)) setSelectedEmployees(selectedEmployees.filter(s => s !== employee.id));
                                            else setSelectedEmployees([...selectedEmployees, employee.id]);
                                        }}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <Checkbox checked={selectedEmployees.includes(employee.id)} />
                                            <span className={cn("text-sm font-medium", selectedEmployees.includes(employee.id) ? "text-blue-700" : "text-slate-600")}>
                                                {employee.name}
                                            </span>
                                        </div>
                                        <span className="text-[11px] font-bold text-slate-400">{counts.employeeCounts[employee.id] || 0}</span>
                                    </div>
                                ))
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-5 pb-8 border-t border-slate-100 bg-white flex gap-3">
                        <Button 
                            variant="outline" 
                            onClick={onClear}
                            className="flex-1 h-12 gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 group"
                        >
                            <X className="h-4 w-4 group-hover:scale-110 transition-transform" />
                            Xóa bộ lọc
                        </Button>
                        <Button 
                            onClick={onClose}
                            className="flex-1 h-12 shadow-lg shadow-blue-200 bg-blue-600 hover:bg-blue-700 text-white gap-2"
                        >
                            Áp dụng
                            {totalSelected > 0 && (
                                <span className="flex items-center justify-center min-w-[20px] h-5 rounded-full bg-white/20 text-white text-[10px] font-bold px-1.5 backdrop-blur-sm">
                                    {totalSelected}
                                </span>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}
