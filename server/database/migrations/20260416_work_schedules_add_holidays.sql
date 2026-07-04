-- Migration: Add work_on_holidays to work_schedules
ALTER TABLE public.work_schedules ADD COLUMN IF NOT EXISTS work_on_holidays boolean DEFAULT false;
