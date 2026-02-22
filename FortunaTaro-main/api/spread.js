const { Redis } = require('@upstash/redis');

module.exports = async function handler(request, response) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (request.method === 'OPTIONS') return response.status(204).end();
    if (request.method !== 'POST') return response.status(405).end('Method Not Allowed');

    try {
        if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
            throw new Error('Redis configuration is missing.');
        }

        const redis = Redis.fromEnv();

        let body = request.body;
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
        const { initData, title, cards, text, share } = body || {};

        if (!title || !cards || !text) {
            return response.status(400).json({ ok: false, error: 'missing_fields' });
        }

        // Определяем пользователя
        const isDev = !initData || initData === 'dev_init_data';
        let userId = 123456;
        if (!isDev) {
            try {
                const userParam = new URLSearchParams(initData).get('user');
                userId = JSON.parse(decodeURIComponent(userParam)).id;
            } catch (e) {
                return response.status(400).json({ ok: false, error: 'Invalid initData' });
            }
        }

        const userKey = `user:${userId}`;
        let userData = await redis.get(userKey) || { balance: 20, history: [] };
        if (typeof userData === 'string') userData = JSON.parse(userData);

        // Сохраняем расклад в историю
        const newEntry = { ts: Date.now(), type: 'spread', title, cards, text };
        if (!Array.isArray(userData.history)) userData.history = [];
        userData.history.unshift(newEntry);
        userData.history = userData.history.slice(0, 50);

        await redis.set(userKey, JSON.stringify(userData));

        // Отправка в Telegram чат, если share=true
        if (share && process.env.TELEGRAM_BOT_TOKEN) {
            try {
                const cardList = cards.map(c => `— ${c.name}${c.rev ? ' (перевёрнутая)' : ''}`).join('\n');
                const cleanText = text
                    .replace(/\*\*/g, '')
                    .replace(/###|##|#/g, '')
                    .trim();

                const message = `<b>🔮 ${title} 🔮</b>\n\n<b>Ваши карты:</b>\n${cardList}\n\n<b>Интерпретация:</b>\n${cleanText}`;
                const truncated = message.length > 4096 ? message.substring(0, 4086) + '...' : message;

                await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: userId, text: truncated, parse_mode: 'HTML' })
                });
            } catch (shareErr) {
                console.error('Share to Telegram failed:', shareErr);
                // Не возвращаем ошибку — расклад уже сохранён
            }
        }

        return response.status(200).json({ ok: true });

    } catch (e) {
        console.error('Spread function error:', e);
        return response.status(500).json({ ok: false, error: e.message });
    }
};
