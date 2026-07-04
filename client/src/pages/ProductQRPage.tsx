import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Package,
    Wrench,
    User,
    Phone,
    CheckCircle2,
    PlayCircle,
    Clock,
    AlertCircle,
    Loader2,
    QrCode,
    Image as ImageIcon,
    Tag,
    Palette,
    Layers,
    FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { orderProductsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface OrderProduct {
    id: string;
    product_code: string;
    name: string;
    type?: string;
    brand?: string;
    color?: string;
    size?: string;
    material?: string;
    condition_before?: string;
    images?: string[];
    status: string;
    warranty_code?: string | null;
    care_warranty_flow?: string | null;
    care_warranty_stage?: string | null;
    order?: {
        id: string;
        order_code: string;
        customer?: {
            name: string;
            phone: string;
        };
    };
    services?: Array<{
        id: string;
        item_name: string;
        item_type: string;
        unit_price: number;
        status: string;
        technician?: {
            id: string;
            name: string;
            avatar?: string;
        };
    }>;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: 'Chờ xử lý', color: 'bg-gray-100 text-gray-800', icon: <Clock className="h-4 w-4" /> },
    processing: { label: 'Đang xử lý', color: 'bg-blue-100 text-blue-800', icon: <PlayCircle className="h-4 w-4" /> },
    completed: { label: 'Hoàn thành', color: 'bg-green-100 text-green-800', icon: <CheckCircle2 className="h-4 w-4" /> },
    delivered: { label: 'Đã giao', color: 'bg-purple-100 text-purple-800', icon: <Package className="h-4 w-4" /> },
    cancelled: { label: 'Đã hủy', color: 'bg-red-100 text-red-800', icon: <AlertCircle className="h-4 w-4" /> },
};

const serviceStatusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'Chờ', color: 'bg-gray-100 text-gray-700' },
    assigned: { label: 'Đã phân công', color: 'bg-yellow-100 text-yellow-700' },
    in_progress: { label: 'Đang làm', color: 'bg-blue-100 text-blue-700' },
    completed: { label: 'Xong', color: 'bg-green-100 text-green-700' },
    cancelled: { label: 'Hủy', color: 'bg-red-100 text-red-700' },
};

