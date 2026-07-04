import { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, X, QrCode } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency } from '@/lib/utils';
import type { Order, OrderItem } from '@/hooks/useOrders';

interface PrintQRDialogProps {
    order: Order | null;
    open: boolean;
    onClose: () => void;
}

type OrderItemWithCode = OrderItem & { item_code: string };

const getItemTypeLabel = (type: string) => {
    switch (type) {
        case 'product': return 'Sản phẩm';
        case 'service': return 'Dịch vụ';
        case 'package': return 'Gói dịch vụ';
        case 'voucher': return 'Voucher';
        default: return type;
    }
};

const getItemTypeColor = (type: string) => {
    switch (type) {
        case 'product': return 'bg-blue-100 text-blue-700';
        case 'service': return 'bg-purple-100 text-purple-700';
        case 'package': return 'bg-emerald-100 text-emerald-700';
        case 'voucher': return 'bg-amber-100 text-amber-700';
        default: return 'bg-gray-100 text-gray-700';
    }
};

export function PrintQRDialog({ order, open, onClose }: PrintQRDialogProps) {
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const printRef = useRef<HTMLDivElement>(null);

    if (!order) return null;

    const items = order.items || [];
    const productQRItems = items.filter((item: OrderItem) => item.item_type === 'product');
    const hasItemCodes = productQRItems.some((item: OrderItem) => item.item_code);

    const toggleItem = (itemId: string) => {
        setSelectedItems(prev =>
            prev.includes(itemId)
                ? prev.filter(id => id !== itemId)
                : [...prev, itemId]
        );
    };

    const toggleAll = () => {
        if (selectedItems.length === productQRItems.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(productQRItems.map((item: OrderItem) => item.id));
        }
    };

    const handlePrint = () => {
        const itemsToPrint = selectedItems.length > 0
            ? productQRItems.filter((item: OrderItem) => selectedItems.includes(item.id))
            : productQRItems;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const qrCodes = itemsToPrint.map((item: OrderItem) => {
            return `
                <div class="qr-item">
                    <div class="qr-header">
                        <span class="order-code">${order.order_code}</span>
                        <span class="item-type ${item.item_type}">${getItemTypeLabel(item.item_type)}</span>
                    </div>
                    <div class="qr-content">
                        ${item.item_code ? `
                            <div class="qr-code" id="qr-${item.id}"></div>
                        ` : `
                            <div class="no-qr">Chưa có mã QR</div>
                        `}
                        <div class="item-info">
                            <p class="item-name">${item.item_name}</p>
                            <p class="item-details">SL: ${item.quantity} × ${formatCurrency(item.unit_price)}</p>
                            <p class="item-total">${formatCurrency(item.total_price)}</p>
                            ${item.item_code ? `<p class="item-code">${item.item_code}</p>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const qrScripts = itemsToPrint
            .filter((item: OrderItem): item is OrderItemWithCode => Boolean(item.item_code))
            .map((item: OrderItemWithCode) => {
                const qrCodeValue = encodeURIComponent(order.order_code);
                return `new QRCode(document.getElementById("qr-${item.id}"), { text: decodeURIComponent("${qrCodeValue}"), width: 120, height: 120, correctLevel: QRCode.CorrectLevel.M });`;
            }).join('\n');

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>In mã QR - ${order.order_code}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: system-ui, -apple-system, sans-serif;
                        padding: 20px;
                        background: #f5f5f5;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 20px;
                        padding-bottom: 15px;
                        border-bottom: 2px solid #ddd;
                    }
                    .header h1 { font-size: 24px; margin-bottom: 5px; }
                    .header p { color: #666; font-size: 14px; }
                    .customer-info {
                        background: #fff;
                        padding: 15px;
                        border-radius: 8px;
                        margin-bottom: 20px;
                        border: 1px solid #ddd;
                    }
                    .customer-info p { margin: 5px 0; }
                    .qr-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                        gap: 15px;
                    }
                    .qr-item {
                        background: #fff;
                        border: 1px solid #ddd;
                        border-radius: 8px;
                        overflow: hidden;
                        page-break-inside: avoid;
                    }
                    .qr-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 10px 15px;
                        background: #f8f8f8;
                        border-bottom: 1px solid #ddd;
                    }
                    .order-code {
                        font-weight: 600;
                        font-size: 12px;
                        color: #666;
                    }
                    .item-type {
                        font-size: 11px;
                        padding: 3px 8px;
                        border-radius: 12px;
                        font-weight: 500;
                    }
                    .item-type.product { background: #dbeafe; color: #1d4ed8; }
                    .item-type.service { background: #ede9fe; color: #7c3aed; }
                    .item-type.package { background: #d1fae5; color: #059669; }
                    .item-type.voucher { background: #fef3c7; color: #d97706; }
                    .qr-content {
                        display: flex;
                        padding: 15px;
                        gap: 15px;
                        align-items: center;
                    }
                    .qr-code {
                        flex-shrink: 0;
                        padding: 8px;
                        background: #fff;
                        border: 1px solid #eee;
                        border-radius: 8px;
                    }
                    .no-qr {
                        width: 120px;
                        height: 120px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: #f5f5f5;
                        border-radius: 8px;
                        color: #999;
                        font-size: 12px;
                        text-align: center;
                    }
                    .item-info { flex: 1; }
                    .item-name {
                        font-weight: 600;
                        font-size: 14px;
                        margin-bottom: 5px;
                    }
                    .item-details {
                        color: #666;
                        font-size: 13px;
                        margin-bottom: 3px;
                    }
                    .item-total {
                        font-weight: 700;
                        font-size: 15px;
                        color: #059669;
                        margin-bottom: 5px;
                    }
                    .item-code {
                        font-family: monospace;
                        font-size: 11px;
                        color: #888;
                        background: #f0f0f0;
                        padding: 3px 8px;
                        border-radius: 4px;
                        display: inline-block;
                    }
                    @media print {
                        body { background: #fff; padding: 10px; }
                        .qr-item { break-inside: avoid; }
                        .header { border-bottom-color: #000; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Đơn hàng ${order.order_code}</h1>
                    <p>Ngày in: ${new Date().toLocaleString('vi-VN')}</p>
                </div>
                
                <div class="customer-info">
                    <p><strong>Khách hàng:</strong> ${order.customer?.name || 'N/A'}</p>
                    <p><strong>SĐT:</strong> ${order.customer?.phone || 'N/A'}</p>
                    <p><strong>Tổng tiền:</strong> ${formatCurrency(order.total_amount)}</p>
                </div>

                <div class="qr-grid">
                    ${qrCodes}
                </div>

                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                <script>
                    try {
                        ${qrScripts}
                        setTimeout(() => window.print(), 800);
                    } catch(e) {
                        console.error('QR generation error:', e);
                        setTimeout(() => window.print(), 300);
                    }
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent
                className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
                style={{ zIndex: 9999 }}
                onInteractOutside={(e) => e.preventDefault()}
                onPointerDownOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <QrCode className="h-5 w-5 text-primary" />
                        In phiếu QR - {order.order_code}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto">
                    {/* Customer Info */}
                    <div className="p-3 bg-muted/50 rounded-lg mb-4">
                        <p className="font-semibold">{order.customer?.name || 'N/A'}</p>
                        <p className="text-sm text-muted-foreground">{order.customer?.phone || 'Không có SĐT'}</p>
                    </div>

                    {/* Select All */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                checked={selectedItems.length === productQRItems.length && productQRItems.length > 0}
                                onCheckedChange={toggleAll}
                            />
                            <span className="text-sm font-medium">
                                Chọn tất cả ({productQRItems.length} sản phẩm)
                            </span>
                        </div>
                        {selectedItems.length > 0 && (
                            <Badge variant="info">{selectedItems.length} đã chọn</Badge>
                        )}
                    </div>

                    {/* Items List with QR Codes */}
                    <div className="space-y-3" ref={printRef}>
                        {productQRItems.map((item: OrderItem, index: number) => {
                            const qrValue = item.item_code ? order.order_code : null;
                            const isSelected = selectedItems.includes(item.id);

                            return (
                                <div
                                    key={item.id || index}
                                    className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
                                        }`}
                                >
                                    <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => toggleItem(item.id)}
                                    />

                                    {/* QR Code */}
                                    <div className="flex-shrink-0">
                                        {qrValue ? (
                                            <div className="p-1 bg-white border rounded">
                                                <QRCodeSVG value={qrValue} size={70} level="M" />
                                            </div>
                                        ) : (
                                            <div className="w-[70px] h-[70px] bg-muted rounded flex items-center justify-center">
                                                <span className="text-xs text-muted-foreground text-center">
                                                    Chưa có<br />mã QR
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Item Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge className={getItemTypeColor(item.item_type)} variant="secondary">
                                                {getItemTypeLabel(item.item_type)}
                                            </Badge>
                                            {item.item_code && (
                                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                                    {item.item_code}
                                                </code>
                                            )}
                                        </div>
                                        <p className="font-medium truncate">{item.item_name}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {item.quantity} × {formatCurrency(item.unit_price)}
                                        </p>
                                    </div>

                                    {/* Price */}
                                    <div className="text-right">
                                        <p className="font-bold text-primary">
                                            {formatCurrency(item.total_price)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {!hasItemCodes && (
                        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
                            <p className="text-yellow-800 font-medium">⚠️ Đơn hàng này chưa có mã QR</p>
                            <p className="text-sm text-yellow-600 mt-1">
                                Mã QR sẽ được tạo tự động cho các đơn hàng mới sau khi chạy migration.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex gap-2 pt-4 border-t">
                    <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                        <X className="h-4 w-4 mr-2" />
                        Đóng
                    </Button>
                    <Button
                        type="button"
                        className="flex-1 bg-primary"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handlePrint();
                        }}
                    >
                        <Printer className="h-4 w-4 mr-2" />
                        {selectedItems.length > 0
                            ? `In ${selectedItems.length} mã QR`
                            : 'In tất cả mã QR'
                        }
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
