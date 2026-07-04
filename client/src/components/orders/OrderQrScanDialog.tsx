import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, type CameraDevice } from 'html5-qrcode';
import { AlertCircle, Camera, CameraOff, QrCode } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseScannedCode } from '@/lib/parseQrCode';

const SCANNER_ELEMENT_ID = 'orders-qr-scanner';

type FocusModeConstraint = MediaTrackConstraintSet & {
    focusMode?: 'continuous';
};

const CONTINUOUS_FOCUS_CONSTRAINT: FocusModeConstraint = { focusMode: 'continuous' };

const SCANNER_CONFIG = {
    verbose: false,
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    experimentalFeatures: {
        useBarCodeDetectorIfSupported: true,
    },
};

async function pickCameraId(): Promise<string | { facingMode: string }> {
    try {
        const cameras: CameraDevice[] = await Html5Qrcode.getCameras();
        if (cameras.length === 0) {
            return { facingMode: 'user' };
        }
        const back = cameras.find((c) => /back|rear|environment|sau/i.test(c.label));
        if (back) return back.id;
        if (cameras.length === 1) return cameras[0].id;
        return cameras[cameras.length - 1].id;
    } catch {
        return { facingMode: 'environment' };
    }
}

interface OrderQrScanDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onScan: (code: string) => void;
}

