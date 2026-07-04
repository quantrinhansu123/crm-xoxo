export const WORKFLOW_REQUEST_LOG_ACTIONS = [
    'accessory_requested',
    'accessory_approved',
    'accessory_need_buy',
    'accessory_bought',
    'accessory_waiting_ship',
    'accessory_shipped',
    'accessory_delivered_to_tech',
    'accessory_rejected',
    'partner_requested',
    'partner_approved',
    'partner_ship_to_partner',
    'partner_partner_doing',
    'partner_ship_back',
    'partner_done',
    'partner_rejected',
    'extension_requested',
    'extension_approved',
    'extension_rejected',
] as const;

export type WorkflowRequestLogAction = (typeof WORKFLOW_REQUEST_LOG_ACTIONS)[number];

export function isWorkflowRequestLogAction(action: string): boolean {
    return (WORKFLOW_REQUEST_LOG_ACTIONS as readonly string[]).includes(action);
}

const DISPLAY: Record<
    WorkflowRequestLogAction,
    { emoji: string; label: string; listClass: string; boxClass: string }
> = {
    accessory_requested: {
        emoji: '',
        label: 'Yêu cầu mua phụ kiện',
        listClass: 'text-amber-600',
        boxClass: 'bg-amber-50 border-amber-100 text-amber-700',
    },
    accessory_approved: {
        emoji: '',
        label: 'QL duyệt mua phụ kiện',
        listClass: 'text-green-600',
        boxClass: 'bg-green-50 border-green-100 text-green-700',
    },
    accessory_need_buy: {
        emoji: '',
        label: 'Mua phụ kiện - Cần mua',
        listClass: 'text-amber-600',
        boxClass: 'bg-amber-50 border-amber-100 text-amber-700',
    },
    accessory_bought: {
        emoji: '',
        label: 'Đã mua phụ kiện',
        listClass: 'text-emerald-600',
        boxClass: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    },
    accessory_waiting_ship: {
        emoji: '',
        label: 'Phụ kiện đang chờ ship',
        listClass: 'text-blue-600',
        boxClass: 'bg-blue-50 border-blue-100 text-blue-700',
    },
    accessory_shipped: {
        emoji: '',
        label: 'Phụ kiện đã nhận hàng',
        listClass: 'text-indigo-600',
        boxClass: 'bg-indigo-50 border-indigo-100 text-indigo-700',
    },
    accessory_delivered_to_tech: {
        emoji: '',
        label: 'Đã giao phụ kiện cho kỹ thuật',
        listClass: 'text-emerald-600',
        boxClass: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    },
    accessory_rejected: {
        emoji: '',
        label: 'QL từ chối mua phụ kiện',
        listClass: 'text-red-600',
        boxClass: 'bg-red-50 border-red-100 text-red-700',
    },
    partner_requested: {
        emoji: '',
        label: 'Yêu cầu gửi đối tác',
        listClass: 'text-purple-600',
        boxClass: 'bg-purple-50 border-purple-100 text-purple-700',
    },
    partner_approved: {
        emoji: '',
        label: 'QL duyệt gửi đối tác',
        listClass: 'text-green-600',
        boxClass: 'bg-green-50 border-green-100 text-green-700',
    },
    partner_ship_to_partner: {
        emoji: '',
        label: 'Đã gửi đối tác',
        listClass: 'text-purple-600',
        boxClass: 'bg-purple-50 border-purple-100 text-purple-700',
    },
    partner_partner_doing: {
        emoji: '',
        label: 'Đối tác đang xử lý',
        listClass: 'text-blue-600',
        boxClass: 'bg-blue-50 border-blue-100 text-blue-700',
    },
    partner_ship_back: {
        emoji: '',
        label: 'Đối tác gửi trả',
        listClass: 'text-indigo-600',
        boxClass: 'bg-indigo-50 border-indigo-100 text-indigo-700',
    },
    partner_done: {
        emoji: '',
        label: 'Hoàn tất gửi đối tác',
        listClass: 'text-emerald-600',
        boxClass: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    },
    partner_rejected: {
        emoji: '',
        label: 'QL từ chối gửi đối tác',
        listClass: 'text-red-600',
        boxClass: 'bg-red-50 border-red-100 text-red-700',
    },
    extension_requested: {
        emoji: '',
        label: 'Xin gia hạn',
        listClass: 'text-blue-600',
        boxClass: 'bg-blue-50 border-blue-100 text-blue-700',
    },
    extension_approved: {
        emoji: '',
        label: 'QL duyệt gia hạn',
        listClass: 'text-green-600',
        boxClass: 'bg-green-50 border-green-100 text-green-700',
    },
    extension_rejected: {
        emoji: '',
        label: 'QL từ chối gia hạn',
        listClass: 'text-red-600',
        boxClass: 'bg-red-50 border-red-100 text-red-700',
    },
};

export function getWorkflowRequestLogDisplay(action: string) {
    return DISPLAY[action as WorkflowRequestLogAction];
}
