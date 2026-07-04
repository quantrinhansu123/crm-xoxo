import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from './errorHandler.js';

export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
        name: string;
    };
}

export const authenticate = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new ApiError('Không có token xác thực', 401);
        }

        const token = authHeader.split(' ')[1];

        try {
            const decoded = jwt.verify(token, config.jwt.secret) as {
                userId: string;
                email: string;
                role: string;
                name: string;
            };

            req.user = {
                id: decoded.userId,
                email: decoded.email,
                role: decoded.role,
                name: decoded.name,
            };

            next();
        } catch (jwtError) {
            throw new ApiError('Token không hợp lệ hoặc đã hết hạn', 401);
        }
    } catch (error) {
        next(error);
    }
};

// Middleware kiểm tra quyền theo role
export const authorize = (...roles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return next(new ApiError('Chưa đăng nhập', 401));
        }

        if (!roles.includes(req.user.role)) {
            return next(new ApiError('Không có quyền truy cập', 403));
        }

        next();
    };
};

// Middleware kiểm tra quyền quản lý
export const requireManager = authorize('manager', 'admin');

// Middleware kiểm tra quyền kế toán
export const requireAccountant = authorize('accountant', 'manager', 'admin');

// Middleware kiểm tra quyền sale hoặc cao hơn
export const requireSale = authorize('sale', 'manager', 'admin');

// Middleware kiểm tra quyền kỹ thuật hoặc cao hơn
export const requireTech = authorize('tech', 'manager', 'admin');
