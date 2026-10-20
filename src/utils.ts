export function splitIdentifier(str: string): string[] {
    const rx = /[A-Z]{1,}(?=[A-Z][a-z]|$)|[A-Z]?[a-z]+|[A-Z]+|\d+|_|-/g;
    return Array.from(str.matchAll(rx))
        .map(m => m[0])
        .filter(part => part !== '_' && part !== '-');
}

export function toTitleCase(str: string): string {
    const allCaps = str.toUpperCase() === str;
    const parts = splitIdentifier(str);
    const excludedWords = ['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'nor', 'of', 'off', 'on', 'or', 'per', 'so', 'the', 'to', 'up', 'via', 'yet'];
    return parts
        .map((part, i) => {
            if (!allCaps && part.toUpperCase() === part)
                return part;
            const lowerPart = part.toLowerCase();

            if (i && excludedWords.includes(lowerPart)) {
                return lowerPart;
            } else {
                return lowerPart.charAt(0).toUpperCase() + lowerPart.slice(1);
            }
        })
        .join(' ');
}
