import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    RotateCw,
    Plus,
    Bot,
    Copy,
    ChevronRight,
    Timer,
    History,
    X,
    ArrowUp,
    CalendarPlus,
    ThumbsUp,
    ThumbsDown,
    Check,
    Wrench,
    Heart,
    RefreshCcw
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

// --- Types ---
interface OrderHistory {
    time: string;
    action: string;
    user: string;
    type: 'sales' | 'tech' | 'after' | 'alert' | 'info';
}

interface WorkflowOrder {
    id: string;
    customer: string;
    item: string;
    status: string;
    saleName: string;
    techName: string;
    price: number;
    sla: string;
    service: string;
    isChangeRequested: boolean;
    isApproved: boolean;
    history: OrderHistory[];
}

const COL_NAMES: Record<string, string> = {
    step1: 'Nhận đồ', step2: 'Tag', step3: 'Trao đổi KT', step4: 'Phê duyệt', step5: 'Chuyển KT',
    tech1: 'Phòng Mạ', tech2: 'Phòng Dán', tech3: 'Phòng Da', tech4: 'Xong KT',
    after1: 'Kiểm nợ & Ảnh', after2: 'Giao hàng', after3: 'Feedback', after4: 'Lưu trữ',
    war1: 'Tiếp nhận BH', war2: 'Xử lý BH', war3: 'Hoàn tất BH',
    care6: 'Mốc 6T', care12: 'Mốc 12T', 'care-custom': 'Lịch riêng'
};

const INITIAL_ORDERS: WorkflowOrder[] = [
    {
        id: 'ORD-8888',
        customer: 'Chị Lan (FB)',
        item: 'Dior B23 High-top',
        status: 'tech3',
        saleName: 'Hương Sale',
        techName: 'Hải KT',
        price: 1200000,
        sla: '2024-02-15',
        service: 'Vệ sinh & Mạ logo',
        isChangeRequested: false,
        isApproved: false,
        history: [{ time: new Date().toLocaleString('vi-VN'), action: 'Khởi tạo đơn hàng', user: 'Hương Sale', type: 'sales' }]
    }
];