export function ProductQRPage() {
    const { code } = useParams<{ code: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [product, setProduct] = useState<OrderProduct | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        if (code) {
            fetchProduct();
        }
    }, [code]);

    const fetchProduct = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await orderProductsApi.getByCode(code!);
            setProduct(response.data.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Không tìm thấy sản phẩm');
        } finally {
            setLoading(false);
        }
    };

    const handleStartService = async (serviceId: string) => {
        setActionLoading(serviceId);
        try {
            await orderProductsApi.startService(serviceId);
            toast.success('Đã bắt đầu dịch vụ');
            fetchProduct(); // Refresh data
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
        } finally {
            setActionLoading(null);
        }
    };

    const handleCompleteService = async (serviceId: string) => {
        setActionLoading(serviceId);
        try {
            const response = await orderProductsApi.completeService(serviceId);
            toast.success('Đã hoàn thành dịch vụ');
            if (response.data.data?.allServicesCompleted) {
                toast.success('Tất cả dịch vụ đã hoàn thành!');
            }
            fetchProduct(); // Refresh data
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
        } finally {
            setActionLoading(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
                <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                    <p className="text-muted-foreground">Đang tải thông tin sản phẩm...</p>
                </div>
            </div>
        );
    }

    if (error || !product) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="p-6 text-center">
                        <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold mb-2">Không tìm thấy</h2>
                        <p className="text-muted-foreground mb-4">{error || 'Mã QR không hợp lệ'}</p>
                        <div className="flex gap-2">
                            <Button onClick={() => navigate('/scan')} className="flex-1 gap-2">
                                <QrCode className="h-4 w-4" />
                                Quét lại
                            </Button>
                            <Button variant="outline" onClick={() => navigate(-1)} className="flex-1 gap-2">
                                <ArrowLeft className="h-4 w-4" />
                                Quay lại
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const status = statusConfig[product.status] || statusConfig.pending;
    const completedServices = product.services?.filter(s => s.status === 'completed').length || 0;
    const totalServices = product.services?.length || 0;

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
            {/* Header with Product Image */}
            <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 p-6 pb-16">
                <div className="max-w-lg mx-auto">
                    <div className="flex items-center justify-between mb-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(-1)}
                            className="text-white hover:bg-white/20"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <Badge className={`${status.color} gap-1`}>
                            {status.icon}
                            {status.label}
                        </Badge>
                    </div>

                    <div className="text-center text-white">
                        <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
                            {product.images && product.images.length > 0 ? (
                                <img
                                    src={product.images[0]}
                                    alt={product.name}
                                    className="w-full h-full object-cover rounded-2xl"
                                />
                            ) : (
                                <Package className="h-10 w-10 text-white" />
                            )}
                        </div>
                        <h1 className="text-xl font-bold mb-1">{product.name}</h1>
                        <p className="text-white/70 text-sm font-mono">{product.product_code}</p>
                    </div>
                </div>
            </div>

            <div className="p-4 -mt-8">
                <div className="max-w-lg mx-auto space-y-4">
                    {/* Product Details Card */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Tag className="h-4 w-4" />
                                Thông tin sản phẩm
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                {product.type && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Layers className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">Loại:</span>
                                        <span className="font-medium">{product.type}</span>
                                    </div>
                                )}
                                {product.brand && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Tag className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">Hãng:</span>
                                        <span className="font-medium">{product.brand}</span>
                                    </div>
                                )}
                                {product.color && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Palette className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">Màu:</span>
                                        <span className="font-medium">{product.color}</span>
                                    </div>
                                )}
                                {product.size && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Package className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">Size:</span>
                                        <span className="font-medium">{product.size}</span>
                                    </div>
                                )}
                            </div>
                            {product.condition_before && (
                                <div className="pt-2 border-t">
                                    <div className="flex items-start gap-2 text-sm">
                                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                                        <div>
                                            <span className="text-muted-foreground">Tình trạng ban đầu:</span>
                                            <p className="font-medium">{product.condition_before}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Order & Customer Info */}
                    {product.order && (
                        <Card>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 rounded-lg bg-blue-100">
                                        <Package className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Đơn hàng</p>
                                        <p className="font-semibold">{product.order.order_code}</p>
                                    </div>
                                </div>
                                {product.order.customer && (
                                    <div className="flex items-center gap-3 pt-3 border-t">
                                        <Avatar className="h-10 w-10">
                                            <AvatarFallback>{product.order.customer.name?.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <p className="font-medium">{product.order.customer.name}</p>
                                            {product.order.customer.phone && (
                                                <a href={`tel:${product.order.customer.phone}`} className="text-sm text-primary flex items-center gap-1">
                                                    <Phone className="h-3 w-3" />
                                                    {product.order.customer.phone}
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Services List */}
                    <Card>
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <Wrench className="h-4 w-4" />
                                    Dịch vụ cần thực hiện
                                </CardTitle>
                                <Badge variant="outline">
                                    {completedServices}/{totalServices}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {product.services && product.services.length > 0 ? (
                                product.services.map((service) => {
                                    const serviceStatus = serviceStatusConfig[service.status] || serviceStatusConfig.pending;
                                    const isAssignedToMe = service.technician?.id === user?.id;
                                    const canStart = service.status === 'assigned' && isAssignedToMe;
                                    const canComplete = service.status === 'in_progress' && isAssignedToMe;

                                    return (
                                        <div
                                            key={service.id}
                                            className="p-3 border rounded-lg bg-muted/30"
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex-1">
                                                    <p className="font-medium">{service.item_name}</p>
                                                    <p className="text-sm text-emerald-600 font-semibold">
                                                        {formatCurrency(service.unit_price)}
                                                    </p>
                                                </div>
                                                <Badge className={serviceStatus.color}>
                                                    {serviceStatus.label}
                                                </Badge>
                                            </div>

                                            {service.technician && (
                                                <div className="flex items-center gap-2 text-sm mb-2">
                                                    <Avatar className="h-6 w-6">
                                                        <AvatarImage src={service.technician.avatar} />
                                                        <AvatarFallback>{service.technician.name?.charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                    <span className="text-muted-foreground">{service.technician.name}</span>
                                                    {isAssignedToMe && (
                                                        <Badge className="bg-green-100 text-green-700 text-xs">Bạn</Badge>
                                                    )}
                                                </div>
                                            )}

                                            {/* Action buttons */}
                                            {(canStart || canComplete) && (
                                                <div className="mt-2 pt-2 border-t">
                                                    {canStart && (
                                                        <Button
                                                            size="sm"
                                                            className="w-full gap-2"
                                                            onClick={() => handleStartService(service.id)}
                                                            disabled={actionLoading === service.id}
                                                        >
                                                            {actionLoading === service.id ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <PlayCircle className="h-4 w-4" />
                                                            )}
                                                            Bắt đầu
                                                        </Button>
                                                    )}
                                                    {canComplete && (
                                                        <Button
                                                            size="sm"
                                                            className="w-full gap-2 bg-green-600 hover:bg-green-700"
                                                            onClick={() => handleCompleteService(service.id)}
                                                            disabled={actionLoading === service.id}
                                                        >
                                                            {actionLoading === service.id ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <CheckCircle2 className="h-4 w-4" />
                                                            )}
                                                            Hoàn thành
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="text-center text-muted-foreground py-4">
                                    Chưa có dịch vụ nào
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Progress Bar */}
                    {totalServices > 0 && (
                        <Card>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium">Tiến độ</span>
                                    <span className="text-sm text-muted-foreground">
                                        {Math.round((completedServices / totalServices) * 100)}%
                                    </span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-green-400 to-green-500 transition-all duration-500"
                                        style={{ width: `${(completedServices / totalServices) * 100}%` }}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Scan another QR */}
                    <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => navigate('/scan')}
                    >
                        <QrCode className="h-4 w-4" />
                        Quét mã QR khác
                    </Button>
                </div>
            </div>
        </div>
    );
}
