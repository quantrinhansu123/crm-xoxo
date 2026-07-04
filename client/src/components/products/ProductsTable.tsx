import { Edit, Trash2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import type { Product } from './types';

interface ProductsTableProps {
    products: Product[];
    loading: boolean;
    onEdit: (product: Product) => void;
    onDelete: (id: string) => void;
}

export function ProductsTable({ products, loading, onEdit, onDelete }: ProductsTableProps) {
    return (
        <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-muted/50 border-b">
                        <tr>
                            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Hình ảnh</th>
                            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Mã</th>
                            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Tên sản phẩm</th>
                            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Đơn vị</th>
                            <th className="p-3 text-right text-sm font-medium text-muted-foreground">Giá</th>
                            <th className="p-3 text-center text-sm font-medium text-muted-foreground">Tồn kho</th>
                            <th className="p-3 text-center text-sm font-medium text-muted-foreground">HH Sale</th>
                            <th className="p-3 text-center text-sm font-medium text-muted-foreground">HH KTV</th>
                            <th className="p-3 text-center text-sm font-medium text-muted-foreground">Trạng thái</th>
                            <th className="p-3 text-right text-sm font-medium text-muted-foreground">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && products.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="p-8 text-center text-muted-foreground">
                                    Đang tải dữ liệu...
                                </td>
                            </tr>
                        ) : products.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="p-8 text-center text-muted-foreground">
                                    Không tìm thấy sản phẩm nào
                                </td>
                            </tr>
                        ) : (
                            products.map((product) => (
                                <tr key={product.id} className="border-b hover:bg-muted/30 transition-colors">
                                    <td className="p-3">
                                        {product.image ? (
                                            <img
                                                src={product.image}
                                                alt={product.name}
                                                className="w-12 h-12 rounded-lg object-cover border shadow-sm"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                                                <Package className="h-5 w-5 text-muted-foreground" />
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-3 font-mono text-sm">{product.code}</td>
                                    <td className="p-3 font-medium">{product.name}</td>
                                    <td className="p-3 text-sm">{product.unit}</td>
                                    <td className="p-3 text-right font-semibold text-primary">{formatCurrency(product.price)}</td>
                                    <td className="p-3 text-center">
                                        <Badge variant={product.stock > 10 ? 'success' : product.stock > 0 ? 'warning' : 'danger'}>
                                            {product.stock}
                                        </Badge>
                                    </td>
                                    <td className="p-3 text-center text-sm">
                                        {product.commission_sale || 0}%
                                    </td>
                                    <td className="p-3 text-center text-sm">
                                        {product.commission_tech || 0}%
                                    </td>
                                    <td className="p-3 text-center">
                                        <Badge variant={product.status === 'active' ? 'success' : 'secondary'}>
                                            {product.status === 'active' ? 'Hoạt động' : 'Ngừng'}
                                        </Badge>
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button variant="ghost" size="icon" onClick={() => onEdit(product)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => onDelete(product.id)} className="text-red-500">
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
                {loading && products.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        Đang tải dữ liệu...
                    </div>
                ) : products.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        Không tìm thấy sản phẩm nào
                    </div>
                ) : (
                    products.map((product) => (
                        <div key={product.id} className="bg-card rounded-lg border p-4 space-y-3">
                            <div className="flex items-start gap-3">
                                {product.image ? (
                                    <img
                                        src={product.image}
                                        alt={product.name}
                                        className="w-16 h-16 rounded-lg object-cover border shadow-sm shrink-0"
                                    />
                                ) : (
                                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                        <Package className="h-8 w-8 text-muted-foreground" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h3 className="font-medium truncate pr-2">{product.name}</h3>
                                            <p className="text-sm text-muted-foreground font-mono">{product.code}</p>
                                        </div>
                                        <Badge variant={product.status === 'active' ? 'success' : 'secondary'} className="shrink-0">
                                            {product.status === 'active' ? 'Hoạt động' : 'Ngừng'}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="font-bold text-primary">{formatCurrency(product.price)}</span>
                                        <span className="text-sm text-muted-foreground">/ {product.unit}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Tồn kho:</span>
                                    <Badge variant={product.stock > 10 ? 'success' : product.stock > 0 ? 'warning' : 'danger'}>
                                        {product.stock}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">HH Sale/KTV:</span>
                                    <span>{product.commission_sale || 0}% / {product.commission_tech || 0}%</span>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t">
                                <Button variant="outline" size="sm" onClick={() => onEdit(product)} className="flex-1">
                                    <Edit className="h-4 w-4 mr-2" />
                                    Sửa
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => onDelete(product.id)} className="flex-1 text-red-500 hover:text-red-600 hover:bg-red-50">
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