export function WorkflowKanbanBoardPage() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'sales' | 'tech' | 'after' | 'care'>('sales');
    const [orders, setOrders] = useState<WorkflowOrder[]>(INITIAL_ORDERS);
    const [selectedOrder, setSelectedOrder] = useState<WorkflowOrder | null>(null);
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [moveBackModalOpen, setMoveBackModalOpen] = useState(false);
    const [moveBackData, setMoveBackData] = useState<{ id: string; target: string; reason: string } | null>(null);

    // --- Helper Functions ---
    const getSLADisplay = (sla: string) => {
        const diff = Math.ceil((new Date(sla).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        return diff < 0 ? `Trễ ${Math.abs(diff)} ngày` : `Còn ${diff} ngày`;
    };

    const addHistory = (order: WorkflowOrder, action: string, user = 'System', type: OrderHistory['type'] = 'info') => {
        const newHistory: OrderHistory = { time: new Date().toLocaleString('vi-VN'), action, user, type };
        return {
            ...order,
            history: [newHistory, ...order.history]
        };
    };

    const detectMoveBack = (oldS: string, newS: string) => {
        const map: Record<string, number> = {
            'step1': 1, 'step2': 2, 'step3': 3, 'step4': 4, 'step5': 5,
            'tech1': 6, 'tech2': 7, 'tech3': 8, 'tech4': 9,
            'after1': 10, 'after2': 11, 'after3': 12, 'after4': 13
        };
        return (map[newS] || 0) < (map[oldS] || 0);
    };

    const updateOrderStatus = (id: string, newStatus: string) => {
        setOrders(prev => {
            const order = prev.find(o => o.id === id);
            if (!order) return prev;

            const oldStatus = order.status;
            if (oldStatus === newStatus) return prev;

            let finalStatus = newStatus;
            let historyAction = `Chuyển: ${COL_NAMES[oldStatus]} → ${COL_NAMES[newStatus]}`;
            let historyType: OrderHistory['type'] = 'info';

            if (newStatus === 'step5') {
                finalStatus = 'tech1';
                historyAction = `CHỐT ĐƠN → Tự động nhảy sang PHÒNG MẠ (Kỹ thuật)`;
                historyType = 'tech';
            } else if (newStatus === 'tech4') {
                finalStatus = 'after1';
                historyAction = `KT HOÀN TẤT → Tự động nhảy sang KIỂM NỢ & ẢNH (After-sale)`;
                historyType = 'after';
            }

            if (detectMoveBack(oldStatus, finalStatus)) {
                setMoveBackData({ id, target: finalStatus, reason: '' });
                setMoveBackModalOpen(true);
                return prev;
            }

            return prev.map(o => o.id === id ? addHistory({ ...o, status: finalStatus }, historyAction, "System", historyType) : o);
        });
    };

    // --- Drag & Drop ---
    const onDragStart = (e: React.DragEvent, id: string) => {
        e.dataTransfer.setData("orderId", id);
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.currentTarget.classList.add('bg-blue-50/50');
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.currentTarget.classList.remove('bg-blue-50/50');
    };

    const onDrop = (e: React.DragEvent, status: string) => {
        e.preventDefault();
        e.currentTarget.classList.remove('bg-blue-50/50');
        const id = e.dataTransfer.getData("orderId");
        updateOrderStatus(id, status);
    };

    // --- Actions ---
    const handleViewDetails = (id: string) => {
        const order = orders.find(o => o.id === id);
        if (order) {
            setSelectedOrder(order);
            setDetailModalOpen(true);
        }
    };

    const copyTemplate = (type: 'ship' | 'care' | 'feedback') => {
        if (!selectedOrder) return;
        const templates = {
            ship: `Chào ${selectedOrder.customer} ạ, giày ${selectedOrder.item} đã xong. Anh/chị cho shop xin địa chỉ ship nhé!`,
            care: `Shop gửi ${selectedOrder.customer} HDSD: Tránh nước, lau bằng khăn mềm định kỳ ạ.`,
            feedback: `Dạ chào ${selectedOrder.customer}, mình nhận được giày chưa ạ? Cho shop xin feedback nhé!`
        };

        navigator.clipboard.writeText(templates[type]);
        toast.success(`Đã copy tin nhắn mẫu!`);

        setOrders(prev => prev.map(o => o.id === selectedOrder.id ? addHistory(o, `Sale copy mẫu tin nhắn [${type}]`, "Sale", "after") : o));
    };

    const processFeedback = (result: 'positive' | 'negative') => {
        if (!selectedOrder) return;

        setOrders(prev => prev.map(o => {
            if (o.id === selectedOrder.id) {
                const newStatus = result === 'positive' ? 'care6' : 'war1';
                const action = result === 'positive' ? `FEEDBACK KHEN ⭐ → Chuyển CHĂM SÓC 6T` : `FEEDBACK CHÊ ⚠️ → Chuyển BẢO HÀNH`;
                const type = result === 'positive' ? 'after' : 'alert';
                return addHistory({ ...o, status: newStatus }, action, "Sale", type);
            }
            return o;
        }));

        setDetailModalOpen(false);
        setActiveTab('care');
    };

    const submitMoveBack = () => {
        if (!moveBackData) return;
        setOrders(prev => prev.map(o => {
            if (o.id === moveBackData.id) {
                const oldS = o.status;
                const action = `LÙI: ${COL_NAMES[oldS]} → ${COL_NAMES[moveBackData.target]}. Lý do: ${moveBackData.reason}`;
                return addHistory({ ...o, status: moveBackData.target }, action, "Admin", "alert");
            }
            return o;
        }));
        setMoveBackModalOpen(false);
        setMoveBackData(null);
    };

    // --- Components ---
    const KanbanCard = ({ order }: { order: WorkflowOrder }) => {
        const isLate = new Date() > new Date(order.sla);
        return (
            <div
                className={cn(
                    "bg-white rounded-xl shadow-sm p-4 mb-3 border-l-4 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-md",
                    isLate ? "border-red-500 bg-red-50/30" : "border-blue-400"
                )}
                draggable
                onDragStart={(e) => onDragStart(e, order.id)}
                onClick={() => handleViewDetails(order.id)}
            >
                <div className="flex justify-between items-start mb-2">
                    <span className="text-[9px] font-black text-gray-300">#{order.id}</span>
                    {order.status === 'after3' && (
                        <span className="animate-bounce text-purple-600">
                            <RotateCw className="h-3 w-3 inline-block" />
                        </span>
                    )}
                </div>
                <h3 className="font-bold text-gray-800 text-xs truncate">{order.customer}</h3>
                <p className="text-[9px] text-gray-400 mt-1">{order.item}</p>
                <div className="mt-4 flex justify-between items-center">
                    <Badge variant="secondary" className="text-[8px] font-bold text-blue-500 bg-blue-50 uppercase">
                        {order.saleName}
                    </Badge>
                    <span className="text-[8px] font-bold text-gray-400">{getSLADisplay(order.sla)}</span>
                </div>
            </div>
        );
    };

    const KanbanColumn = ({ id, title, color = 'gray' }: { id: string, title: string, color?: string }) => {
        const columnOrders = orders.filter(o => o.status === id);
        const titleColors: Record<string, string> = {
            gray: 'text-gray-500',
            red: 'text-red-600',
            green: 'text-green-700',
            blue: 'text-blue-700',
            purple: 'text-purple-700'
        };

        return (
            <div className="flex flex-col min-w-[280px]">
                <div className="flex justify-between items-center mb-4 px-2">
                    <h2 className={cn("font-bold uppercase text-[10px] tracking-widest", titleColors[color])}>{title}</h2>
                    <span className="bg-gray-200 text-gray-700 text-[10px] px-2 py-0.5 rounded-full">
                        {columnOrders.length}
                    </span>
                </div>
                <div
                    id={id}
                    className="min-h-[70vh] bg-gray-100 p-2 rounded-xl flex-1 border-2 border-dashed border-transparent transition-colors"
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={(e) => onDrop(e, id)}
                >
                    {columnOrders.map(order => (
                        <KanbanCard key={order.id} order={order} />
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="bg-gray-50 min-h-screen font-sans">
            {/* Header & Tabs */}
            <header className="bg-white shadow-sm sticky top-0 z-40">
                <div className="max-w-full px-6 py-4 flex flex-wrap justify-between items-center border-b gap-4">
                    <h1 className="text-xl font-bold text-blue-800 flex items-center">
                        <RefreshCcw className="mr-2 h-5 w-5" /> WORKFLOW 360
                    </h1>
                    <div className="flex space-x-6 overflow-x-auto pb-1">
                        {[
                            { id: 'sales', label: 'A. Sales' },
                            { id: 'tech', label: 'B. Kỹ thuật' },
                            { id: 'after', label: 'C. After-sale' },
                            { id: 'care', label: 'D. Chăm sóc/Bảo hành' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={cn(
                                    "pb-2 px-1 transition-all uppercase text-[10px] tracking-widest whitespace-nowrap",
                                    activeTab === tab.id ? "border-b-3 border-blue-800 text-blue-800 font-bold" : "text-gray-400 hover:text-blue-600"
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center space-x-4">
                        <Button onClick={() => navigate('/orders/new')} className="bg-blue-600 hover:bg-blue-700 h-9">
                            <Plus className="mr-1 h-4 w-4" /> Tạo đơn
                        </Button>
                    </div>
                </div>
            </header>

            {/* Main Board */}
            <main className="p-6">
                {activeTab === 'sales' && (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
                        <KanbanColumn id="step1" title="1. Nhận đồ" />
                        <KanbanColumn id="step2" title="2. Gắn Tag" />
                        <KanbanColumn id="step3" title="3. Trao đổi KT" />
                        <KanbanColumn id="step4" title="4. Phê duyệt" color="red" />
                        <KanbanColumn id="step5" title="5. Chốt đơn" color="green" />
                    </div>
                )}

                {activeTab === 'tech' && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 overflow-x-auto pb-4">
                        <KanbanColumn id="tech1" title="Phòng Mạ" color="blue" />
                        <KanbanColumn id="tech2" title="Dán đế" color="blue" />
                        <KanbanColumn id="tech3" title="Phòng Da" color="blue" />
                        <KanbanColumn id="tech4" title="Kỹ Thuật Xong" color="green" />
                    </div>
                )}

                {activeTab === 'after' && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 overflow-x-auto pb-4">
                        <KanbanColumn id="after1" title="Kiểm nợ & Ảnh hoàn thiện" color="purple" />
                        <KanbanColumn id="after2" title="Đóng gói & Giao hàng" color="purple" />
                        <KanbanColumn id="after3" title="Nhắn HD & Feedback" color="purple" />
                        <KanbanColumn id="after4" title="Lưu Trữ" color="green" />
                    </div>
                )}

                {activeTab === 'care' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 overflow-x-auto pb-4">
                        {/* Warranty Section */}
                        <div className="flex flex-col min-w-[500px] border-r pr-4">
                            <h3 className="font-black text-red-600 mb-4 flex items-center tracking-tighter uppercase text-sm">
                                <Wrench className="mr-2 h-4 w-4" /> QUY TRÌNH BẢO HÀNH (Feedback Chê)
                            </h3>
                            <div className="grid grid-cols-3 gap-3">
                                <KanbanColumn id="war1" title="1. Tiếp nhận" />
                                <KanbanColumn id="war2" title="2. Xử lý" />
                                <KanbanColumn id="war3" title="3. Hoàn tất" />
                            </div>
                        </div>
                        {/* Care Section */}
                        <div className="flex flex-col min-w-[500px]">
                            <h3 className="font-black text-teal-600 mb-4 flex items-center tracking-tighter uppercase text-sm">
                                <Heart className="mr-2 h-4 w-4" /> QUY TRÌNH CHĂM SÓC (Feedback Khen)
                            </h3>
                            <div className="grid grid-cols-3 gap-3">
                                <KanbanColumn id="care6" title="Mốc 6 Tháng" />
                                <KanbanColumn id="care12" title="Mốc 12 Tháng" />
                                <KanbanColumn id="care-custom" title="Lịch Riêng" />
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Modal: Details */}
            <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
                <DialogContent className="max-w-6xl p-0 overflow-hidden max-h-[92vh] flex flex-col md:flex-row border-none shadow-2xl">
                    {selectedOrder && (
                        <>
                            {/* Left: Info */}
                            <div className="p-8 border-r w-full md:w-2/3 overflow-y-auto">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <Badge className={cn(
                                            "text-[10px] font-bold px-2 py-0.5 rounded-full mb-2 inline-block",
                                            selectedOrder.status.startsWith('tech') ? "bg-blue-100 text-blue-600 hover:bg-blue-100" :
                                                selectedOrder.status.startsWith('after') ? "bg-purple-100 text-purple-600 hover:bg-purple-100" :
                                                    "bg-orange-100 text-orange-600 hover:bg-orange-100"
                                        )}>
                                            {selectedOrder.status.startsWith('tech') ? "GIAI ĐOẠN KỸ THUẬT" :
                                                selectedOrder.status.startsWith('after') ? "GIAI ĐOẠN AFTER-SALE" :
                                                    "GIAI ĐOẠN SALES"}
                                        </Badge>
                                        <h2 className="text-3xl font-bold text-gray-800">{selectedOrder.customer}</h2>
                                    </div>
                                </div>

                                {/* AI Message Templates */}
                                <div className="mb-8 p-5 bg-blue-50 border border-blue-100 rounded-2xl">
                                    <h3 className="text-xs font-bold text-blue-800 uppercase tracking-widest mb-4 flex items-center">
                                        <Bot className="mr-2 h-4 w-4" /> AI Agent: Tin nhắn mẫu cho Sale (Facebook Inbox)
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        {[
                                            { id: 'ship', title: '1. Xin địa chỉ Ship', sub: '"Chào anh, giày đã đóng gói..."' },
                                            { id: 'care', title: '2. HD Bảo quản', sub: '"Gửi anh HDSD sau khi mạ..."' },
                                            { id: 'feedback', title: '3. Xin Feedback', sub: '"Anh đã nhận được đồ chưa ạ..."' }
                                        ].map(tmp => (
                                            <button
                                                key={tmp.id}
                                                onClick={() => copyTemplate(tmp.id as any)}
                                                className="bg-white p-3 rounded-xl border border-blue-200 hover:shadow-md transition text-left group relative"
                                            >
                                                <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">{tmp.title}</p>
                                                <p className="text-[10px] text-gray-500 line-clamp-1 italic">{tmp.sub}</p>
                                                <Copy className="absolute bottom-3 right-3 h-4 w-4 text-blue-300 group-hover:text-blue-600" />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Feedback Action Area */}
                                {selectedOrder.status === 'after3' && (
                                    <div className="mb-8 p-6 bg-purple-50 rounded-2xl border border-purple-100">
                                        <h3 className="text-xs font-bold text-purple-800 uppercase mb-4 tracking-widest">Xử lý Feedback khách hàng</h3>
                                        <div className="flex space-x-4">
                                            <Button
                                                onClick={() => processFeedback('positive')}
                                                className="flex-1 bg-green-600 hover:bg-green-700 h-14 text-white font-bold rounded-xl shadow-lg"
                                            >
                                                <ThumbsUp className="mr-2 h-5 w-5" /> KHÁCH KHEN (Sang Chăm Sóc)
                                            </Button>
                                            <Button
                                                onClick={() => processFeedback('negative')}
                                                className="flex-1 bg-red-600 hover:bg-red-700 h-14 text-white font-bold rounded-xl shadow-lg"
                                            >
                                                <ThumbsDown className="mr-2 h-5 w-5" /> KHÁCH CHÊ (Sang Bảo Hành)
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 text-sm">
                                    <div className="p-5 bg-gray-50 rounded-xl border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Thông số đơn hàng</p>
                                        <p className="font-bold text-gray-800 mt-1">{selectedOrder.service} - {selectedOrder.item}</p>
                                        <p className="text-blue-600 font-black mt-2 text-xl">{(selectedOrder.price || 0).toLocaleString()} VNĐ</p>
                                        <div className="mt-3 pt-3 border-t">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mb-1">Thông số SLA</p>
                                            <p className="font-medium text-gray-700 flex items-center">
                                                {selectedOrder.sla} <Badge variant="outline" className="ml-2 bg-blue-50 text-blue-600 border-blue-100">{getSLADisplay(selectedOrder.sla)}</Badge>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="p-5 bg-gray-50 rounded-xl border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Trạng thái công nợ</p>
                                        <p className="font-bold mt-1 text-green-600 text-lg">Đã thanh toán 100%</p>
                                        <div className="mt-3 pt-3 border-t">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mb-1">Phụ trách</p>
                                            <p className="text-xs text-gray-600">Sale: <span className="font-bold">{selectedOrder.saleName}</span></p>
                                            <p className="text-xs text-gray-600 mt-1">Kỹ thuật: <span className="font-bold">{selectedOrder.techName}</span></p>
                                        </div>
                                    </div>
                                </div>

                                <h3 className="font-bold text-gray-700 text-sm mb-6 flex items-center uppercase tracking-widest">
                                    <History className="mr-2 h-5 w-5 text-blue-500" /> Toàn bộ lịch trình
                                </h3>
                                <div className="relative space-y-6 pl-4 border-l-2 border-gray-100 py-1">
                                    {selectedOrder.history.map((h, i) => (
                                        <div key={i} className="flex items-start mb-4 relative">
                                            <div className={cn(
                                                "absolute -left-[25px] flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white border-4 border-white z-10 text-[10px]",
                                                h.type === 'sales' ? 'bg-orange-500' :
                                                    h.type === 'tech' ? 'bg-blue-500' :
                                                        h.type === 'after' ? 'bg-purple-500' :
                                                            h.type === 'alert' ? 'bg-red-600' : 'bg-gray-400'
                                            )}>
                                                <Check className="h-3 w-3" />
                                            </div>
                                            <div className="ml-5 flex-1 bg-white p-4 rounded-xl border border-gray-100 shadow-sm transition-hover hover:shadow-md">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{h.time}</span>
                                                    <span className="text-[9px] font-bold text-blue-500 uppercase">{h.user}</span>
                                                </div>
                                                <p className="text-xs font-bold text-gray-800">{h.action}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Right: Secondary Info */}
                            <div className="p-8 bg-gray-50/50 w-full md:w-1/3 overflow-y-auto">
                                <div className="mb-6">
                                    <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-4 tracking-widest">Công cụ kỹ thuật</h4>
                                    <div className="grid grid-cols-1 gap-3">
                                        <Button variant="outline" className="w-full justify-start h-12 text-xs font-bold hover:border-red-400 hover:text-red-500 transition-all border-gray-200 bg-white">
                                            <ArrowUp className="mr-2 h-4 w-4 text-red-500" /> Đề xuất nâng dịch vụ
                                        </Button>
                                        <Button variant="outline" className="w-full justify-start h-12 text-xs font-bold hover:border-orange-400 hover:text-orange-500 transition-all border-gray-200 bg-white">
                                            <CalendarPlus className="mr-2 h-4 w-4 text-orange-500" /> Xin gia hạn (Trễ KPI)
                                        </Button>
                                    </div>
                                </div>

                                {selectedOrder.isChangeRequested && (
                                    <div className="p-5 bg-red-50 border border-red-100 rounded-2xl mb-6 shadow-sm">
                                        <p className="text-[10px] font-bold text-red-800 uppercase flex items-center mb-2">
                                            <Timer className="mr-2 h-3 w-3" /> Liên kết bảo hành
                                        </p>
                                        <p className="text-xs text-red-700 font-medium italic">Có một yêu cầu thay đổi dịch vụ đang chờ xử lý.</p>
                                    </div>
                                )}

                                <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm mt-8">
                                    <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-4 tracking-widest">Ghi chú nhanh</h4>
                                    <Textarea placeholder="Thêm ghi chú..." className="text-xs bg-gray-50/50 border-none outline-none focus:ring-1 focus:ring-blue-100 h-32" />
                                    <Button className="w-full mt-4 h-9 text-xs bg-gray-800 hover:bg-black">Lưu ghi chú</Button>
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Modal: Move Back Reason */}
            <Dialog open={moveBackModalOpen} onOpenChange={setMoveBackModalOpen}>
                <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl">
                    <div className="bg-orange-500 p-4 text-white font-bold uppercase text-xs tracking-widest">Lý do lùi trạng thái</div>
                    <div className="p-8">
                        <Textarea
                            className="w-full border rounded-xl p-4 h-32 text-sm mb-6 focus:ring-orange-200 border-gray-100 bg-gray-50/50"
                            placeholder="Nhập lý do chi tiết để chuyển bộ phận..."
                            value={moveBackData?.reason || ''}
                            onChange={(e) => setMoveBackData(prev => prev ? { ...prev, reason: e.target.value } : null)}
                        />
                        <Button
                            onClick={submitMoveBack}
                            className="w-full bg-orange-500 hover:bg-orange-600 text-white h-12 rounded-xl font-bold uppercase text-sm shadow-lg shadow-orange-100"
                        >
                            Xác nhận chuyển lùi
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
