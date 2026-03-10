export type PrintProfile = '80mm' | '58mm';

export function getProfileWidth(profile: PrintProfile | string): number {
    return profile === '58mm' ? 30 : 42;
}

export function centerText(text: string, width: number): string {
    if (text.length >= width) return text.substring(0, width);
    const padding = Math.floor((width - text.length) / 2);
    return ' '.repeat(padding) + text + ' '.repeat(width - text.length - padding);
}

export function formatItemLine(qty: string | number, name: string, priceText: string, width: number): string {
    // Format: " 1x Product Name ...... $10.00"
    const qtyStr = String(qty).padStart(2, ' ') + 'x ';
    const priceLen = priceText.length;

    // space needed: qty space + price space + 1 space before price
    const availableSpace = width - qtyStr.length - priceLen - 1;

    let finalName = name;
    let dots = '';

    if (name.length > availableSpace) {
        // Truncate name and add "."
        finalName = name.substring(0, availableSpace) + '.';
    } else {
        finalName = name;
        dots = '.'.repeat(availableSpace - name.length);
    }

    return `${qtyStr}${finalName}${dots} ${priceText}`;
}

export function divider(width: number, char: string = '-'): string {
    return char.repeat(width);
}

export function formatTotalLine(label: string, totalText: string, width: number): string {
    const padding = width - label.length - totalText.length;
    const spaces = padding > 0 ? ' '.repeat(padding) : ' ';
    return `${label}${spaces}${totalText}`;
}

export function formatKeyValueLine(key: string, value: string, width: number): string {
    const padding = width - key.length - value.length;
    const spaces = padding > 0 ? ' '.repeat(padding) : ' ';
    return `${key}${spaces}${value}`;
}
