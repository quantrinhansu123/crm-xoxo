import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import {
    QrCode,
    Camera,
    CameraOff,
    ArrowLeft,
    Loader2,
    AlertCircle,
    CheckCircle2,
    Flashlight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function QRScannerPage() {
    const navigate = useNavigate();
    const [isScanning, setIsScanning] = useState(false);
    const [hasCamera, setHasCamera] = useState(true);
    const [scannedCode, setScannedCode] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Check camera permission
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(() => setHasCamera(true))
            .catch(() => {
                setHasCamera(false);
                setError('Không thể truy cập camera. Vui lòng cấp quyền camera.');
            });

        return () => {
            stopScanner();
        };
    }, []);

    const startScanner = async () => {
        if (!containerRef.current) return;

        try {
            setError(null);
            setIsScanning(true);

            const scanner = new Html5Qrcode('qr-reader');
            scannerRef.current = scanner;

            await scanner.start(
                { facingMode: 'environment' },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                },
                (decodedText) => {
                    // Success callback
                    handleScanSuccess(decodedText);
                },
                () => {
                    // Error callback (ignore - just means no QR found in frame)
                }
            );
        } catch (err: any) {
            setIsScanning(false);
            setError(err.message || 'Không thể khởi động camera');
            console.error('Scanner error:', err);
        }
    };

    const stopScanner = async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.stop();
                scannerRef.current.clear();
            } catch (err) {
                console.error('Error stopping scanner:', err);
            }
            scannerRef.current = null;
        }
        setIsScanning(false);
    };

    const handleScanSuccess = (decodedText: string) => {
        // Stop scanner
        stopScanner();
        
        // Loại bỏ BOM (\uFEFF), ký tự thay thế (\uFFFD), ký tự NUL và các ký tự điều khiển non-printable
        const cleanText = decodedText.replace(/[\uFEFF\uFFFD\x00-\x1F\x7F-\x9F]/g, '').trim();
        setScannedCode(cleanText);

        // Extract the code from URL if it's a full URL
        let code = cleanText;
        if (cleanText.includes('/task/')) {
            const parts = cleanText.split('/task/');
            code = parts[parts.length - 1];
        }

        try {
            code = decodeURIComponent(code);
        } catch {
            // ignore
        }

        toast.success('Đã quét mã QR thành công!');

        // Navigate to task page after a short delay
        setTimeout(() => {
            navigate(`/task/${code}`);
        }, 500);
    };

    const handleManualInput = () => {
        const code = prompt('Nhập mã QR thủ công:');
        if (code && code.trim()) {
            navigate(`/task/${code.trim()}`);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-4">
            <div className="max-w-lg mx-auto space-y-4">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-xl font-bold">Quét mã QR</h1>
                        <p className="text-sm text-muted-foreground">
                            Quét mã QR trên phiếu dịch vụ
                        </p>
                    </div>
                </div>

                {/* Scanner Card */}
                <Card className="overflow-hidden">
                    <CardContent className="p-0">
                        {/* QR Reader Container */}
                        <div
                            ref={containerRef}
                            className="relative bg-black aspect-square"
                        >
                            <div id="qr-reader" className="w-full h-full" />

                            {!isScanning && !scannedCode && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 text-white">
                                    <div className="p-4 rounded-full bg-white/10 mb-4">
                                        <QrCode className="h-16 w-16" />
                                    </div>
                                    <p className="text-lg font-medium mb-2">
                                        Sẵn sàng quét
                                    </p>
                                    <p className="text-sm text-white/70 text-center px-8">
                                        Bấm nút bên dưới để bật camera và quét mã QR
                                    </p>
                                </div>
                            )}

                            {scannedCode && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-600 text-white">
                                    <CheckCircle2 className="h-16 w-16 mb-4" />
                                    <p className="text-lg font-bold mb-2">Đã quét thành công!</p>
                                    <p className="text-sm text-white/80">Đang chuyển hướng...</p>
                                    <Loader2 className="h-6 w-6 animate-spin mt-4" />
                                </div>
                            )}

                            {/* Scanning overlay */}
                            {isScanning && (
                                <div className="absolute inset-0 pointer-events-none">
                                    {/* Corner markers */}
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[260px] h-[260px]">
                                        <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-green-400 rounded-tl-lg" />
                                        <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-green-400 rounded-tr-lg" />
                                        <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-green-400 rounded-bl-lg" />
                                        <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-green-400 rounded-br-lg" />

                                        {/* Scanning line */}
                                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent animate-pulse"
                                            style={{ animation: 'scan 2s ease-in-out infinite' }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Error message */}
                {error && (
                    <Card className="border-red-200 bg-red-50">
                        <CardContent className="p-4 flex items-center gap-3">
                            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                            <p className="text-sm text-red-700">{error}</p>
                        </CardContent>
                    </Card>
                )}

                {/* Action Buttons */}
                <div className="space-y-3">
                    {!isScanning ? (
                        <Button
                            className="w-full h-14 text-lg gap-3 bg-primary"
                            onClick={startScanner}
                            disabled={!hasCamera}
                        >
                            <Camera className="h-6 w-6" />
                            Bật Camera & Quét
                        </Button>
                    ) : (
                        <Button
                            variant="destructive"
                            className="w-full h-14 text-lg gap-3"
                            onClick={stopScanner}
                        >
                            <CameraOff className="h-6 w-6" />
                            Tắt Camera
                        </Button>
                    )}

                    <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={handleManualInput}
                    >
                        <QrCode className="h-4 w-4" />
                        Nhập mã thủ công
                    </Button>
                </div>

                {/* Instructions */}
                <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="p-4">
                        <h4 className="font-semibold text-blue-800 mb-2">Hướng dẫn</h4>
                        <ul className="text-sm text-blue-700 space-y-1">
                            <li>1. Bấm "Bật Camera & Quét"</li>
                            <li>2. Đưa mã QR vào khung quét</li>
                            <li>3. Chờ hệ thống nhận diện tự động</li>
                            <li>4. Sau khi quét xong sẽ chuyển đến trang thực hiện</li>
                        </ul>
                    </CardContent>
                </Card>
            </div>

            <style>{`
                @keyframes scan {
                    0%, 100% { top: 0; }
                    50% { top: calc(100% - 2px); }
                }
                #qr-reader video {
                    object-fit: cover !important;
                }
            `}</style>
        </div>
    );
}
