/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL: string;
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_PAYMENT_BANK_BIN?: string;
    readonly VITE_PAYMENT_BANK_NAME?: string;
    readonly VITE_PAYMENT_ACCOUNT_NUMBER?: string;
    readonly VITE_PAYMENT_ACCOUNT_NAME?: string;
    readonly VITE_COMPANY_NAME?: string;
    readonly VITE_COMPANY_ADDRESS?: string;
    readonly VITE_COMPANY_PHONE?: string;
    readonly VITE_INVOICE_COPY_LABEL?: string;
    readonly VITE_COMPANY_LOGO_URL?: string;
    readonly VITE_INVOICE_TERMS_LINE?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
