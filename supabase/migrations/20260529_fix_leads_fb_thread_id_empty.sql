-- Empty fb_thread_id must be NULL so unique index allows multiple leads without thread id
UPDATE leads
SET fb_thread_id = NULL
WHERE fb_thread_id IS NOT NULL AND btrim(fb_thread_id) = '';
