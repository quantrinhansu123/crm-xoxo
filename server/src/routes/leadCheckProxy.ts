import { Router } from 'express';
import { config } from '../config/index.js';

const router = Router();

const UPSTREAM = 'https://crm-xoxo.onrender.com/api/leads';

/** Dev-only proxy so the lead-check page can read Render without browser CORS. */
router.get('/', async (req, res) => {
    if (config.nodeEnv === 'production') {
        res.status(404).json({ status: 'error', message: 'Không có trên production' });
        return;
    }

    const authorization = req.headers.authorization;
    if (!authorization) {
        res.status(401).json({ status: 'error', message: 'Thiếu token xác thực' });
        return;
    }

    const url = new URL(UPSTREAM);
    for (const key of ['page', 'limit', 'search', 'status', 'source']) {
        const value = req.query[key];
        if (typeof value === 'string' && value.trim()) {
            url.searchParams.set(key, value.trim());
        }
    }

    try {
        const upstream = await fetch(url, {
            headers: {
                Authorization: authorization,
                Accept: 'application/json',
            },
        });
        const text = await upstream.text();
        res.status(upstream.status).type('application/json').send(text);
    } catch (error) {
        res.status(502).json({
            status: 'error',
            message: 'Không gọi được API Render',
            detail: error instanceof Error ? error.message : String(error),
        });
    }
});

/** Sale bấm nhận lead trên trang kiểm tra: chuyển tiếp sang CUTI owner-assignment của Render. */
router.post('/:leadId/claim', async (req, res) => {
    if (config.nodeEnv === 'production') {
        res.status(404).json({ status: 'error', message: 'Không có trên production' });
        return;
    }

    const authorization = req.headers.authorization;
    if (!authorization) {
        res.status(401).json({ status: 'error', message: 'Thiếu token xác thực' });
        return;
    }

    const leadId = String(req.params.leadId || '');
    if (!/^[\w-]{8,80}$/.test(leadId)) {
        res.status(400).json({ status: 'error', message: 'lead_id không hợp lệ' });
        return;
    }

    try {
        const upstream = await fetch(
            `https://crm-xoxo.onrender.com/api/v1/cuti/leads/${encodeURIComponent(leadId)}/owner-assignment`,
            {
                method: 'POST',
                headers: {
                    Authorization: authorization,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(req.body ?? {}),
            },
        );
        const text = await upstream.text();
        res.status(upstream.status).type('application/json').send(text);
    } catch (error) {
        res.status(502).json({
            status: 'error',
            message: 'Không gọi được API nhận lead',
            detail: error instanceof Error ? error.message : String(error),
        });
    }
});

export default router;
