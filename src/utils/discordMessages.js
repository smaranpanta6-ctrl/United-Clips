export function splitDiscordText(value, limit = 1900) {
    let remaining = String(value || '');
    const chunks = [];
    while (remaining.length > limit) {
        const newline = remaining.lastIndexOf('\n', limit - 1);
        let end = newline > 0 ? newline + 1 : limit;
        // Do not split an emoji's UTF-16 surrogate pair.
        if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
        chunks.push(remaining.slice(0, end));
        remaining = remaining.slice(end);
    }
    if (remaining) chunks.push(remaining);
    return chunks;
}

export async function sendDiscordText(channel, payload) {
    const { content, ...extras } = payload;
    const chunks = splitDiscordText(content);
    let message;
    for (let index = 0; index < chunks.length; index++) {
        message = await channel.send({
            content: chunks[index],
            ...(index === chunks.length - 1 ? extras : {}),
            allowedMentions: { parse: [] }
        });
    }
    return message;
}
