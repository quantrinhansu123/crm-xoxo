// Helper functions for number formatting

export const formatNumber = (value: number): string => {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

export const parseNumber = (value: string): number => {
    const cleaned = value.replace(/\./g, '');
    return cleaned === '' ? 0 : parseInt(cleaned, 10);
};
