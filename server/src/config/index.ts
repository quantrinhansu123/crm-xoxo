import dotenv from 'dotenv';
import path from 'path';

// Load server/.env regardless of ESM/CJS emit (CI builds CommonJS via NodeNext).
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/** Build public CRM links for webhook payloads from the deployed frontend URL. */
export function buildFrontendUrl(route: string): string | null {
    const baseUrl = process.env.FRONTEND_URL
        || process.env.CRM_WEB_URL
        || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');

    if (!baseUrl) return null;
    return `${baseUrl.replace(/\/$/, '')}/${route.replace(/^\//, '')}`;
}

export const config = {
    port: parseInt(process.env.PORT || '3005', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    supabase: {
        url: process.env.SUPABASE_URL || '',
        anonKey: process.env.SUPABASE_ANON_KEY || '',
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },

    jwt: {
        secret: process.env.JWT_SECRET || 'your-secret-key',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },

    cors: {
        origin: process.env.CORS_ORIGIN
            ? process.env.CORS_ORIGIN.split(',')
            : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'],
    },
};

export default config;
