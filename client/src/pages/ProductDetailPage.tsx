import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Wrench, Gift, ShoppingCart, Star, Info, Clock, DollarSign, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { formatCurrency } from '@/lib/utils';
import { productsApi, servicesApi, packagesApi } from '@/lib/api';

interface ProductData {
    id: string;
    name: string;
    description?: string;
    price: number;
    stock?: number;
    category?: string;
    image_url?: string;
    status?: string;
}

interface ServiceData {
    id: string;
    name: string;
    description?: string;
    price: number;
    duration?: number;
    department?: string;
    status?: string;
}

interface PackageData {
    id: string;
    name: string;
    description?: string;
    price: number;
    items?: Array<{ service_id: string; service_name: string }>;
    status?: string;
}

type ItemType = 'product' | 'service' | 'package';

const getTypeIcon = (type: ItemType) => {
    switch (type) {
        case 'product': return <Package className="h-6 w-6" />;
        case 'service': return <Wrench className="h-6 w-6" />;
        case 'package': return <Gift className="h-6 w-6" />;
    }
};

const getTypeColor = (type: ItemType) => {
    switch (type) {
        case 'product': return 'bg-blue-100 text-blue-700';
        case 'service': return 'bg-purple-100 text-purple-700';
        case 'package': return 'bg-emerald-100 text-emerald-700';
    }
};

const getTypeLabel = (type: ItemType) => {
    switch (type) {
        case 'product': return 'Sản phẩm';
        case 'service': return 'Dịch vụ';
        case 'package': return 'Gói dịch vụ';
    }
};

export function ProductDetailPage() {
    const { type, id } = useParams<{ type: string; id: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [item, setItem] = useState<ProductData | ServiceData | PackageData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const itemType = type as ItemType;
    const qrUrl = `${window.location.origin}/item/${type}/${id}`;

    useEffect(() => {
        const fetchItem = async () => {
            if (!type || !id) return;

            setLoading(true);
            setError(null);

            try {
                let response;
                switch (type) {
                    case 'product':
                        response = await productsApi.getById(id);
                        break;
                    case 'service':
                        response = await servicesApi.getById(id);
                        break;
                    case 'package':
                        response = await packagesApi.getById(id);
                        break;
                    default:
                        setError('Loại không hợp lệ');
                        return;
                }

                const data = response.data?.data;
                if (data) {
                    setItem(data as unknown as ProductData | ServiceData | PackageData);
                } else {
                    setError('Không tìm thấy thông tin');
                }
            } catch (err: any) {
                console.error('Error fetching item:', err);
                setError(err.response?.data?.message || 'Lỗi khi tải thông tin');
            } finally {
                setLoading(false);
            }
        };

        fetchItem();
    }, [type, id]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
                    <p className="mt-4 text-muted-foreground">Đang tải...</p>
                </div>
            </div>
        );
    }

    if (error || !item) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
                <Card className="max-w-md w-full text-center">
                    <CardContent className="pt-6">
                        <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                            <Info className="h-8 w-8 text-red-600" />
                        </div>
                        <h2 className="text-xl font-bold mb-2">Không tìm thấy</h2>
                        <p className="text-muted-foreground mb-4">{error || 'Sản phẩm/dịch vụ không tồn tại'}</p>
                        <Button onClick={() => navigate(-1)}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Quay lại
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="font-semibold">Chi tiết {getTypeLabel(itemType)}</h1>
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-4 space-y-4">
                {/* Main Info Card */}
                <Card>
                    <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row gap-6">
                            {/* QR Code */}
                            <div className="flex-shrink-0">
                                <div className="p-4 bg-white border-2 border-dashed rounded-xl">
                                    <QRCodeSVG value={qrUrl} size={150} level="H" includeMargin />
                                </div>
                                <p className="text-xs text-center text-muted-foreground mt-2">Quét để xem chi tiết</p>
                            </div>

                            {/* Info */}
                            <div className="flex-1 space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <Badge className={`${getTypeColor(itemType)} mb-2`}>
                                            {getTypeIcon(itemType)}
                                            <span className="ml-1">{getTypeLabel(itemType)}</span>
                                        </Badge>
                                        <h2 className="text-2xl font-bold">{item.name}</h2>
                                        {item.description && (
                                            <p className="text-muted-foreground mt-1">{item.description}</p>
                                        )}
                                    </div>
                                </div>

                                <hr className="border-t" />

                                {/* Price */}
                                <div className="flex items-center gap-2">
                                    <DollarSign className="h-5 w-5 text-emerald-600" />
                                    <span className="text-2xl font-bold text-emerald-600">
                                        {formatCurrency(item.price)}
                                    </span>
                                </div>

                                {/* Additional Info */}
                                <div className="grid grid-cols-2 gap-4">
                                    {'stock' in item && item.stock !== undefined && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <Package className="h-4 w-4 text-muted-foreground" />
                                            <span>Tồn kho: <strong>{item.stock}</strong></span>
                                        </div>
                                    )}
                                    {'category' in item && item.category && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <Star className="h-4 w-4 text-muted-foreground" />
                                            <span>Danh mục: <strong>{item.category}</strong></span>
                                        </div>
                                    )}
                                    {'duration' in item && item.duration && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <Clock className="h-4 w-4 text-muted-foreground" />
                                            <span>Thời gian: <strong>{item.duration} phút</strong></span>
                                        </div>
                                    )}
                                    {'department' in item && item.department && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <Wrench className="h-4 w-4 text-muted-foreground" />
                                            <span>Bộ phận: <strong>{item.department}</strong></span>
                                        </div>
                                    )}
                                </div>

                                {/* Status */}
                                {item.status && (
                                    <Badge variant={item.status === 'active' ? 'success' : 'secondary'}>
                                        {item.status === 'active' ? 'Đang hoạt động' : item.status}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Package Services */}
                {'items' in item && item.items && item.items.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Gift className="h-5 w-5 text-purple-600" />
                                Dịch vụ trong gói ({item.items.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {item.items.map((svc, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                                        <Wrench className="h-4 w-4 text-purple-600" />
                                        <span className="font-medium">{svc.service_name}</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Action Buttons */}
                <Card>
                    <CardContent className="p-4">
                        <Button className="w-full gap-2" size="lg">
                            <ShoppingCart className="h-5 w-5" />
                            Thêm vào đơn hàng
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
