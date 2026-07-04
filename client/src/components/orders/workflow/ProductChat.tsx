import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Send, User, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { api, productChatsApi, usersApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { formatDateTime, cn } from '@/lib/utils';
import { uploadFile } from '@/lib/supabase';
import { toast } from 'sonner';

interface UserInfo {
    id: string;
    name: string;
    avatar?: string;
    role?: string;
}

interface Message {
    id: string;
    content: string;
    sender_id: string;
    created_at: string;
    image_url?: string;
    mentions?: string[];
    sender?: {
        id: string;
        name: string;
        avatar?: string;
    };
}

interface ProductChatProps {
    orderId: string;
    entityId: string;
    entityType: 'order_product' | 'order_item';
    roomId: string;
    currentUserId?: string;
    highlightMessageId?: string;
}

/**
 * All steps share a single unified chat room per product.
 * This ensures chat history is synchronized across all steps
 * (sales, workflow, aftersale, care/warranty).
 */
function getChatRoomId(_roomId: string): string {
    return 'unified';
}

/** Strip Vietnamese diacritics so 'dung' matches 'Dũng', 'huong' matches 'Hương', etc. */
function normalizeVn(str: string): string {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

export function ProductChat({ orderId, entityId, entityType, roomId, currentUserId, highlightMessageId }: ProductChatProps) {
    // Use normalized chatRoomId for message operations (fetch/send/subscribe)
    // Keep original roomId for display purposes
    const chatRoomId = getChatRoomId(roomId);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // Mentions state
    const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
    const [mentionSearch, setMentionSearch] = useState('');
    const [showMentionList, setShowMentionList] = useState(false);
    const [mentionAnchor, setMentionAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
    const [cursorPosition, setCursorPosition] = useState(0);
    const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [highlightedId, setHighlightedId] = useState<string | undefined>(undefined);

    const fetchMessages = async (showLoading = false) => {
        if (showLoading) setLoading(true);
        try {
            const response = await productChatsApi.getMessages(entityId, chatRoomId);
            if (response.data?.data) {
                setMessages(response.data.data);
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
            toast.error('Không thể tải tin nhắn');
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const response = await usersApi.getMentionable();
            const users = response.data?.data?.users;
            if (Array.isArray(users) && users.length > 0) {
                setAllUsers(users);
                return;
            }
        } catch (error) {
            console.error('Error fetching mentionable users:', error);
        }

        try {
            const [techRes, salesRes] = await Promise.all([
                api.get('/users/technicians'),
                api.get('/users/sales'),
            ]);
            const merged = [
                ...(techRes.data?.data?.users ?? []),
                ...(salesRes.data?.data?.users ?? []),
            ] as UserInfo[];
            const byId = new Map<string, UserInfo>();
            merged.forEach((u) => byId.set(u.id, u));
            setAllUsers([...byId.values()]);
        } catch (fallbackErr) {
            console.error('Fallback mention users failed:', fallbackErr);
        }
    };

    const updateMentionAnchor = useCallback(() => {
        if (!inputRef.current) return;
        const rect = inputRef.current.getBoundingClientRect();
        setMentionAnchor({
            top: rect.top,
            left: rect.left,
            width: rect.width,
        });
    }, []);

    const filteredMentionUsers = allUsers.filter((u) =>
        normalizeVn(u.name).includes(normalizeVn(mentionSearch))
    );

    useEffect(() => {
        fetchMessages(true);
        fetchUsers();

        // Subscribe to real-time updates for this product and room
        console.log('Subscribing to realtime for:', entityId, chatRoomId);
        const channel = supabase
            .channel(`product_chat:${entityId}:${chatRoomId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'product_chat_messages',
                    filter: `entity_id=eq.${entityId}`
                },
                (payload) => {
                    console.log('Realtime message received:', payload);
                    const newMsg = payload.new as any;
                    // Only process if it belongs to the current chat room (normalized section)
                    if (newMsg.room_id === chatRoomId) {
                        // Refresh the messages to get joined sender info
                        fetchMessages();
                    }
                }
            )
            .subscribe((status) => {
                console.log('Realtime subscription status:', status);
                if (status === 'CHANNEL_ERROR') {
                    console.error('Realtime channel error - falling back to polling');
                }
            });

        // Polling fallback every 5 seconds (safety measure)
        const interval = setInterval(() => fetchMessages(), 5000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(interval);
        };
    }, [entityId, chatRoomId]);

    useEffect(() => {
        if (scrollRef.current) {
            const viewport = scrollRef.current.closest('[data-radix-scroll-area-viewport]');
            if (viewport) {
                viewport.scrollTop = viewport.scrollHeight;
            } else {
                scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [messages]);

    // Scroll to and flash highlight the target message from notification
    useEffect(() => {
        if (!highlightMessageId || !messages.length) return;
        const el = messageRefs.current[highlightMessageId];
        if (el) {
            // Small delay so the dialog finishes opening
            setTimeout(() => {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setHighlightedId(highlightMessageId);
                // Remove highlight after animation (2 flashes × ~600ms each)
                setTimeout(() => setHighlightedId(undefined), 1400);
            }, 400);
        }
    }, [highlightMessageId, messages]);

    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Vui lòng chọn file hình ảnh');
            return;
        }

        setIsUploading(true);
        try {
            const { url, error } = await uploadFile('products', 'chat-attachments', file);
            if (error) {
                toast.error('Lỗi khi tải lên hình ảnh');
                return;
            }
            setSelectedImage(url);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const syncMentionState = (value: string, caret: number) => {
        setCursorPosition(caret);
        const textBeforeCursor = value.substring(0, caret);
        const lastAt = textBeforeCursor.lastIndexOf('@');

        if (lastAt !== -1) {
            const search = textBeforeCursor.substring(lastAt + 1);
            const isAtStartOrAfterSpace = lastAt === 0 || textBeforeCursor[lastAt - 1] === ' ';

            if (isAtStartOrAfterSpace && !search.includes(' ')) {
                setMentionSearch(search);
                setShowMentionList(true);
                setSelectedMentionIndex(0);
                updateMentionAnchor();
                return;
            }
        }

        setShowMentionList(false);
        setMentionAnchor(null);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const caret = e.target.selectionStart || 0;
        setNewMessage(value);
        syncMentionState(value, caret);
    };

    const handleMentionSelect = (user: UserInfo) => {
        const textBeforeCursor = newMessage.substring(0, cursorPosition);
        const textAfterCursor = newMessage.substring(cursorPosition);
        const lastAt = textBeforeCursor.lastIndexOf('@');
        if (lastAt === -1) return;

        const newText = `${textBeforeCursor.substring(0, lastAt)}@${user.name} ${textAfterCursor}`;
        const newCursorPos = lastAt + user.name.length + 2;

        setNewMessage(newText);
        setShowMentionList(false);
        setMentionAnchor(null);
        setCursorPosition(newCursorPos);

        setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!newMessage.trim() && !selectedImage) || sending || isUploading) return;

        const mentionIds: string[] = [];
        allUsers.forEach(user => {
            if (newMessage.includes(`@${user.name}`)) {
                mentionIds.push(user.id);
            }
        });

        console.log('Mention IDs identified:', mentionIds);

        setSending(true);
        try {
        console.log('Sending message with payload:', {
            entity_id: entityId,
            entity_type: entityType,
            room_id: chatRoomId,
            content: newMessage.trim(),
            mentions: mentionIds
        });
        const response = await productChatsApi.sendMessage({
            order_id: orderId,
            entity_id: entityId,
            entity_type: entityType,
            room_id: chatRoomId,
            content: newMessage.trim(),
            image_url: selectedImage || undefined,
            mentions: mentionIds.length > 0 ? mentionIds : undefined
        });
            if (response.data?.data) {
                setMessages([...messages, response.data.data]);
                setNewMessage('');
                setSelectedImage(null);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            toast.error('Không thể gửi tin nhắn');
        } finally {
            setSending(false);
        }
    };

    const renderMessageContent = (content: string, isMe: boolean, mentions?: string[]) => {
        if (!content) return null;

        // Simple regex to find @Name
        // We'll iterate through all mentioned users to be more precise
        let parts: React.ReactNode[] = [content];

        allUsers.forEach(user => {
            const mentionStr = `@${user.name}`;
            if (content.includes(mentionStr)) {
                const newParts: React.ReactNode[] = [];
                parts.forEach(part => {
                    if (typeof part === 'string') {
                        const splitParts = part.split(mentionStr);
                        splitParts.forEach((sp, i) => {
                            newParts.push(sp);
                            if (i < splitParts.length - 1) {
                                newParts.push(
                                    isMe ? (
                                        <span key={`${user.id}-${i}`} className="font-bold text-white bg-white/25 px-1.5 py-0.5 rounded-full text-xs">
                                            {mentionStr}
                                        </span>
                                    ) : (
                                        <span key={`${user.id}-${i}`} className="font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full text-xs">
                                            {mentionStr}
                                        </span>
                                    )
                                );
                            }
                        });
                    } else {
                        newParts.push(part);
                    }
                });
                parts = newParts;
            }
        });

        return <>{parts}</>;
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p className="text-sm">Đang tải cuộc hội thoại...</p>
            </div>
        );
    }

    return (
        <>
            <style>{`
            @keyframes chatFlash {
                0%, 100% { background-color: inherit; }
                50% { background-color: rgba(250, 204, 21, 0.35); }
            }
        `}</style>
            <div className="flex flex-col flex-1 border rounded-lg bg-gray-50/50 min-h-0">
                <div className="p-3 border-b bg-white rounded-t-lg">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        Trao đổi chung - Tất cả bước
                    </h4>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y p-4">
                    <div className="space-y-4">
                        {messages.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm italic">
                                Chưa có trao đổi nào cho sản phẩm này.
                            </div>
                        ) : (
                            messages.map((msg) => {
                                const isMe = msg.sender_id === currentUserId;
                                const isHighlighted = msg.id === highlightedId;
                                return (
                                    <div
                                        key={msg.id}
                                        ref={el => { messageRefs.current[msg.id] = el; }}
                                        className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}
                                    >
                                        <Avatar className="h-8 w-8 shrink-0">
                                            <AvatarImage src={msg.sender?.avatar} />
                                            <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                                        </Avatar>
                                        <div className={`flex flex-col max-w-[80%] ${isMe ? 'items-end' : ''}`}>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[11px] font-bold text-gray-700">{msg.sender?.name}</span>
                                                <span className="text-[10px] text-gray-400">{formatDateTime(msg.created_at)}</span>
                                            </div>
                                            <div
                                                className={`p-2.5 rounded-2xl text-sm transition-all ${isMe ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-white border rounded-tl-none shadow-sm'
                                                    } ${isHighlighted ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`}
                                                style={isHighlighted ? {
                                                    animation: 'chatFlash 0.6s ease-in-out 2',
                                                } : undefined}
                                            >
                                                {msg.image_url && (
                                                    <div className="mb-2 rounded-lg overflow-hidden border bg-gray-100">
                                                        <img
                                                            src={msg.image_url}
                                                            alt="Chat attachment"
                                                            className="max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                                                            onClick={() => setPreviewImage(msg.image_url!)}
                                                        />
                                                    </div>
                                                )}
                                                {renderMessageContent(msg.content, isMe, msg.mentions)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        <div ref={scrollRef} />
                    </div>
                </div>

                {selectedImage && (
                    <div className="px-3 py-2 bg-gray-50 border-t flex items-center gap-2">
                        <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                            <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
                            <button
                                type="button"
                                onClick={() => setSelectedImage(null)}
                                className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 rounded-full hover:bg-black/70"
                            >
                                <X className="h-2.5 w-2.5 text-white" />
                            </button>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSend} className="relative z-20 p-3 bg-white border-t rounded-b-lg flex gap-2 items-center overflow-visible">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleImageSelect}
                        className="hidden"
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={sending || isUploading}
                    >
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                    </Button>
                    <div className="flex-1 relative overflow-visible">
                        {showMentionList && mentionAnchor && typeof document !== 'undefined' && createPortal(
                            <div
                                className="fixed z-[300] w-64 max-h-48 bg-white border rounded-lg shadow-2xl overflow-y-auto"
                                style={{
                                    top: mentionAnchor.top - 8,
                                    left: mentionAnchor.left,
                                    transform: 'translateY(-100%)',
                                }}
                            >
                                <div className="p-2 text-[10px] font-bold text-gray-400 border-b bg-gray-50 uppercase tracking-wider">
                                    Nhắc tên đồng nghiệp
                                </div>
                                {filteredMentionUsers.map((u, index) => (
                                    <button
                                        key={u.id}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => handleMentionSelect(u)}
                                        className={cn(
                                            'w-full text-left px-3 py-2 flex items-center gap-2 transition-colors border-b last:border-0',
                                            index === selectedMentionIndex ? 'bg-primary/10 text-primary' : 'hover:bg-primary/10'
                                        )}
                                    >
                                        <Avatar className="h-6 w-6">
                                            <AvatarImage src={u.avatar} />
                                            <AvatarFallback><User className="h-3 w-3" /></AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{u.name}</span>
                                            <span className="text-[10px] text-gray-500 uppercase">{u.role}</span>
                                        </div>
                                    </button>
                                ))}
                                {filteredMentionUsers.length === 0 && (
                                    <div className="p-4 text-center text-xs text-gray-400">
                                        {allUsers.length === 0 ? 'Đang tải danh sách nhân viên...' : 'Không tìm thấy người dùng'}
                                    </div>
                                )}
                            </div>,
                            document.body
                        )}
                        <Input
                            ref={inputRef}
                            placeholder="Nhập tin nhắn... (Gõ @ để nhắc tên)"
                            value={newMessage}
                            onChange={handleInputChange}
                            onClick={(e) => syncMentionState(newMessage, e.currentTarget.selectionStart || 0)}
                            onKeyUp={(e) => syncMentionState(newMessage, e.currentTarget.selectionStart || 0)}
                            className="w-full"
                            disabled={sending}
                            onKeyDown={(e) => {
                                if (!showMentionList) return;

                                if (e.key === 'Escape') {
                                    setShowMentionList(false);
                                    setMentionAnchor(null);
                                    return;
                                }

                                if (e.key === 'ArrowDown' && filteredMentionUsers.length > 0) {
                                    e.preventDefault();
                                    setSelectedMentionIndex((prev) => (prev + 1) % filteredMentionUsers.length);
                                } else if (e.key === 'ArrowUp' && filteredMentionUsers.length > 0) {
                                    e.preventDefault();
                                    setSelectedMentionIndex((prev) =>
                                        prev <= 0 ? filteredMentionUsers.length - 1 : prev - 1
                                    );
                                } else if ((e.key === 'Enter' || e.key === 'Tab') && filteredMentionUsers.length > 0) {
                                    e.preventDefault();
                                    handleMentionSelect(filteredMentionUsers[selectedMentionIndex]);
                                }
                            }}
                        />
                    </div>
                    <Button type="submit" size="icon" disabled={(!newMessage.trim() && !selectedImage) || sending || isUploading}>
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                </form>

                <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
                    <DialogContent className="max-w-4xl p-0 overflow-hidden bg-transparent border-none shadow-none flex items-center justify-center">
                        <DialogTitle className="sr-only">Xem ảnh</DialogTitle>
                        {previewImage && (
                            <img
                                src={previewImage}
                                alt="Full preview"
                                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl bg-white"
                            />
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </>
    );
}
