export type PrintProfile = '80mm' | '58mm';

export function getProfileWidth(profile: PrintProfile | string): number {
    return profile === '58mm' ? 30 : 42;
}

export function wrapText(text: string, width: number): string[] {
    const lines: string[] = [];
    let current = text;
    while (current.length > 0) {
        if (current.length <= width) {
            lines.push(current);
            break;
        }
        let pos = current.lastIndexOf(' ', width);
        if (pos <= 0) pos = width;
        lines.push(current.substring(0, pos).trim());
        current = current.substring(pos).trim();
    }
    return lines;
}

export function centerText(text: string, width: number): string {
    const lines = wrapText(text, width);
    return lines.map(line => {
        const padding = Math.floor((width - line.length) / 2);
        return ' '.repeat(Math.max(0, padding)) + line + ' '.repeat(Math.max(0, width - line.length - padding));
    }).join('\n');
}

export function formatItemLine(qty: string | number, name: string, priceText: string, width: number): string {
    // Professional POS format:
    // Product Name (wrapped)
    //   Qty x Price               Total
    
    // We don't have UnitPrice here, but we can just show:
    // Product Name (wrapped)
    //   Qty units               $Total
    
    const lines = wrapText(name, width - 2); // 2 spaces indent
    let result = '';
    lines.forEach(line => {
        result += line + '\n';
    });

    const qtyStr = `${qty} uni.`;
    const padding = width - qtyStr.length - priceText.length;
    const spaces = padding > 0 ? ' '.repeat(padding) : ' ';
    
    result += `${qtyStr}${spaces}${priceText}`;
    return result;
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
