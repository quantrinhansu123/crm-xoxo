import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\X1 Yoga\\thuctap\\crm-xoxo\\crm-xoxo\\scratch\\chrome-test-create-lead';
const port = 9226;

const chrome = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    'about:blank'
], { stdio: 'ignore' });

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

try {
    let wsUrl = '';
    for (let i = 0; i < 20; i++) {
        await sleep(500);
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (res.ok) {
                const data = await res.json();
                wsUrl = data.webSocketDebuggerUrl;
                break;
            }
        } catch {}
    }

    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    const pageWs = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((res, rej) => { pageWs.onopen = res; pageWs.onerror = rej; });

    let pageMsgId = 1;
    const pagePending = new Map();
    pageWs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.id && pagePending.has(data.id)) {
            pagePending.get(data.id)(data.result || data.error);
            pagePending.delete(data.id);
        }
    };

    function sendPage(method, params = {}) {
        const id = pageMsgId++;
        return new Promise((resolve, reject) => {
            pagePending.set(id, (res) => {
                if (res && res.message) reject(new Error(res.message));
                else resolve(res);
            });
            pageWs.send(JSON.stringify({ id, method, params }));
        });
    }

    await sendPage('Page.enable');
    await sendPage('Runtime.enable');

    await sendPage('Page.navigate', { url: 'http://localhost:5173/login' });
    await sleep(2000);

    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2MDlmMzc4My0zOTJlLTRmOTItYmZhYy0xYmM1ODJkNGM1MWMiLCJlbWFpbCI6Im1hbmFnZXJAZGVtby5jb20iLCJyb2xlIjoibWFuYWdlciIsIm5hbWUiOiJNQU5BR0VSIiwiaWF0IjoxNzkwOTYxNTk2LCJleHAiOjE3OTE1NjYzOTZ9._85vN48BAn8hNwQpJSB7qtlJt-3Jdi700V2SmhnMANE';
    const user = {
        id: '609f3783-392e-4f92-bfac-1bc582d4c51c',
        email: 'manager@demo.com',
        name: 'MANAGER',
        role: 'manager',
        avatar: null,
        allowed_views: null,
        view_actions: null,
        uses_role_defaults: true
    };

    await sendPage('Runtime.evaluate', {
        expression: `
            localStorage.setItem('token', ${JSON.stringify(token)});
            localStorage.setItem('user', ${JSON.stringify(JSON.stringify(user))});
        `
    });

    console.log('Navigating to /leads/new on local...');
    await sendPage('Page.navigate', { url: 'http://localhost:5173/leads/new' });
    await sleep(3000);

    const shot = await sendPage('Page.captureScreenshot', { format: 'png' });
    await writeFile('scratch/create-lead-page.png', Buffer.from(shot.data, 'base64'));
    console.log('Saved scratch/create-lead-page.png');

    pageWs.close();
    ws.close();
} finally {
    chrome.kill();
}
