/** Cấu hình tài khoản nhận thanh toán (VietQR) — đặt trong client/.env */
export interface PaymentConfig {
    bankBin: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
    companyName: string;
    companyAddress: string;
    companyPhone: string;
    invoiceCopyLabel: string;
    companyLogoUrl: string;
    termsAgreementLine: string;
}

function env(key: keyof ImportMetaEnv): string {
    const raw = import.meta.env[key];
    if (raw == null || raw === '') return '';
    return String(raw).trim();
}

export function getPaymentConfig(): PaymentConfig {
    return {
        bankBin: env('VITE_PAYMENT_BANK_BIN') || '970422',
        bankName: env('VITE_PAYMENT_BANK_NAME') || 'MB Bank',
        accountNumber: env('VITE_PAYMENT_ACCOUNT_NUMBER'),
        accountName: env('VITE_PAYMENT_ACCOUNT_NAME') || 'CONG TY TNHH',
        companyName: env('VITE_COMPANY_NAME') || 'XOXO Luxury Authentic',
        companyAddress: env('VITE_COMPANY_ADDRESS') || '1H Sơn Tây, Ba Đình, Hà Nội',
        companyPhone: env('VITE_COMPANY_PHONE') || '0963378537',
        invoiceCopyLabel: env('VITE_INVOICE_COPY_LABEL') || 'Liên 1',
        companyLogoUrl: env('VITE_COMPANY_LOGO_URL') || '/logo-xoxo.png',
        termsAgreementLine:
            env('VITE_INVOICE_TERMS_LINE') ||
            'Tôi đã đồng ý với tất cả các điều khoản trong quy định của XoXo',
    };
}

export function isPaymentConfigured(): boolean {
    const c = getPaymentConfig();
    return Boolean(c.accountNumber && c.bankBin);
}
