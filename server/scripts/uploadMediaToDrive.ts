/**
 * Đẩy ảnh/video lên Google Drive
 *
 * Hỗ trợ 2 chế độ:
 *   1) local  — upload mọi file trong 1 thư mục local
 *   2) urls   — lấy URL media từ DB (Supabase) rồi tải + upload lên Drive
 *
 * ===== SETUP (làm 1 lần) =====
 * 1. Google Cloud Console → tạo project → bật "Google Drive API"
 * 2. IAM → Service Account → tạo key JSON → lưu thành:
 *      server/scripts/credentials/google-drive-sa.json
 * 3. Tạo folder trên Drive → Share cho email service account (Editor)
 * 4. Copy Folder ID từ URL:
 *      https://drive.google.com/drive/folders/<FOLDER_ID>
 * 5. Cài dependency:
 *      cd server && npm i googleapis
 *
 * ===== ENV (server/.env hoặc truyền CLI) =====
 *   GOOGLE_DRIVE_FOLDER_ID=...
 *   GOOGLE_APPLICATION_CREDENTIALS=./scripts/credentials/google-drive-sa.json
 *
 * ===== CHẠY =====
 *   # Upload thư mục local
 *   npx tsx scripts/uploadMediaToDrive.ts --mode local --dir "D:/media/aftersale"
 *
 *   # Lấy URL từ DB rồi đẩy lên Drive
 *   npx tsx scripts/uploadMediaToDrive.ts --mode urls --limit 200
 *
 *   # Dry-run (chỉ liệt kê, không upload)
 *   npx tsx scripts/uploadMediaToDrive.ts --mode local --dir "./tmp-media" --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEDIA_EXT = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic',
    '.mp4', '.webm', '.mov', '.m4v', '.ogg', '.avi', '.mkv',
]);

type Args = {
    mode: 'local' | 'urls';
    dir?: string;
    limit: number;
    dryRun: boolean;
    folderId: string;
    credentials: string;
};

function parseArgs(argv: string[]): Args {
    const get = (flag: string) => {
        const i = argv.indexOf(flag);
        return i >= 0 ? argv[i + 1] : undefined;
    };
    const mode = (get('--mode') || 'local') as 'local' | 'urls';
    const dir = get('--dir');
    const limit = Number(get('--limit') || 500);
    const dryRun = argv.includes('--dry-run');
    const folderId = get('--folder-id') || process.env.GOOGLE_DRIVE_FOLDER_ID || '';
    const credentials =
        get('--credentials') ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        path.join(__dirname, 'credentials', 'google-drive-sa.json');

    if (mode !== 'local' && mode !== 'urls') {
        throw new Error('--mode phải là local hoặc urls');
    }
    if (mode === 'local' && !dir) {
        throw new Error('Thiếu --dir cho mode local');
    }
    if (!folderId) {
        throw new Error('Thiếu GOOGLE_DRIVE_FOLDER_ID hoặc --folder-id');
    }
    return { mode, dir, limit, dryRun, folderId, credentials };
}

function isMediaFile(filePath: string): boolean {
    return MEDIA_EXT.has(path.extname(filePath).toLowerCase());
}

function walkLocalFiles(rootDir: string): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name);
            const st = fs.statSync(full);
            if (st.isDirectory()) walk(full);
            else if (isMediaFile(full)) out.push(full);
        }
    };
    walk(rootDir);
    return out;
}

function guessExtFromUrl(url: string): string {
    try {
        const clean = url.split('?')[0];
        const ext = path.extname(clean).toLowerCase();
        if (MEDIA_EXT.has(ext)) return ext;
    } catch {
        /* ignore */
    }
    if (url.includes('/video/') || /\.(mp4|webm|mov|m4v)/i.test(url)) return '.mp4';
    return '.jpg';
}

function mimeFromExt(ext: string): string {
    const map: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.heic': 'image/heic',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.m4v': 'video/x-m4v',
        '.ogg': 'video/ogg',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
    };
    return map[ext.toLowerCase()] || 'application/octet-stream';
}

async function getDriveClient(credentialsPath: string) {
    // Dynamic import để script vẫn đọc được khi chưa cài googleapis
    const { google } = await import('googleapis');
    if (!fs.existsSync(credentialsPath)) {
        throw new Error(
            `Không tìm thấy credentials: ${credentialsPath}\n` +
                'Tạo Service Account JSON và đặt vào đường dẫn này.'
        );
    }
    const auth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    return google.drive({ version: 'v3', auth });
}

async function uploadBufferToDrive(
    drive: any,
    folderId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
    dryRun: boolean
) {
    if (dryRun) {
        console.log(`[dry-run] would upload: ${fileName} (${buffer.length} bytes, ${mimeType})`);
        return { id: 'dry-run' };
    }

    const res = await drive.files.create({
        requestBody: {
            name: fileName,
            parents: [folderId],
        },
        media: {
            mimeType,
            body: Readable.from(buffer),
        },
        fields: 'id, name, webViewLink',
        supportsAllDrives: true,
    });
    return res.data;
}

async function downloadUrl(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} khi tải ${url}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
}

function collectUrlsFromValue(value: unknown, bag: Set<string>) {
    if (!value) return;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return;
        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                collectUrlsFromValue(parsed, bag);
                return;
            } catch {
                /* fallthrough */
            }
        }
        if (/^https?:\/\//i.test(trimmed)) bag.add(trimmed);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((v) => collectUrlsFromValue(v, bag));
    }
}

