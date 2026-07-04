import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Printer } from 'lucide-react';

interface OrderItemQRProps {
    itemCode: string;
    itemName: string;
    orderCode: string;
    open: boolean;
    onClose: () => void;
}

export function OrderItemQRDialog({ itemCode, itemName, orderCode, open, onClose }: OrderItemQRProps) {
    // QR chỉ chứa mã item để thiết bị quét không nhận diện thành link localhost.
    const qrValue = itemCode;

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>QR Code - ${itemCode}</title>
                        <style>
                            body {
                                display: flex;
                                flex-direction: column;
                                align-items: center;
                                justify-content: center;
                                min-height: 100vh;
                                margin: 0;
                                font-family: system-ui, sans-serif;
                            }
                            .container {
                                text-align: center;
                                padding: 20px;
                            }
                            .qr-code {
                                margin: 20px 0;
                            }
                            .code {
                                font-family: monospace;
                                font-size: 16px;
                                background: #f0f0f0;
                                padding: 8px 16px;
                                border-radius: 4px;
                            }
                            .item-name {
                                font-size: 18px;
                                font-weight: bold;
                                margin: 10px 0;
                            }
                            .order-code {
                                color: #666;
                                font-size: 14px;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <p class="order-code">Đơn hàng: ${orderCode}</p>
                            <p class="item-name">${itemName}</p>
                            <div class="qr-code" id="qr"></div>
                            <p class="code">${itemCode}</p>
                        </div>
                        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                        <script>
                            new QRCode(document.getElementById("qr"), {
                                text: decodeURIComponent("${encodeURIComponent(itemCode)}"),
                                width: 200,
                                height: 200,
                            });
                            setTimeout(() => window.print(), 500);
                        </script>
                    </body>
                </html>
            `);
            printWindow.document.close();
        }
    };

    const handleDownload = () => {
        const svg = document.getElementById(`qr-${itemCode}`)?.querySelector('svg');
        if (svg) {
            const svgData = new XMLSerializer().serializeToString(svg);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx?.drawImage(img, 0, 0);
                const pngFile = canvas.toDataURL('image/png');

                const downloadLink = document.createElement('a');
                downloadLink.download = `QR-${itemCode}.png`;
                downloadLink.href = pngFile;
                downloadLink.click();
            };

            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-center">Mã QR Dịch vụ</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col items-center py-4 space-y-4">
                    <p className="text-sm text-muted-foreground">{orderCode}</p>
                    <p className="font-medium text-center">{itemName}</p>

                    <div id={`qr-${itemCode}`} className="p-4 bg-white rounded-lg border">
                        <QRCodeSVG
                            value={qrValue}
                            size={200}
                            level="H"
                            includeMargin
                        />
                    </div>

                    <code className="px-3 py-1 bg-muted rounded text-sm font-mono">
                        {itemCode}
                    </code>

                    <div className="flex gap-2 w-full">
                        <Button variant="outline" className="flex-1 gap-2" onClick={handleDownload}>
                            <Download className="h-4 w-4" />
                            Tải xuống
                        </Button>
                        <Button variant="outline" className="flex-1 gap-2" onClick={handlePrint}>
                            <Printer className="h-4 w-4" />
                            In
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// Simple QR code display for inline use
export function OrderItemQR({ itemCode, size = 80 }: { itemCode: string; size?: number }) {
    const qrValue = itemCode;

    return (
        <div className="inline-block p-1 bg-white rounded border">
            <QRCodeSVG
                value={qrValue}
                size={size}
                level="M"
            />
        </div>
    );
}
