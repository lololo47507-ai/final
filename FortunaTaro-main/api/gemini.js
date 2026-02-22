const crypto = require('crypto');
const { Redis } = require('@upstash/redis');
const Groq = require('groq-sdk');

async function validate(initData) {
    const TG_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TG_BOT_TOKEN) return true;
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
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (request.method === 'OPTIONS') return response.status(204).end();
    if (request.method !== 'POST') return response.status(405).end('Method Not Allowed');

    try {
        let redisUrl = (process.env.UPSTASH_REDIS_REST_URL || '').trim();
        const redisToken = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
        const groqKey = (process.env.GROQ_API_KEY || '').trim();

        if (redisUrl && !redisUrl.startsWith('https://')) redisUrl = `https://${redisUrl}`;

        if (!redisUrl || !redisToken || !groqKey) {
            console.error('Missing Config Keys:', { redisUrl: !!redisUrl, redisToken: !!redisToken, groqKey: !!groqKey });
            return response.status(500).json({ ok: false, error: 'Server configuration error. Check environment variables.' });
        }

        const redis = new Redis({ url: redisUrl, token: redisToken });
        const groq = new Groq({ apiKey: groqKey });

        // Парсинг тела запроса
        let body = request.body;
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
        const { initData, system, messages } = body || {};

        if (!messages || messages.length === 0) {
            return response.status(400).json({ ok: false, error: 'No messages provided' });
        }

        // Определяем пользователя
        const isDev = !initData || initData === 'dev_init_data' || initData.trim() === '';
        let userId = 123456;

        if (!isDev) {
            try {
                const isValid = await validate(initData);
                if (!isValid) return response.status(403).json({ ok: false, error: 'Auth failed' });
                const userParam = new URLSearchParams(initData).get('user');
                userId = JSON.parse(decodeURIComponent(userParam)).id;
            } catch (e) {
                console.error('Auth error:', e);
                return response.status(403).json({ ok: false, error: 'Auth parsing failed' });
            }
        }

        // Проверяем баланс ПЕРЕД запросом к AI
        const userKey = `user:${userId}`;
        let userData = await redis.get(userKey);
        if (!userData) {
            userData = { balance: isDev ? 999 : 20, history: [], referral_activated: false };
            await redis.set(userKey, JSON.stringify(userData));
        }
        if (typeof userData === 'string') userData = JSON.parse(userData);

        // Гороскоп — бесплатно (определяем по системному промпту)
        const isHoroscope = system && system.includes('астролог');
        if (!isHoroscope && userData.balance <= 0) {
            return response.status(402).json({ ok: false, error: 'Insufficient balance', newBalance: 0 });
        }

        // Запрос к Groq
        const allMessages = [];
        if (system) allMessages.push({ role: 'system', content: system });
        messages.forEach(m => allMessages.push({ role: m.role, content: m.content }));

        const completion = await groq.chat.completions.create({
            messages: allMessages,
            model: 'llama-3.1-8b-instant',
            temperature: 0.7,
            max_tokens: 1024,
        });

        const responseText = completion.choices[0]?.message?.content || 'Ошибка получения ответа';

        // Списываем баланс ТОЛЬКО после успешного ответа AI и только если не гороскоп
        if (!isHoroscope) {
            userData.balance = Math.max(0, userData.balance - 1);
            await redis.set(userKey, JSON.stringify(userData));
        }

        return response.status(200).json({
            ok: true,
            text: responseText,
            newBalance: userData.balance
        });

    } catch (e) {
        console.error('GEMINI API ERROR:', e);
        return response.status(500).json({ ok: false, error: e.message });
    }
};
