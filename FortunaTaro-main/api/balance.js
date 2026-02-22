const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

async function validate(initData) {
    if (initData === 'dev_init_data') return true;
    const TG_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TG_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured!');
    const sp = new URLSearchParams(initData);
    const hash = sp.get('hash');
    sp.delete('hash');
    sp.sort();
    const dataCheckString = Array.from(sp.entries()).map(([key, value]) => `${key}=${value}`).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(TG_BOT_TOKEN).digest();
    const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
    return hmac === hash;
}

module.exports = async function handler(request, response) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (request.method === 'OPTIONS') return response.status(204).end();

    try {
        if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
            throw new Error('Redis configuration is missing.');
        }

        const redis = Redis.fromEnv();

        if (request.method === 'GET') {
            const { initData } = request.query;
            if (!initData) return response.status(400).json({ ok: false, error: 'initData is missing' });
            if (!(await validate(initData))) return response.status(403).json({ ok: false, error: 'Validation failed.' });

            const isDev = initData === 'dev_init_data';
            const userId = isDev ? 123456 : JSON.parse(decodeURIComponent(new URLSearchParams(initData).get('user'))).id;
            const userKey = `user:${userId}`;

            let userData = await redis.get(userKey);
            if (!userData) {
                userData = { balance: isDev ? 999 : 20, history: [] };
                await redis.set(userKey, JSON.stringify(userData));
            }
            // Если userData пришёл как объект (Redis SDK иногда парсит сам), используем его напрямую
            if (typeof userData === 'string') userData = JSON.parse(userData);
            return response.status(200).json({ ok: true, balance: userData.balance });
        }

        if (request.method === 'POST') {
            const { initData, amount } = request.body;
            if (!initData || amount === undefined) return response.status(400).json({ ok: false, error: 'initData and amount are required' });
            if (!(await validate(initData))) return response.status(403).json({ ok: false, error: 'Validation failed.' });

            const isDev = initData === 'dev_init_data';
            const userId = isDev ? 123456 : JSON.parse(decodeURIComponent(new URLSearchParams(initData).get('user'))).id;
            const userKey = `user:${userId}`;

            let userData = await redis.get(userKey) || { balance: 0, history: [] };
            if (typeof userData === 'string') userData = JSON.parse(userData);
            userData.balance += Number(amount);
            await redis.set(userKey, JSON.stringify(userData));

            return response.status(200).json({ ok: true, balance: userData.balance });
        }

        return response.status(405).end('Method Not Allowed');
    } catch (e) {
        console.error('--- BALANCE API ERROR ---', e);
        return response.status(500).json({ ok: false, error: e.message });
    }
};
