import { Edit, Trash2, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import type { ServicePackage } from './types';

interface PackagesTableProps {
    packages: ServicePackage[];
    onEdit: (pkg: ServicePackage) => void;
    onDelete: (id: string) => void;
}

export function PackagesTable({ packages, onEdit, onDelete }: PackagesTableProps) {
    return (
        <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-muted/50 border-b">
                        <tr>
                            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Hình ảnh</th>
                            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Mã</th>
                            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Tên gói</th>
                            <th className="p-3 text-center text-sm font-medium text-muted-foreground">Số mục</th>
                            <th className="p-3 text-right text-sm font-medium text-muted-foreground">Giá bán</th>
                            <th className="p-3 text-center text-sm font-medium text-muted-foreground">HH Sale</th>
                            <th className="p-3 text-center text-sm font-medium text-muted-foreground">HH KTV</th>
                            <th className="p-3 text-center text-sm font-medium text-muted-foreground">Trạng thái</th>
                            <th className="p-3 text-right text-sm font-medium text-muted-foreground">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        {packages.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="p-8 text-center text-muted-foreground">
                                    Không tìm thấy gói dịch vụ nào
                                </td>
                            </tr>
                        ) : (
                            packages.map((pkg) => (
                                <tr key={pkg.id} className="border-b hover:bg-muted/30 transition-colors">
                                    <td className="p-3">
                                        {pkg.image ? (
                                            <img
                                                src={pkg.image}
                                                alt={pkg.name}
                                                className="w-12 h-12 rounded-lg object-cover border shadow-sm"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                                                <Gift className="h-5 w-5 text-muted-foreground" />
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-3 font-mono text-sm">{pkg.code}</td>
                                    <td className="p-3">
                                        <p className="font-medium">{pkg.name}</p>
                                        <p className="text-xs text-muted-foreground">{pkg.description}</p>
                                    </td>
                                    <td className="p-3 text-center">
                                        <Badge variant="outline">{pkg.items?.length || 0} mục</Badge>
                                    </td>
                                    <td className="p-3 text-right font-semibold text-primary">{formatCurrency(pkg.price)}</td>
                                    <td className="p-3 text-center text-sm">
                                        {pkg.commission_sale || 0}%
                                    </td>
                                    <td className="p-3 text-center text-sm">
                                        {pkg.commission_tech || 0}%
                                    </td>
                                    <td className="p-3 text-center">
                                        <Badge variant={pkg.status === 'active' ? 'success' : 'secondary'}>
                                            {pkg.status === 'active' ? 'Hoạt động' : 'Ngưng'}
                                        </Badge>
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button variant="ghost" size="icon" onClick={() => onEdit(pkg)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-50" onClick={() => onDelete(pkg.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
                {packages.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        Không tìm thấy gói dịch vụ nào
                    </div>
                ) : (
                    packages.map((pkg) => (
                        <div key={pkg.id} className="bg-card rounded-lg border p-4 space-y-3">
                            <div className="flex items-start gap-3">
                                {pkg.image ? (
                                    <img
                                        src={pkg.image}
                                        alt={pkg.name}
                                        className="w-16 h-16 rounded-lg object-cover border shadow-sm shrink-0"
                                    />
                                ) : (
                                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                        <Gift className="h-8 w-8 text-muted-foreground" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h3 className="font-medium truncate pr-2">{pkg.name}</h3>
                                            <p className="text-sm text-muted-foreground font-mono">{pkg.code}</p>
                                        </div>
                                        <Badge variant={pkg.status === 'active' ? 'success' : 'secondary'} className="shrink-0">
                                            {pkg.status === 'active' ? 'Hoạt động' : 'Ngưng'}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="font-bold text-primary">{formatCurrency(pkg.price)}</span>
                                        <Badge variant="outline" className="text-xs">
                                            {pkg.items?.length || 0} mục
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            {pkg.description && (
                                <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{pkg.description}</p>
                            )}

                            <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t">
                                <div className="flex items-center justify-between col-span-2">
                                    <span className="text-muted-foreground">HH Sale/KTV:</span>
                                    <span>{pkg.commission_sale || 0}% / {pkg.commission_tech || 0}%</span>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t">
                                <Button variant="outline" size="sm" onClick={() => onEdit(pkg)} className="flex-1">
                                    <Edit className="h-4 w-4 mr-2" />
                                    Sửa
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => onDelete(pkg.id)} className="flex-1 text-red-500 hover:text-red-600 hover:bg-red-50">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Xóa
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </>
    );
}

