import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

/**
 * Get chat messages for a product/item in a specific room
 * GET /api/product-chats/:entityId/:roomId
 */
router.get('/:entityId/:roomId', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { entityId, roomId } = req.params;

        const { data: messages, error } = await supabaseAdmin
            .from('product_chat_messages')
            .select(`
                *,
                sender:users(id, name, avatar)
            `)
            .eq('entity_id', entityId)
            .eq('room_id', roomId)
            .order('created_at', { ascending: true });

        if (error) {
            throw new ApiError('Không thể tải tin nhắn', 500);
        }

        res.json({
            status: 'success',
            data: messages
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Send a new chat message
 * POST /api/product-chats
 */
router.post('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { order_id, entity_id, entity_type, room_id, content, image_url, mentions } = req.body;
        const sender_id = req.user?.id;

        if (!entity_id || !entity_type || !room_id || (!content && !image_url)) {
            throw new ApiError('Thiếu thông tin gửi tin nhắn', 400);
        }

        const { data: message, error } = await supabaseAdmin
            .from('product_chat_messages')
            .insert({
                order_id,
                entity_id,
                entity_type,
                room_id,
                content: content || '',
                sender_id,
                image_url,
                mentions: mentions || []
            })
            .select(`
                *,
                sender:users(id, name, avatar)
            `)
            .single();

        if (error) {
            console.error('Error sending message:', error);
            throw new ApiError('Không thể gửi tin nhắn', 500);
        }

        console.log('Message sent! Payload mentions:', mentions);

        // Create notifications for mentioned users
        if (mentions && Array.isArray(mentions) && mentions.length > 0) {
            try {
                const senderName = message.sender?.name || 'Ai đó';
                const roomName = room_id.replace('_', ' ').toUpperCase();

                const notifications = mentions.map(userId => ({
                    user_id: userId,
                    type: 'mention',
                    title: 'Bạn được nhắc tên trong trao đổi',
                    message: `${senderName} đã nhắc tên bạn trong phòng ${roomName}`,
                    data: {
                        order_id: order_id || entity_id,
                        entity_id,
                        entity_type,
                        room_id,
                        message_id: message.id
                    }
                }));

                const { error: notifError } = await supabaseAdmin.from('notifications').insert(notifications);
                if (notifError) {
                    console.error('Error inserting notifications:', notifError);
                } else {
                    console.log('Notifications created successfully for:', mentions);
                }
            } catch (notifError) {
                console.error('Error creating notifications block:', notifError);
            }
        } else if (mentions) {
            console.log('Mentions was not an array or empty:', mentions);
        }

        res.json({
            status: 'success',
            data: message
        });
    } catch (error) {
        next(error);
    }
});

export default router;
