import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ProductType } from '@/hooks/useProductTypes';

interface ProductTypesTableProps {
    productTypes: ProductType[];
    loading: boolean;
    onEdit: (type: ProductType) => void;
    onDelete: (id: string) => void;
}

export function ProductTypesTable({ productTypes, loading, onEdit, onDelete }: ProductTypesTableProps) {
    if (loading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (productTypes.length === 0) {
        return (
            <div className="text-center p-8 text-muted-foreground">
                Chưa có loại sản phẩm nào.
            </div>
        );
    }

    return (
        <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Mã</TableHead>
                        <TableHead>Tên loại</TableHead>
                        <TableHead>Mô tả</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {productTypes.map((type) => (
                        <TableRow key={type.id}>
                            <TableCell className="font-medium">{type.code}</TableCell>
                            <TableCell>
                                <Badge variant="outline">{type.name}</Badge>
                            </TableCell>
                            <TableCell>{type.description}</TableCell>
                            <TableCell className="text-right">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => onEdit(type)}
                                >
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => onDelete(type.id)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
