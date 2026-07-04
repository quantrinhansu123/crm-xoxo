-- Migration: Add repeat_days and end_date to work_schedules
ALTER TABLE public.work_schedules ADD COLUMN IF NOT EXISTS repeat_days int[] DEFAULT '{}';
ALTER TABLE public.work_schedules ADD COLUMN IF NOT EXISTS end_date date;
