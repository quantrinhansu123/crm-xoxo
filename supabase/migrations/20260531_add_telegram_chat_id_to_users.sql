-- Telegram Chat ID for bot / n8n notifications
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

COMMENT ON COLUMN public.users.telegram_chat_id IS 'Telegram chat/user ID for bot notifications';

-- Normalize blank values
UPDATE public.users
SET telegram_chat_id = NULL
WHERE telegram_chat_id IS NOT NULL AND btrim(telegram_chat_id) = '';

-- Clear duplicate Telegram IDs (keep earliest account per ID)
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY btrim(telegram_chat_id)
            ORDER BY created_at NULLS LAST, id
        ) AS rn
    FROM public.users
    WHERE telegram_chat_id IS NOT NULL AND btrim(telegram_chat_id) <> ''
)
UPDATE public.users u
SET telegram_chat_id = NULL
FROM ranked r
WHERE u.id = r.id AND r.rn > 1;

-- One Telegram ID per employee (NULL and empty allowed)
CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_chat_id_unique
ON public.users (telegram_chat_id)
WHERE telegram_chat_id IS NOT NULL AND btrim(telegram_chat_id) <> '';
