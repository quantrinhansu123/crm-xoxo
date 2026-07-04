ALTER TABLE orders ADD COLUMN IF NOT EXISTS hd_sent_photos JSONB DEFAULT '[]';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS feedback_requested_photos JSONB DEFAULT '[]';