async function collectMediaUrlsFromDb(limit: number): Promise<string[]> {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
        throw new Error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong server/.env');
    }
    const supabase = createClient(url, key);
    const bag = new Set<string>();

    // order_items: ảnh nhận đồ / hoàn thiện / đóng gói / step evidence
    const { data: items, error: itemsErr } = await supabase
        .from('order_items')
        .select('id, product_images, images, completion_photos, packaging_photos, sales_step_data')
        .limit(limit);
    if (itemsErr) throw itemsErr;

    for (const row of items || []) {
        collectUrlsFromValue(row.product_images, bag);
        collectUrlsFromValue(row.images, bag);
        collectUrlsFromValue(row.completion_photos, bag);
        collectUrlsFromValue(row.packaging_photos, bag);
        const step = (row.sales_step_data || {}) as Record<string, unknown>;
        collectUrlsFromValue(step.step1_evidence_photos, bag);
        collectUrlsFromValue(step.step2_tags_photos, bag);
        collectUrlsFromValue(step.step2_form_photos, bag);
    }

    // orders: ảnh thu nợ / HD / feedback
    const { data: orders, error: ordersErr } = await supabase
        .from('orders')
        .select('id, debt_payment_photos, hd_sent_photos, feedback_requested_photos')
        .limit(limit);
    if (ordersErr) throw ordersErr;

    for (const row of orders || []) {
        collectUrlsFromValue(row.debt_payment_photos, bag);
        collectUrlsFromValue(row.hd_sent_photos, bag);
        collectUrlsFromValue(row.feedback_requested_photos, bag);
    }

    // order_products (nếu có bảng riêng)
    const { data: products } = await supabase
        .from('order_products')
        .select('id, images, completion_photos, packaging_photos, product_images')
        .limit(limit);
    for (const row of products || []) {
        collectUrlsFromValue((row as any).images, bag);
        collectUrlsFromValue((row as any).completion_photos, bag);
        collectUrlsFromValue((row as any).packaging_photos, bag);
        collectUrlsFromValue((row as any).product_images, bag);
    }

    return [...bag];
}

function safeFileNameFromUrl(url: string, index: number): string {
    const ext = guessExtFromUrl(url);
    let base = 'media';
    try {
        const u = new URL(url);
        const last = path.basename(u.pathname);
        if (last && last.includes('.')) base = last.replace(/\.[^.]+$/, '');
    } catch {
        /* ignore */
    }
    base = base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'media';
    return `${String(index + 1).padStart(4, '0')}_${base}${ext}`;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    console.log('=== Upload media → Google Drive ===');
    console.log({
        mode: args.mode,
        dir: args.dir,
        folderId: args.folderId,
        credentials: args.credentials,
        dryRun: args.dryRun,
        limit: args.limit,
    });

    const drive = await getDriveClient(args.credentials);

    const manifestPath = path.join(__dirname, `drive-upload-manifest-${Date.now()}.jsonl`);
    const appendManifest = (row: object) => {
        fs.appendFileSync(manifestPath, JSON.stringify(row) + '\n', 'utf8');
    };

    let ok = 0;
    let fail = 0;

    if (args.mode === 'local') {
        const files = walkLocalFiles(path.resolve(args.dir!));
        console.log(`Tìm thấy ${files.length} file media trong ${args.dir}`);
        for (let i = 0; i < files.length; i++) {
            const filePath = files[i];
            const fileName = path.basename(filePath);
            const ext = path.extname(filePath).toLowerCase();
            try {
                const buffer = fs.readFileSync(filePath);
                const uploaded = await uploadBufferToDrive(
                    drive,
                    args.folderId,
                    fileName,
                    buffer,
                    mimeFromExt(ext),
                    args.dryRun
                );
                ok += 1;
                console.log(`[${i + 1}/${files.length}] OK ${fileName} → ${uploaded.id}`);
                appendManifest({
                    source: filePath,
                    driveFileId: uploaded.id,
                    name: uploaded.name || fileName,
                    link: uploaded.webViewLink || null,
                });
            } catch (err: any) {
                fail += 1;
                console.error(`[${i + 1}/${files.length}] FAIL ${fileName}:`, err?.message || err);
                appendManifest({ source: filePath, error: String(err?.message || err) });
            }
        }
    } else {
        const urls = await collectMediaUrlsFromDb(args.limit);
        console.log(`Tìm thấy ${urls.length} URL media từ DB`);
        const tmpDir = path.join(__dirname, '.tmp-drive-download');
        fs.mkdirSync(tmpDir, { recursive: true });

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const fileName = safeFileNameFromUrl(url, i);
            const ext = path.extname(fileName).toLowerCase();
            try {
                const buffer = await downloadUrl(url);
                // optional: cache local
                const localPath = path.join(tmpDir, fileName);
                fs.writeFileSync(localPath, buffer);

                const uploaded = await uploadBufferToDrive(
                    drive,
                    args.folderId,
                    fileName,
                    buffer,
                    mimeFromExt(ext),
                    args.dryRun
                );
                ok += 1;
                console.log(`[${i + 1}/${urls.length}] OK ${fileName}`);
                appendManifest({
                    source: url,
                    local: localPath,
                    driveFileId: uploaded.id,
                    name: uploaded.name || fileName,
                    link: uploaded.webViewLink || null,
                });
            } catch (err: any) {
                fail += 1;
                console.error(`[${i + 1}/${urls.length}] FAIL ${url}:`, err?.message || err);
                appendManifest({ source: url, error: String(err?.message || err) });
            }
        }
    }

    console.log('\n=== DONE ===');
    console.log({ ok, fail, manifest: manifestPath });
}

main().catch((err) => {
    console.error('\nScript failed:', err?.message || err);
    process.exit(1);
});
