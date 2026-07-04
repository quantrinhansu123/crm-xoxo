import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
    statusCode?: number;
    status?: string;
    isOperational?: boolean;
}

export const errorHandler = (
    err: AppError,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const statusCode = err.statusCode || 500;
    const status = err.status || 'error';

    console.error('Error:', {
        message: err.message,
        stack: err.stack,
        statusCode,
    });

    res.status(statusCode).json({
        status,
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};

export class ApiError extends Error {
    statusCode: number;
    status: string;
    isOperational: boolean;

    constructor(message: string, statusCode: number = 500) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}
