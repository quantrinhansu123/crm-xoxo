import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '@/lib/api';
import type { User, UserRole } from '@/types';

interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    updateUser: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const applyUserFromApi = useCallback((userData: Record<string, unknown>) => {
        const mappedUser: User = {
            id: userData.id as string,
            email: userData.email as string,
            name: userData.name as string,
            role: userData.role as UserRole,
            avatar: userData.avatar as string | undefined,
            phone: userData.phone as string | undefined,
            department: userData.department as string | undefined,
            allowed_views: (userData.allowed_views as string[] | null | undefined) ?? null,
            view_actions: (userData.view_actions as User['view_actions']) ?? null,
            uses_role_defaults:
                (userData.uses_role_defaults as boolean | undefined) ?? userData.allowed_views == null,
        };
        setUser(mappedUser);
        localStorage.setItem('user', JSON.stringify(mappedUser));
        return mappedUser;
    }, []);

    // Load user from localStorage on mount + refresh quyền xem (chờ getMe để tránh quyền cũ trong cache)
    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            const storedToken = localStorage.getItem('token');
            const storedUser = localStorage.getItem('user');

            if (!storedToken || !storedUser) {
                if (!cancelled) setIsLoading(false);
                return;
            }

            setToken(storedToken);
            try {
                setUser(JSON.parse(storedUser));
            } catch {
                localStorage.removeItem('user');
                localStorage.removeItem('token');
                if (!cancelled) setIsLoading(false);
                return;
            }

            try {
                const res = await authApi.getMe();
                if (!cancelled && res.data?.status === 'success' && res.data.data?.user) {
                    applyUserFromApi(res.data.data.user);
                }
            } catch {
                // Giữ user cache nếu mạng lỗi tạm thời
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        void init();
        return () => {
            cancelled = true;
        };
    }, [applyUserFromApi]);

    const login = useCallback(async (email: string, password: string) => {
        setIsLoading(true);
        try {
            const response = await authApi.login(email.trim(), password);
            const payload = response.data;

            if (payload.status !== 'success' || !payload.data?.token || !payload.data?.user) {
                throw new Error(payload.message || 'Đăng nhập thất bại');
            }

            const { user: userData, token: authToken } = payload.data;

            setToken(authToken);
            localStorage.setItem('token', authToken);
            applyUserFromApi(userData);
        } finally {
            setIsLoading(false);
        }
    }, [applyUserFromApi]);

    const logout = useCallback(() => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        // Call logout API (optional, just for logging)
        authApi.logout().catch(() => { });
    }, []);

    const updateUser = useCallback((data: Partial<User>) => {
        setUser((prev) => {
            if (!prev) return null;
            const updated = { ...prev, ...data };
            localStorage.setItem('user', JSON.stringify(updated));
            return updated;
        });
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                isAuthenticated: !!user && !!token,
                isLoading,
                login,
                logout,
                updateUser,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
