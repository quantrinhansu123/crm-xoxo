import type { Order, OrderItem } from '@/hooks/useOrders';
import { formatDate, formatDateTime, formatNumber } from '@/lib/utils';
import { getPaymentConfig, isPaymentConfigured, type PaymentConfig } from '@/lib/paymentConfig';
import { buildVietQrPayload } from '@/lib/vietqr';

const INVOICE_FOOTER_NOTES = [
    'Giữ hoá đơn cẩn thận và mang theo khi đến lấy đồ. Hoặc hóa đơn qua zalo XoXo sẽ KHÔNG TRẢ ĐỒ nếu KHÔNG CÓ HOÁ ĐƠN.',
    'Xác nhận chính xác tình trạng đồ với nhận viên Xoxo, mọi vấn đề trên đồ đã có trước đó. Xoxo sẽ không chịu trách nhiệm',
    'Kiểm tra kỹ đồ trước khi mang về. Nếu có điều gì chưa hài lòng về đồ, hãy trao đổi ngay với nhân viên tại quầy. Xoxo sẽ không chịu trách nhiệm khi quý khách đã mang đồ ra khỏi cửa hàng.',
    'Xoxo không chịu trách nhiệm với các trường hợp mất mát, hư hỏng khi có 1 bên thứ 3 thay khách đến nhận đồ.',
    'Vui lòng lấy đồ đúng hẹn. Xoxo sẽ không chịu trách nhiệm cho những hoá đơn quá hạn trên 2 tuần.',
];

const UNIT_SUFFIX: Record<string, string> = {
    product: 'chiếc',
    service: 'lần',
    package: 'gói',
    voucher: '',
    account_card: '',
};

interface PrintServiceLine {
    name: string;
    amount: number;
    noteLines: string[];
}

