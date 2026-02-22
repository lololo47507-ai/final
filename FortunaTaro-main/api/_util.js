const crypto = require('crypto');

function parseInitData(qs) {
  const map = new URLSearchParams(qs);
  const data = {};
  for (const [k, v] of map.entries()) data[k] = v;
  return data;
}
function checkTelegramAuth(initData, botToken) {
  const data = parseInitData(initData);
  const hash = data.hash;
  delete data.hash;
  const sorted = Object.keys(data).sort().map(k => `${k}=${data[k]}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calcHash = crypto.createHmac('sha256', secret).update(sorted).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(calcHash), Buffer.from(hash));
}
async function redisFetch(path, method='GET', body) {
  const url = process.env.UPSTASH_REDIS_REST_URL + path;
  const headers = { 'Authorization': `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type':'application/json' };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(()=> ({}));
  if (!res.ok) throw new Error('redis_error');
  return data;
}
async function redisGet(key){ return await redisFetch(`/get/${encodeURIComponent(key)}`); }
async function redisSet(key, val){ return await redisFetch(`/set/${encodeURIComponent(key)}`, 'POST', { value: JSON.stringify(val) }); }

async function sendToChat(uid, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chat_id: uid, text, parse_mode: 'HTML', disable_web_page_preview: true }) });
}

module.exports = { checkTelegramAuth, parseInitData, redisGet, redisSet, sendToChat };
