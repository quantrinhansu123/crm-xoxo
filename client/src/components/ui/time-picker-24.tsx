import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimePicker24Props {
    value: string;            // "HH:MM" format
    onChange: (value: string) => void;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function TimePicker24({ value, onChange, disabled, placeholder = 'HH:MM', className }: TimePicker24Props) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const hourListRef = useRef<HTMLDivElement>(null);
    const minuteListRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    const [hour, minute] = (value || '').split(':');
    const selectedHour = hour || '';
    const selectedMinute = minute || '';

    // Calculate position
    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        setPos({
            top: rect.bottom + 4,
            left: rect.left,
        });
    }, []);

    useEffect(() => {
        if (open) updatePosition();
    }, [open, updatePosition]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                triggerRef.current && !triggerRef.current.contains(target) &&
                dropdownRef.current && !dropdownRef.current.contains(target)
            ) {
                setOpen(false);
            }
        };
        // Use timeout to avoid conflicts with Radix Dialog event handlers
        const id = setTimeout(() => {
            document.addEventListener('mousedown', handler, true);
        }, 0);
        return () => {
            clearTimeout(id);
            document.removeEventListener('mousedown', handler, true);
        };
    }, [open]);

    // Reposition on scroll
    useEffect(() => {
        if (!open) return;
        const handler = () => updatePosition();
        window.addEventListener('scroll', handler, true);
        window.addEventListener('resize', handler);
        return () => {
            window.removeEventListener('scroll', handler, true);
            window.removeEventListener('resize', handler);
        };
    }, [open, updatePosition]);

    // Scroll to selected values
    useEffect(() => {
        if (!open) return;
        requestAnimationFrame(() => {
            if (hourListRef.current && selectedHour) {
                const el = hourListRef.current.querySelector(`[data-hour="${selectedHour}"]`);
                el?.scrollIntoView({ block: 'center', behavior: 'instant' });
            }
            if (minuteListRef.current && selectedMinute) {
                const el = minuteListRef.current.querySelector(`[data-minute="${selectedMinute}"]`);
                el?.scrollIntoView({ block: 'center', behavior: 'instant' });
            }
        });
    }, [open, selectedHour, selectedMinute]);

    const handleHourClick = useCallback((h: string) => {
        onChange(`${h}:${selectedMinute || '00'}`);
    }, [onChange, selectedMinute]);

    const handleMinuteClick = useCallback((m: string) => {
        onChange(`${selectedHour || '00'}:${m}`);
    }, [onChange, selectedHour]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let v = e.target.value.replace(/[^0-9:]/g, '');
        if (v.length === 2 && !v.includes(':')) v += ':';
        if (v.length > 5) v = v.slice(0, 5);
        onChange(v);
    };

    const toggleOpen = () => {
        if (!disabled) setOpen(prev => !prev);
    };

    // Stop all events from reaching the Radix Dialog overlay
    const stopPropagation = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    };

    return (
        <>
            {/* Trigger */}
            <div ref={triggerRef} className={cn("relative inline-flex", className)}>
                <div
                    className={cn(
                        "flex items-center gap-2 h-[36px] px-3 border border-gray-200 rounded-lg bg-gray-50 transition-colors",
                        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-gray-300",
                        open && "border-blue-400 ring-1 ring-blue-100"
                    )}
                    onClick={toggleOpen}
                >
                    <input
                        type="text"
                        value={value}
                        onChange={handleInputChange}
                        placeholder={placeholder}
                        maxLength={5}
                        disabled={disabled}
                        className={cn(
                            "w-[48px] text-[13px] font-semibold text-gray-800 bg-transparent outline-none text-center placeholder:text-gray-400 placeholder:font-normal",
                            disabled && "cursor-not-allowed"
                        )}
                        onClick={e => { e.stopPropagation(); if (!disabled) setOpen(true); }}
                    />
                    <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </div>
            </div>

            {/* Dropdown via Portal - rendered outside dialog to avoid clipping */}
            {open && !disabled && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
                    style={{
                        top: pos.top,
                        left: pos.left,
                        zIndex: 99999,
                        pointerEvents: 'auto',
                    }}
                    onMouseDown={stopPropagation}
                    onClick={stopPropagation}
                    onPointerDown={stopPropagation}
                >
                    <div className="flex">
                        {/* Hours */}
                        <div
                            ref={hourListRef}
                            className="w-[56px] h-[200px] overflow-y-auto border-r border-gray-100 py-2"
                            style={{ scrollbarWidth: 'thin', overscrollBehavior: 'contain' }}
                            onWheel={e => e.stopPropagation()}
                        >
                            {HOURS.map(h => (
                                <button
                                    key={h}
                                    data-hour={h}
                                    type="button"
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={e => { e.stopPropagation(); handleHourClick(h); }}
                                    className={cn(
                                        "w-full py-1.5 text-[13px] font-medium text-center transition-colors cursor-pointer",
                                        selectedHour === h
                                            ? "bg-blue-600 text-white"
                                            : "text-gray-700 hover:bg-blue-50"
                                    )}
                                >
                                    {h}
                                </button>
                            ))}
                        </div>

                        {/* Minutes */}
                        <div
                            ref={minuteListRef}
                            className="w-[56px] h-[200px] overflow-y-auto py-2"
                            style={{ scrollbarWidth: 'thin', overscrollBehavior: 'contain' }}
                            onWheel={e => e.stopPropagation()}
                        >
                            {MINUTES.map(m => (
                                <button
                                    key={m}
                                    data-minute={m}
                                    type="button"
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={e => { e.stopPropagation(); handleMinuteClick(m); }}
                                    className={cn(
                                        "w-full py-1.5 text-[13px] font-medium text-center transition-colors cursor-pointer",
                                        selectedMinute === m
                                            ? "bg-blue-600 text-white"
                                            : "text-gray-700 hover:bg-blue-50"
                                    )}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