interface PrintProductGroup {
    name: string;
    dueAt?: string;
    servicesTotal: number;
    services: PrintServiceLine[];
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Định dạng tiền hóa đơn nhiệt: dấu chấm phân cách nghìn (VD: 2.500.000) */
export function formatThermalMoney(amount: number): string {
    return formatNumber(Math.round(amount));
}

function extractNoteLines(item: OrderItem): string[] {
    const sd = ((item as { sales_step_data?: Record<string, unknown> }).sales_step_data || {}) as Record<
        string,
        unknown
    >;
    const lines: string[] = [];

    for (const key of [
        'note',
        'notes',
        'description',
        'deduct_note',
        'package_note',
        'item_note',
        'deduction_note',
    ]) {
        const v = sd[key];
        if (typeof v === 'string' && v.trim()) lines.push(v.trim());
    }

    if (item.accessory?.notes?.trim()) lines.push(item.accessory.notes.trim());
    if (item.partner?.notes?.trim()) lines.push(item.partner.notes.trim());

    return lines;
}

function getItemAmount(item: OrderItem): number {
    const qty = Number(item.quantity) || 1;
    const unitPrice = Number(item.unit_price) || 0;
    const total = Number(item.total_price) || qty * unitPrice;
    const surcharge = Number((item as { surcharge_amount?: number }).surcharge_amount) || 0;
    return total + surcharge;
}

function isCustomerProduct(item: OrderItem | undefined): item is OrderItem & { is_customer_item: true; item_type: 'product' } {
    return !!item && item.is_customer_item === true && item.item_type === 'product';
}

function normalizeServiceName(item: OrderItem, productName?: string): string {
    const suffix = UNIT_SUFFIX[item.item_type];
    let name = item.item_name || 'Dịch vụ';

    if (productName && name.includes(` (${productName})`)) {
        name = name.replace(` (${productName})`, '');
    }

    if (suffix && !name.toLowerCase().includes(`(${suffix})`)) {
        name = `${name} (${suffix.charAt(0).toUpperCase() + suffix.slice(1)})`;
    }

    const qty = Number(item.quantity) || 1;
    if (qty > 1) {
        name = `${name} x${qty}`;
    }

    return name;
}

function toServiceLine(item: OrderItem, productName?: string): PrintServiceLine {
    return {
        name: normalizeServiceName(item, productName),
        amount: getItemAmount(item),
        noteLines: extractNoteLines(item),
    };
}

export function collectPrintLineItems(order: Order): PrintProductGroup[] {
    const items = order.items || [];
    const groups: PrintProductGroup[] = [];

    let index = 0;
    while (index < items.length) {
        const item = items[index];
        if (!item?.item_name?.trim()) {
            index += 1;
            continue;
        }

        if (isCustomerProduct(item)) {
            const services: PrintServiceLine[] = [];
            let cursor = index + 1;

            while (cursor < items.length) {
                const next = items[cursor];
                if (isCustomerProduct(next)) break;
                if (next?.item_name?.trim()) {
                    const amount = getItemAmount(next);
                    if (amount > 0 || next.item_type === 'package') {
                        services.push(toServiceLine(next, item.item_name));
                    }
                }
                cursor += 1;
            }

            const servicesTotal = services.reduce((sum, service) => sum + service.amount, 0);
            groups.push({
                name: item.item_name,
                dueAt: item.due_at,
                servicesTotal,
                services,
            });

            index = cursor;
            continue;
        }

        const amount = getItemAmount(item);
        if (amount > 0 || item.item_type === 'package') {
            const line = toServiceLine(item);
            groups.push({
                name: item.item_name,
                dueAt: item.due_at,
                servicesTotal: line.amount,
                services: [line],
            });
        }

        index += 1;
    }

    return groups;
}

export function getOrderPayAmount(order: Order): number {
    if (order.payment_status === 'paid') return 0;
    if (order.remaining_debt != null && order.remaining_debt > 0) return order.remaining_debt;
    const paid = order.paid_amount ?? 0;
    return Math.max(0, (order.total_amount ?? 0) - paid);
}

/** Số tiền khách đã trả (cọc / thanh toán trước) */
export function getOrderPaidAmount(order: Order): number {
    const total = Number(order.total_amount) || 0;
    if (order.payment_status === 'paid') return total;
    if (order.paid_amount != null && order.paid_amount > 0) return Number(order.paid_amount);
    const remaining = order.remaining_debt != null ? Number(order.remaining_debt) : null;
    if (remaining != null && total > 0) return Math.max(0, total - remaining);
    return 0;
}

function buildItemsTableHtml(groups: PrintProductGroup[]): string {
    if (groups.length === 0) {
        return '<p class="empty-items">Không có dòng hàng</p>';
    }

    const bodyRows = groups
        .map((group) => {
            const dueText = group.dueAt ? `Hạn trả ${formatDate(group.dueAt)}` : 'Chưa có hạn trả';
            const serviceRows =
                group.services.length > 0
                    ? group.services
                          .map((service) => {
                              const notes = service.noteLines
                                  .map((note) => `<div class="svc-note">${escapeHtml(note)}</div>`)
                                  .join('');

                              return `<tr class="svc-row">
                    <td class="svc-name">- ${escapeHtml(service.name)}${notes}</td>
                    <td class="svc-amount">${formatThermalMoney(service.amount)}</td>
                </tr>`;
                          })
                          .join('')
                    : `<tr class="svc-row"><td class="svc-name svc-empty">- Chưa có dịch vụ</td><td class="svc-amount">0</td></tr>`;

            return `
            <tr class="group-row">
                <td class="group-name">
                    ${escapeHtml(group.name)}
                    <div class="group-due">(${escapeHtml(dueText)})</div>
                </td>
                <td class="group-total">${formatThermalMoney(group.servicesTotal)}</td>
            </tr>
            ${serviceRows}`;
        })
        .join('');

    return `
    <table class="items-table grouped-table">
        <colgroup>
            <col class="col-group-name" />
            <col class="col-group-total" />
        </colgroup>
        <thead>
            <tr>
                <th class="group-head-name">Sản phẩm / Dịch vụ</th>
                <th class="group-head-total">Giá tiền</th>
            </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
    </table>`;
}

function buildTotalsTableHtml(
    subtotal: number,
    discount: number,
    total: number,
    paidAmount = 0,
    remainingPay = 0
): string {
    const paid = Math.max(0, Math.min(paidAmount, total));
    const remaining = remainingPay > 0 ? remainingPay : Math.max(0, total - paid);

    return `
    <table class="totals-table">
        <colgroup>
            <col class="col-price-w" />
            <col class="col-qty-w" />
            <col class="col-total-w" />
        </colgroup>
        <tbody>
            <tr>
                <td colspan="2" class="total-label">Tổng tiền hàng:</td>
                <td class="col-total">${formatThermalMoney(subtotal)}</td>
            </tr>
            ${
                discount > 0
                    ? `<tr>
                <td colspan="2" class="total-label">Chiết khấu:</td>
                <td class="col-total">${formatThermalMoney(discount)}</td>
            </tr>`
                    : ''
            }
            <tr class="grand">
                <td colspan="2" class="total-label">Tổng cộng:</td>
                <td class="col-total">${formatThermalMoney(total)}</td>
            </tr>
            ${
                paid > 0
                    ? `<tr>
                <td colspan="2" class="total-label">Đã thanh toán (cọc):</td>
                <td class="col-total paid-line">−${formatThermalMoney(paid)}</td>
            </tr>
            <tr class="grand remain">
                <td colspan="2" class="total-label">Còn phải trả:</td>
                <td class="col-total">${formatThermalMoney(remaining)}</td>
            </tr>`
                    : ''
            }
        </tbody>
    </table>`;
}

const THERMAL_STYLES = `
        .thermal-doc, .thermal-doc * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: 80mm auto; margin: 2mm; }
        .thermal-doc, .thermal-doc .invoice-sheet {
            width: 72mm;
            max-width: 72mm;
            margin: 0 auto;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 10px;
            line-height: 1.4;
            color: #000;
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .invoice-sheet { padding: 2mm 3mm; }
        .logo { display: block; margin: 0 auto 4px; max-width: 48mm; max-height: 18mm; height: auto; object-fit: contain; }
        .shop-name { text-align: center; font-size: 11px; font-weight: 700; margin-top: 2px; }
        .shop-line { text-align: center; font-size: 9px; margin: 1px 0; line-height: 1.35; }
        .meta { margin: 6px 0 4px; font-size: 10px; }
        .meta-row { margin: 2px 0; }
        .invoice-title { text-align: center; font-weight: 700; font-size: 11px; margin: 8px 0 2px; }
        .invoice-code { text-align: center; font-weight: 700; font-size: 12px; margin-bottom: 6px; }
        .block { margin: 4px 0; font-size: 10px; line-height: 1.4; }
        .block p { margin: 2px 0; }
        .label { font-weight: 600; }
        .terms { font-size: 9px; font-style: italic; margin: 6px 0; line-height: 1.35; text-align: left; }
        .col-price-w { width: 40%; }
        .col-qty-w { width: 12%; }
        .col-total-w { width: 48%; }
        .items-table, .totals-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
        }
        .items-table { margin: 6px 0 4px; table-layout: fixed; }
        .items-table thead th {
            font-weight: 700;
            font-size: 9px;
            padding: 3px 2px;
            border-bottom: 1px solid #000;
            vertical-align: bottom;
        }
        .grouped-table .col-group-name { width: 62%; }
        .grouped-table .col-group-total { width: 38%; }
        .group-head-name { text-align: left; }
        .group-head-total { text-align: right; }
        .group-row td {
            border-top: 1px dashed #999;
            padding: 5px 2px 3px;
            vertical-align: top;
        }
        .group-name {
            font-weight: 700;
            font-size: 10px;
            line-height: 1.35;
            text-align: left;
        }
        .group-due {
            font-weight: 400;
            font-size: 8.5px;
            margin-top: 1px;
            color: #444;
        }
        .group-total {
            text-align: right;
            font-weight: 700;
            font-size: 9px;
            white-space: nowrap;
            letter-spacing: -0.2px;
        }
        .svc-row td {
            padding: 2px;
            vertical-align: top;
            word-break: break-word;
        }
        .svc-name {
            text-align: left;
            padding-left: 8px !important;
            font-size: 9.5px;
            line-height: 1.35;
        }
        .svc-amount {
            text-align: right;
            font-weight: 600;
            white-space: nowrap;
            font-size: 8.5px;
            letter-spacing: -0.2px;
        }
        .svc-note {
            font-size: 8.5px;
            color: #333;
            margin-top: 1px;
            font-style: italic;
        }
        .svc-empty {
            color: #666;
            font-style: italic;
        }
        .price-main { display: block; line-height: 1.25; }
        .price-old { display: block; font-size: 8px; color: #555; text-decoration: line-through; line-height: 1.2; }
        .empty-items { text-align: center; font-size: 10px; color: #555; padding: 8px 0; }
        .notes-block { margin: 8px 0 4px; font-size: 10px; }
        .totals-table { margin-top: 4px; border-top: 1px solid #000; }
        .totals-table td { padding: 3px 2px; }
        .total-label { text-align: left; font-size: 10px; }
        .totals-table .grand td { font-weight: 700; font-size: 11px; padding-top: 4px; }
        .totals-table .paid-line { color: #333; }
        .totals-table .remain td { border-top: 1px dashed #000; }
        .footer-title { font-weight: 700; margin: 10px 0 4px; font-size: 10px; text-align: left; }
        .footer-note { font-size: 8.5px; line-height: 1.35; margin: 3px 0; text-align: justify; }
        .footer-note::before { content: "- "; }
        .thanks { text-align: center; font-weight: 700; margin: 10px 0 6px; font-size: 10px; }
        .qr-block { text-align: center; margin-top: 8px; padding-top: 6px; border-top: 1px dashed #000; }
        .qr-title { font-weight: 700; font-size: 10px; }
        .qr-sub { font-size: 8.5px; margin: 2px 0 4px; color: #333; }
        .qr-amount { font-size: 14px; font-weight: 700; margin: 4px 0; }
        .qr-box { display: flex; justify-content: center; margin: 6px auto; min-height: 140px; }
        .qr-box canvas, .qr-box img { width: 38mm !important; height: 38mm !important; }
        .bank { font-size: 9px; margin: 1px 0; }
        .warn { text-align: center; font-size: 9px; color: #555; margin-top: 6px; }
        @media print { .thermal-doc { width: 72mm; } }
`;

function buildInvoiceBody(order: Order, cfg: PaymentConfig): string {
    const customer = order.customer as { name?: string; phone?: string; address?: string; email?: string } | undefined;
    const saleDate = order.confirmed_at || order.created_at;
    const groups = collectPrintLineItems(order);
    const subtotal = order.subtotal ?? groups.reduce((sum, group) => sum + group.servicesTotal, 0);
    const discount = order.discount ?? 0;

    const itemsTableHtml = buildItemsTableHtml(groups);
    const totalAmount = Number(order.total_amount) || 0;
    const paidAmount = getOrderPaidAmount(order);
    const payQrAmount = getOrderPayAmount(order);
    const totalsHtml = buildTotalsTableHtml(subtotal, discount, totalAmount, paidAmount, payQrAmount);

    const notesBlock = order.notes?.trim()
        ? `<div class="notes-block"><span class="label">Ghi chú</span><br/>${escapeHtml(order.notes)}</div>`
        : '';

    return `
    <div class="invoice-sheet">
    <img class="logo" src="${escapeHtml(cfg.companyLogoUrl)}" alt="Logo" />
    <p class="shop-name">${escapeHtml(cfg.companyName)}</p>
    ${cfg.companyAddress ? `<p class="shop-line">Địa chỉ: ${escapeHtml(cfg.companyAddress)}</p>` : ''}
    ${cfg.companyPhone ? `<p class="shop-line">Điện thoại: ${escapeHtml(cfg.companyPhone)}</p>` : ''}

    <div class="meta">
        <p class="meta-row">Liên số: ${escapeHtml(cfg.invoiceCopyLabel)}</p>
        <p class="meta-row">Ngày bán: ${formatDateTime(saleDate || new Date().toISOString())}</p>
    </div>

    <p class="invoice-title">HOÁ ĐƠN BÁN HÀNG</p>
    <p class="invoice-code">${escapeHtml(order.order_code)}</p>

    <div class="block">
        <p><span class="label">Khách hàng:</span> ${escapeHtml(customer?.name || '—')}</p>
        ${customer?.address ? `<p><span class="label">Địa chỉ:</span> ${escapeHtml(customer.address)}</p>` : ''}
        ${customer?.phone ? `<p><span class="label">Điện thoại:</span> ${escapeHtml(customer.phone)}</p>` : ''}
    </div>

    <p class="terms">${escapeHtml(cfg.termsAgreementLine)}</p>
    <p class="block"><span class="label">Nhân viên bán hàng:</span> ${escapeHtml(order.sales_user?.name || '—')}</p>

    ${itemsTableHtml}

    ${notesBlock}

    ${totalsHtml}

    <p class="footer-title">Quý khách lưu ý:</p>
    ${INVOICE_FOOTER_NOTES.map((n) => `<p class="footer-note">${escapeHtml(n)}</p>`).join('')}
    <p class="thanks">Cảm ơn quý khách đã sử dụng dịch vụ của Xoxo Luxury!</p>
    </div>
    `;
}

function buildThermalQrBlockHtml(
    payAmount: number,
    orderCode: string,
    cfg: PaymentConfig,
    includeQrCanvas: boolean
): string {
    if (payAmount > 0 && !isPaymentConfigured()) {
        return `<p class="warn">Chưa cấu hình TK nhận tiền (VITE_PAYMENT_* trong .env)</p>`;
    }
    if (!includeQrCanvas || payAmount <= 0) return '';

    return `
        <div class="qr-block">
            <p class="qr-title">QUÉT MÃ THANH TOÁN</p>
            <p class="qr-sub">Số tiền còn phải trả (không phải tổng HĐ)</p>
            <p class="qr-amount">${formatThermalMoney(payAmount)} đ</p>
            <div id="payment-qr" class="qr-box"></div>
            <p class="bank">${escapeHtml(cfg.bankName)} · ${escapeHtml(cfg.accountNumber)}</p>
            <p class="bank">ND: ${escapeHtml(orderCode)}</p>
        </div>`;
}

export function buildThermalInvoiceHtml(order: Order, config?: PaymentConfig): string {
    const cfg = config ?? getPaymentConfig();
    const payAmount = getOrderPayAmount(order);
    const hasQr = isPaymentConfigured() && payAmount > 0;

    const qrPayload = hasQr
        ? buildVietQrPayload({
              bankBin: cfg.bankBin,
              accountNumber: cfg.accountNumber,
              amount: payAmount,
              description: order.order_code,
              merchantName: cfg.accountName,
          })
        : '';

    const qrBlock = buildThermalQrBlockHtml(payAmount, order.order_code, cfg, hasQr);

    const body = buildInvoiceBody(order, cfg);

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Hóa đơn ${escapeHtml(order.order_code)}</title>
    <style>${THERMAL_STYLES}</style>
</head>
<body>
    <div class="thermal-doc">
        ${body}
        ${qrBlock}
    </div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
    <script>
        (function() {
            var payload = ${JSON.stringify(qrPayload)};
            if (payload && document.getElementById('payment-qr')) {
                try {
                    new QRCode(document.getElementById('payment-qr'), {
                        text: payload,
                        width: 152,
                        height: 152,
                        correctLevel: QRCode.CorrectLevel.M
                    });
                } catch (e) { console.error(e); }
            }
            setTimeout(function() { window.print(); }, 700);
        })();
    <\/script>
</body>
</html>`;
}

/** HTML fragment for in-app preview (no print script) */
export function buildThermalInvoicePreviewHtml(
    order: Order,
    config?: PaymentConfig,
    options?: { includeQrSection?: boolean }
): string {
    const cfg = config ?? getPaymentConfig();
    const body = buildInvoiceBody(order, cfg);
    const payAmount = getOrderPayAmount(order);
    const includeQr = options?.includeQrSection !== false;
    const qrSection =
        includeQr && payAmount > 0 && isPaymentConfigured()
            ? buildThermalQrBlockHtml(payAmount, order.order_code, cfg, true)
            : !includeQr
              ? ''
              : buildThermalQrBlockHtml(payAmount, order.order_code, cfg, false);

    return `<div class="thermal-doc">${body}${qrSection}</div><style>${THERMAL_STYLES}</style>`;
}

/** Khối QR (React) — cùng nội dung với bản in */
export function getThermalQrPreviewMeta(order: Order, config?: PaymentConfig) {
    const cfg = config ?? getPaymentConfig();
    const payAmount = getOrderPayAmount(order);
    const show = payAmount > 0 && isPaymentConfigured();
    return {
        payAmount,
        show,
        orderCode: order.order_code,
        bankLine: `${cfg.bankName} · ${cfg.accountNumber}`,
    };
}

export function printThermalInvoice(order: Order): void {
    const html = buildThermalInvoiceHtml(order);
    const win = window.open('', '_blank', 'width=400,height=820');
    if (!win) {
        alert('Trình duyệt chặn cửa sổ in. Vui lòng cho phép popup.');
        return;
    }
    win.document.write(html);
    win.document.close();
}