export function OrderQrScanDialog({ open, onOpenChange, onScan }: OrderQrScanDialogProps) {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const handledRef = useRef(false);
    const [isScanning, setIsScanning] = useState(false);
    const [hasCamera, setHasCamera] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [manualCode, setManualCode] = useState('');

    const stopScanner = useCallback(async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.stop();
            } catch {
                // ignore
            }
            try {
                scannerRef.current.clear();
            } catch {
                // ignore
            }
            scannerRef.current = null;
        }
        setIsScanning(false);
    }, []);

    const handleDecoded = useCallback(
        (decodedText: string) => {
            if (handledRef.current) return;
            const code = parseScannedCode(decodedText);
            if (!code) return;
            handledRef.current = true;
            void stopScanner();
            onScan(code);
            onOpenChange(false);
        },
        [onScan, onOpenChange, stopScanner],
    );

    const startScanner = useCallback(async () => {
        if (scannerRef.current) return;

        const el = document.getElementById(SCANNER_ELEMENT_ID);
        if (!el) {
            setError('Không tải được vùng quét. Thử đóng và mở lại.');
            return;
        }

        try {
            if (!window.isSecureContext) {
                setHasCamera(false);
                setError('Trình duyệt chặn camera vì kết nối không an toàn. Vui lòng dùng HTTPS.');
                return;
            }
            if (!navigator.mediaDevices?.getUserMedia) {
                setHasCamera(false);
                setError('Trình duyệt hiện tại không hỗ trợ camera.');
                return;
            }
            setError(null);
            handledRef.current = false;
            const cameraConfig = await pickCameraId();
            const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, SCANNER_CONFIG);
            scannerRef.current = scanner;

            await scanner.start(
                cameraConfig,
                {
                    fps: 30,
                    qrbox: (viewfinderWidth, viewfinderHeight) => {
                        const edge = Math.min(viewfinderWidth, viewfinderHeight);
                        const size = Math.max(120, Math.min(280, Math.floor(edge * 0.72)));
                        return { width: size, height: size };
                    },
                    aspectRatio: 1,
                    disableFlip: false,
                    videoConstraints: {
                        facingMode: 'environment',
                        advanced: [CONTINUOUS_FOCUS_CONSTRAINT],
                    },
                },
                (text) => handleDecoded(text),
                () => {},
            );
            setIsScanning(true);
        } catch (err) {
            setIsScanning(false);
            scannerRef.current = null;
            const message = err instanceof Error ? err.message : 'Không thể bật camera';
            if (/notallowed|permission|denied|notreadable|notfound/i.test(message)) {
                setHasCamera(false);
                setError('Không thể bật camera. Hãy cấp quyền camera cho trình duyệt rồi thử lại.');
                return;
            }
            if (/environment|not found|overconstrained/i.test(message)) {
                try {
                    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, SCANNER_CONFIG);
                    scannerRef.current = scanner;
                    await scanner.start(
                        { facingMode: 'user' },
                        {
                            fps: 24,
                            qrbox: { width: 220, height: 220 },
                            disableFlip: false,
                            videoConstraints: {
                                facingMode: 'user',
                                advanced: [CONTINUOUS_FOCUS_CONSTRAINT],
                            },
                        },
                        (text) => handleDecoded(text),
                        () => {},
                    );
                    setIsScanning(true);
                    setError(null);
                    return;
                } catch {
                    // fall through
                }
            }
            setError(message);
        }
    }, [handleDecoded]);

    useEffect(() => {
        if (!open) {
            handledRef.current = false;
            void stopScanner();
            setError(null);
            setManualCode('');
            return;
        }
        setHasCamera(true);
        setError(null);
        return () => {
            void stopScanner();
        };
    }, [open, stopScanner]);

    const submitManual = () => {
        const code = parseScannedCode(manualCode);
        if (!code) return;
        onScan(code);
        onOpenChange(false);
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) void stopScanner();
                onOpenChange(next);
            }}
        >
            <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
                <DialogHeader className="px-4 pt-4 pb-2">
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <QrCode className="h-5 w-5" />
                        Quét mã đơn hàng
                    </DialogTitle>
                    <DialogDescription>
                        Đưa mã QR vào khung xanh. Hỗ trợ mã đơn, mã HĐ (/task/…)
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 px-4 pb-4">
                    <div className="relative aspect-square w-full min-h-[260px] overflow-hidden rounded-xl bg-black">
                        <div id={SCANNER_ELEMENT_ID} className="h-full w-full [&_video]:object-cover" />

                        {!isScanning && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/90 p-4 text-center">
                                {hasCamera ? (
                                    <Camera className="h-10 w-10 text-muted-foreground" />
                                ) : (
                                    <CameraOff className="h-10 w-10 text-muted-foreground" />
                                )}
                                <p className="text-xs text-muted-foreground">
                                    {hasCamera ? 'Nhấn "Bật camera" để bắt đầu quét' : 'Dùng ô nhập mã bên dưới'}
                                </p>
                            </div>
                        )}

                        {isScanning && (
                            <div className="pointer-events-none absolute inset-0">
                                <div className="absolute left-1/2 top-1/2 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2">
                                    <div className="absolute left-0 top-0 h-7 w-7 rounded-tl-lg border-l-4 border-t-4 border-emerald-400" />
                                    <div className="absolute right-0 top-0 h-7 w-7 rounded-tr-lg border-r-4 border-t-4 border-emerald-400" />
                                    <div className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-lg border-b-4 border-l-4 border-emerald-400" />
                                    <div className="absolute bottom-0 right-0 h-7 w-7 rounded-br-lg border-b-4 border-r-4 border-emerald-400" />
                                </div>
                            </div>
                        )}
                    </div>

                    {error && (
                        <p className="flex items-start gap-1.5 text-xs text-red-600">
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {error}
                        </p>
                    )}

                    <div className="flex gap-2">
                        {isScanning ? (
                            <Button variant="outline" className="flex-1" onClick={() => void stopScanner()}>
                                Dừng camera
                            </Button>
                        ) : (
                            <Button
                                className="flex-1"
                                onClick={() => void startScanner()}
                            >
                                <Camera className="mr-2 h-4 w-4" />
                                Bật lại camera
                            </Button>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <Input
                            placeholder="Mã đơn, mã HĐ..."
                            value={manualCode}
                            onChange={(e) => setManualCode(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && submitManual()}
                            className="h-9"
                        />
                        <Button variant="secondary" onClick={submitManual} disabled={!manualCode.trim()}>
                            Tìm
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
