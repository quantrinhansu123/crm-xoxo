import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest, requireManager } from '../middleware/auth.js';

const router = Router();

// Get all products
router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { category, status, search } = req.query;

        let query = supabaseAdmin
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });

        if (category) query = query.eq('category', category);
        if (status) query = query.eq('status', status);
        if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);

        const { data: products, error } = await query;

        if (error) {
            throw new ApiError('Lỗi khi lấy danh sách sản phẩm', 500);
        }

        res.json({
            status: 'success',
            data: { products },
        });
    } catch (error) {
        next(error);
    }
});

// Get product by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { data: product, error } = await supabaseAdmin
            .from('products')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !product) {
            throw new ApiError('Không tìm thấy sản phẩm', 404);
        }

        res.json({
            status: 'success',
            data: { product },
        });
    } catch (error) {
        next(error);
    }
});

// Create product
router.post('/', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { name, category, price, cost, unit, description, stock } = req.body;

        if (!name || !price) {
            throw new ApiError('Tên và giá sản phẩm là bắt buộc', 400);
        }

        // Auto-generate product code if not provided
        let code = req.body.code;
        if (!code) {
            // Get the latest product to generate next code
            const { data: latestProduct } = await supabaseAdmin
                .from('products')
                .select('code')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (latestProduct && latestProduct.code) {
                // Extract number from code (e.g., SP001 -> 1)
                const match = latestProduct.code.match(/\d+$/);
                const nextNum = match ? parseInt(match[0]) + 1 : 1;
                code = `SP${String(nextNum).padStart(3, '0')}`;
            } else {
                code = 'SP001';
            }
        }

        const { data: product, error } = await supabaseAdmin
            .from('products')
            .insert({
                code,
                name,
                category,
                price,
                cost,
                unit: unit || 'cái',
                description,
                stock: stock || 0,
                image: req.body.image || null,
                commission_sale: req.body.commission_sale || 0,
                commission_tech: req.body.commission_tech || 0,
                status: 'active',
                created_by: req.user!.id,
            })
            .select()
            .single();

        if (error) {
            throw new ApiError('Lỗi khi tạo sản phẩm: ' + error.message, 500);
        }

        res.status(201).json({
            status: 'success',
            data: { product },
        });
    } catch (error) {
        next(error);
    }
});

// Update product
router.put('/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;
        const updateFields = req.body;
        
        const { data: product, error } = await supabaseAdmin
            .from('products')
            .update({ ...updateFields, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select();

        if (error) {
            throw new ApiError('Lỗi khi cập nhật sản phẩm: ' + error.message, 500);
        }

        if (!product || product.length === 0) {
            throw new ApiError('Không tìm thấy sản phẩm để cập nhật', 404);
        }

        res.json({
            status: 'success',
            data: { product: product[0] },
        });
    } catch (error) {
        next(error);
    }
});

// Delete product (soft delete)
router.delete('/:id', authenticate, requireManager, async (req: AuthenticatedRequest, res, next) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('products')
            .update({ status: 'inactive', updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            throw new ApiError('Lỗi khi xóa sản phẩm', 500);
        }

        res.json({
            status: 'success',
            message: 'Đã vô hiệu hóa sản phẩm',
        });
    } catch (error) {
        next(error);
    }
});

export { router as productsRouter };
