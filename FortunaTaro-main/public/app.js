// Dev‑стаб Telegram для запуска вне Telegram
(function ensureTelegramStub(){
  if (!window.Telegram) window.Telegram = {};
  if (!window.Telegram.WebApp) {
    window.Telegram.WebApp = {
      close: ()=> console.log('[DEV] close'),
      openLink: (url)=> window.open(url, '_blank'),
      ready: ()=> console.log('[DEV] ready'),
      expand: ()=> console.log('[DEV] expand'),
      initDataUnsafe: { user: { id: 123456, username: 'dev_user', first_name: 'Dev' }, initData: "dev_init_data" },
      initData: "dev_init_data", // Добавлено для консистентности
      HapticFeedback: { impactOccurred: ()=>{} },
      CloudStorage: null,
      MainButton: { show: ()=>{}, hide: ()=>{}, setText: ()=>{} }
    };
    console.log('[DEV] Telegram WebApp stub enabled');
  }
})();

// Core / helpers
const tg = window.Telegram.WebApp;
const hasCloud = !!tg?.CloudStorage;
const u = tg?.initDataUnsafe?.user || { id:'guest', username:'guest' };

const $ = s => document.querySelector(s);
function haptic(type='light'){ try { tg.HapticFeedback.impactOccurred(type); }catch(_){} }
function toast(msg, duration = 2500){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.classList.add('show'),10); setTimeout(()=>{t.classList.remove('show'); setTimeout(()=>t.remove(),duration)},duration-250); }

// Cloud Storage wrapper (for fallback)
const CS = {
  async getItems(keys){ if (!hasCloud) return {}; return new Promise(res=>{ try{ tg.CloudStorage.getItems(keys, (e,o)=>res(e?{}:(o||{}))); }catch{ res({}); } }); },
  async setItems(obj){ if (!hasCloud) return false; for (const [k,v] of Object.entries(obj)){ await new Promise(r=>{ try{ tg.CloudStorage.setItem(k,v,()=>r()); }catch{ r(); } }); } return true; }
};

// State
const KEY = `ai_fortuna_state_${u.id}`;
function loadLocal(){ try{ return JSON.parse(localStorage.getItem(KEY)); }catch{ return null; } }
function saveLocal(obj){ localStorage.setItem(KEY, JSON.stringify(obj)); updateBalanceDisplay(); }

let state = loadLocal() || {
  user: { id: u.id, username: u.username || 'user' },
  balance: 0, // Стартовый баланс теперь 0, он загрузится с сервера
  history: [],
  cod: { on: true, time: '09:00', last: null },
  promo: [],
  ai: []
};
saveLocal(state);

function updateBalanceDisplay() { const el = $('#balanceValue'); if (el) el.textContent = state.balance; }

const COSTS = { card_of_day: 1, three: 3, week: 5, yes_no: 5, custom: 3, ai: 1 };

// Deck logic (unchanged)
const SUITS = ['Жезлы','Кубки','Мечи','Пентакли']; const PIPS = ['Туз','2','3','4','5','6','7','8','9','10','Паж','Рыцарь','Королева','Король']; const MAJOR = ['Шут','Маг','Жрица','Императрица','Император','Иерофант','Влюблённые','Колесница','Сила','Отшельник','Колесо Фортуны','Справедливость','Повешенный','Смерть','Умеренность','Дьявол','Башня','Звезда','Луна','Солнце','Суд','Мир']; const MEANINGS = { 'Шут':'новый цикл', 'Маг':'воля', 'Жрица':'интуиция', 'Императрица':'рост', 'Император':'структура', 'Иерофант':'традиции', 'Влюблённые':'выбор', 'Колесница':'прорыв', 'Сила':'мужество', 'Отшельник':'поиск', 'Колесо Фортуны':'шанс', 'Справедливость':'баланс', 'Повешенный':'пауза', 'Смерть':'трансформация', 'Умеренность':'гармония', 'Дьявол':'искушение', 'Башня':'изменение', 'Звезда':'надежда', 'Луна':'неясность', 'Солнце':'успех', 'Суд':'пробуждение', 'Мир':'целостность' }; const MAJOR_IMG = { 'Шут': '0_Fool.png', 'Маг': 'I_Magician.png', 'Жрица': 'II_HighPriestess.png', 'Императрица': 'III_Empress.png', 'Император': 'IV_Emperor.png', 'Иерофант': 'V_Hierophant.png', 'Влюблённые': 'VI_Lovers.png', 'Колесница': 'VII_Chariot.png', 'Сила': 'VIII_Strength.png', 'Отшельник': 'IX_Hermit.png', 'Колесо Фортуны': 'X_WheelOfFortune.png', 'Справедливость': 'XI_Justice.png', 'Повешенный': 'XII_HangedMan.png', 'Смерть': 'XIII_Death.png', 'Умеренность': 'XIV_Temperance.png', 'Дьявол': 'XV_Devil.png', 'Башня': 'XVI_Tower.png', 'Звезда': 'XVII_Star.png', 'Луна': 'XVIII_Moon.png', 'Солнце': 'XIX_Sun.png', 'Суд': 'XX_Judgement.png', 'Мир': 'XXI_World.png' }; const DECK = [ ...MAJOR.map((name,i)=>({ arc:'major', n:i, name, pos: MEANINGS[name]||'' })), ...SUITS.flatMap(s=> PIPS.map((p,idx)=>({ arc:'minor', suit:s, name:`${p} ${s}`, n: idx, pos:'' }))) ];
function draw(n){ const pool=[...DECK]; const out=[]; for(let i=0;i<n && pool.length;i++){ const k=Math.floor(Math.random()*pool.length); const [card]=pool.splice(k,1); card.rev = Math.random()<0.45; out.push(card); } return out; }
function imgForCard(c){
  let filename = null;
  
  if (c.arc === 'major') {
    // Берем имя файла из списка
    const f = MAJOR_IMG[c.name];
    if (f) filename = f;
  } 
  
  if (c.arc === 'minor'){
    const sMap = { 'Жезлы':'Wands', 'Кубки':'Cups', 'Мечи':'Swords', 'Пентакли':'Pentacles' };
    const rMap = { 'Туз':'Ace', '2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8','9':'9','10':'10','Паж':'Page','Рыцарь':'Knight','Королева':'Queen','Король':'King' };
    
    const sEn = sMap[c.suit];
    const rRu = c.name.replace(` ${c.suit}`,'').trim();
    const rEn = rMap[rRu];
    
    if (sEn && rEn) filename = `${rEn}_${sEn}.png`;
  }

  // ВАЖНО: Превращаем всё в маленькие буквы перед возвратом!
  // 10_Swords.png -> 10_swords.png
  return filename ? `/cards/${filename.toLowerCase()}` : null; 
}
function cardHtml(c){ const img = imgForCard(c); const m = c.pos ? (c.rev ? `тень: переосмысление` : c.pos) : (c.rev?'скрытые аспекты':'ситуация/энергия'); return `<div class="tcard" tabindex="0"><div class="tface tfront">${img ? `<img src="${img}" alt="${c.name}">` : `<div style="display:flex;align-items-center;justify-content:center;height:100%;background:radial-gradient(320px 220px at 50% 0%, rgba(140,107,255,.22), rgba(255,255,255,.02));font-weight:900">${c.name}</div>`}</div><div class="tface tback"><div class="name">${c.name}${c.rev?' (перевёрнутая)':''}</div>${c.suit ? `<div class="meta">${c.suit}</div>`:''}<div style="margin-top:6px">${m}</div></div></div>`; }
function renderCards(cards, isSmall=false){ return `<div class="cards ${isSmall ? 'small' : ''}">${cards.map(cardHtml).join('')}</div>`; }
function enableFlipListeners(scope=document){ scope.querySelectorAll('.tcard').forEach(el=>{ el.addEventListener('click', ()=> el.classList.toggle('flipped')); el.addEventListener('keydown', (e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); el.classList.toggle('flipped'); } }); }); }

// Modal helpers
const modal = $('#modal'), modalBody = $('#modalBody'), modalTitle = $('#modalTitle');
$('#modalClose').addEventListener('click', ()=> modal.classList.remove('open'));
function showResult(title, html, modalClass=''){ modal.className = `modal ${modalClass}`; modalTitle.textContent = title; modalBody.innerHTML = html; modal.classList.add('open'); enableFlipListeners(modalBody); }

// Balance/history (теперь это локальный кеш, основной источник - сервер)
function spend(cost){ if (cost<=0) return true; if (state.balance < cost){ toast('Недостаточно сообщений'); return false; } state.balance -= cost; saveLocal(state); return true; }
function addHistory(type, title, payload){ state.history.unshift({ ts: Date.now(), type, title, ...payload }); state.history = state.history.slice(0,50); saveLocal(state); }

// UI Init
function initReviews(){ const host = $('#revSlider'); if(!host) return; const slides = Array.from(host.querySelectorAll('.rev')); let i=0; slides[0]?.classList.add('active'); setInterval(()=>{ slides[i]?.classList.remove('active'); i=(i+1)%slides.length; slides[i]?.classList.add('active'); }, 3800); }
const fmt = new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'});
function tick(){ const el=$('#clock'); if(el) el.textContent = fmt.format(new Date()); }
function initClock(){ tick(); setInterval(tick, 30_000); }
function initTabs(){
  document.querySelectorAll('.tab').forEach(t=>{
    t.addEventListener('click', ()=>{
      document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
      const pageId = t.getAttribute('data-page'); document.querySelectorAll('.page').forEach(p=>p.classList.remove('active')); document.getElementById('page-'+pageId).classList.add('active');
      haptic();
      if (pageId==='ai') renderChat();
    });
  });
}

// =======================
// НОВАЯ ЛОГИКА ДЛЯ МАГАЗИНА С БЭКЕНДОМ
// =======================
function bindShop(){ 
  $('#btnTopup').addEventListener('click', ()=>{ $('#shop').classList.add('open'); haptic(); }); 
  $('#shopClose').addEventListener('click', ()=>{ $('#shop').classList.remove('open'); haptic(); }); 
  document.querySelectorAll('.buy').forEach(b=> b.addEventListener('click', async ()=>{
    const qty=parseInt(b.getAttribute('data-qty'),10)||20;
    showLoader('Проводим пополнение…');
    try {
      const newBal = await API.topup(qty);
      state.balance = newBal; 
      saveLocal(state); 
      updateBalanceDisplay();
      toast(`+${qty} сообщений. Ваш новый баланс: ${newBal}`);
    } catch(e) { 
      console.error("Topup failed:", e);
      toast('Не удалось пополнить'); 
    } finally { 
      hideLoader(); 
      $('#shop').classList.remove('open');
    }
  })); 
}

// Promo / Subscription
function applyPromo(code){ const norm = String(code||'').trim().toLowerCase(); if (!norm) return toast('Введите промокод'); if (state.promo.includes(norm)) return toast('Промокод уже активирован'); if (norm !== 'newtarobot') return toast('Промокод не найден'); state.promo.push(norm); state.balance += 5; saveLocal(state); toast('+5 сообщений'); }
function saveCOD(){ state.cod.on = !!$('#codToggle').checked; state.cod.time = ($('#codTime').value || '09:00').slice(0,5); saveLocal(state); toast('Сохранено'); }
function maybeRunDailyCard(){ if (!state.cod?.on) return; const now = new Date(); const todayKey = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`; const [hh,mm] = (state.cod.time||'09:00').split(':').map(x=>parseInt(x,10)); const trig = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh||9, mm||0, 0); if ((!state.cod.last || state.cod.last !== todayKey) && now >= trig) { if (spend(COSTS.card_of_day)) { state.cod.last = todayKey; saveLocal(state); runCardOfDay(); } } }

// Referral System
function initReferral() {
    const linkInput = $('#refLink');
    const copyBtn = $('#copyRefBtn');
    if (!linkInput || !copyBtn) return;
    const botUsername = 'TaroFortunaBot';
    const botUrl = `https://t.me/${botUsername}?start=ref_${u.id}`;
    linkInput.value = botUrl;
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(botUrl).then(() => {
            toast('Ссылка скопирована!', 2000);
            haptic('success');
        }).catch(() => toast('Ошибка копирования', 2000));
    });
}

// History Page (Modal)
function renderHistoryPage() {
    const content = `
        <div class="card pad">
            <p class="muted tiny" style="margin-top:-8px; margin-bottom:12px;">Здесь хранятся ваши последние 50 предсказаний. Нажмите на любое, чтобы увидеть детали.</p>
            <div id="history-list">
                ${
                    (!state.history || state.history.length === 0)
                    ? '<p class="muted tiny" style="text-align:center;">Ваша история пока пуста. Сделайте свой первый расклад!</p>'
                    : state.history.map(item => {
                        const date = new Date(item.ts);
                        const dateStr = date.toLocaleDateString('ru-RU');
                        const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                        
                        let detailsHtml = '';
                        if (item.type === 'spread' && item.cards) {
                            detailsHtml = renderCards(item.cards, true) + mdToHtml(item.text);
                        } else if (item.type === 'ai_chat') {
                            const chatHistoryHtml = item.history.map(msg => 
                                `<div class="bubble ${msg.role === 'user' ? 'me' : ''}" style="max-width: 100%;">
                                    ${msg.text ? mdToHtml(msg.text) : ''}
                                    ${msg.cards ? renderCards(msg.cards, true) : ''}
                                </div>`
                            ).join('');
                            detailsHtml = `<div class="chat-history-wrapper">${chatHistoryHtml}</div>`;
                        }

                        return `
                            <details class="history-item">
                                <summary>
                                    <span class="history-item-title">${item.title}</span>
                                    <span class="history-item-time">${dateStr} в ${timeStr}</span>
                                </summary>
                                <div class="history-details">
                                    ${detailsHtml}
                                </div>
                            </details>
                        `;
                    }).join('')
                }
            </div>
        </div>
    `;
    showResult('История раскладов', content);
}

// Magic 8 Ball
const MAGIC_ANSWERS = ["Да", "Нет", "Скорее всего да", "Скорее всего нет", "Может быть", "Маловероятно", "Очень вероятно", "Без сомнений", "Духи говорят да", "Духи говорят нет"];
function runMagicBall() { haptic(); const html = `<div class="magic-ball-modal"><div id="magicBallPrompt" class="magic-ball-prompt-wrapper"><p class="magic-ball-prompt-text">Спросите у шара все, что хотите. Верите или нет - этот шар знает все ответы</p><div class="magic-ball-prompt-arrow"></div><div class="magic-ball-prompt-click">жми</div></div><div class="magic-ball-container" id="magicBallContainer"><img src="magic_ball.gif" alt="Магический шар" class="magic-ball-gif"><div class="magic-ball-mist"></div><div class="magic-ball-answer" id="magicBallAnswer"></div></div><button class="btn ask-again-btn" id="askAgainBtn">Спросить еще раз</button></div>`; showResult('Магический шар', html, 'magic-ball-modal-open'); const container = $('#magicBallContainer'); const prompt = $('#magicBallPrompt'); const answerEl = $('#magicBallAnswer'); const askAgainBtn = $('#askAgainBtn'); function resetState() { container.classList.remove('predicting', 'revealed'); prompt.style.opacity = '1'; answerEl.textContent = ''; } container.onclick = () => { if (container.classList.contains('predicting')) return; if (container.classList.contains('revealed')) { resetState(); return; } haptic('heavy'); container.classList.add('predicting'); prompt.style.opacity = '0'; setTimeout(() => { const randomAnswer = MAGIC_ANSWERS[Math.floor(Math.random() * MAGIC_ANSWERS.length)]; answerEl.textContent = randomAnswer; container.classList.remove('predicting'); container.classList.add('revealed'); haptic('success'); }, 3000); }; askAgainBtn.onclick = () => { haptic(); resetState(); }; }

// =======================
// НОВЫЕ API УТИЛИТЫ ДЛЯ БЭКЕНДА
// =======================
const API = {
  async getBalance() {
    const initData = tg.initData || tg.initDataUnsafe.initData || '';
    const res = await fetch('/api/balance?initData=' + encodeURIComponent(initData));
    if (!res.ok) {
        const errorText = await res.text();
        console.error("Balance fetch failed:", res.status, errorText);
        throw new Error('balance_get_failed');
    }
    const j = await res.json(); 
    if (!j.ok) throw new Error(j.error || 'balance_get_not_ok'); 
    return j.balance;
  },
  async topup(amount) {
    const initData = tg.initData || tg.initDataUnsafe.initData || '';
    const res = await fetch('/api/balance', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ initData, amount }) });
    if (!res.ok) {
        const errorText = await res.text();
        console.error("Topup failed:", res.status, errorText);
        throw new Error('balance_topup_failed');
    }
    const j = await res.json(); 
    if (!j.ok) throw new Error(j.error || 'balance_topup_not_ok'); 
    return j.balance;
  },
  async saveSpread({ title, cards, text, share=false }) {
    // Эта функция сейчас не используется напрямую с новым бэкендом, но оставляем для совместимости
    const initData = tg.initData || tg.initDataUnsafe.initData || '';
    try {
        await fetch('/api/spread', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ initData, title, cards, text, share }) });
        return true;
    } catch(e) {
        console.error("Failed to save spread:", e);
        return false;
    }
  }
};

// AI API and helpers
const CHAT_SYSTEM_PROMPT = `
Ты — AI Fortuna, древняя цифровая провидица. Твой тон — загадочный, теплый, эмпатичный и немного мистический.
Твоя цель: поддерживать беседу, успокаивать и направлять.
ПРАВИЛА:
1. Используй обращения: "Искатель", "Душа", "Путник".
2. Используй немного эзотерических эмодзи (✨, 🔮, 🌙, 🕯️), но не перебарщивай.
3. Если пользователь просит расклад (слова: "расклад", "погадай", "карты"), отвечай ТОЛЬКО: [DO_SPREAD]
4. На вопросы "Кто ты?" отвечай, что ты дух, живущий в цифровых потоках.
`;

const SPREAD_SYSTEM_PROMPT = `
Ты — AI Fortuna, мудрый таролог.
Твоя задача: Интерпретировать выпавшие карты Таро для пользователя.
КОНТЕКСТ: Пользователь задал вопрос или выбрал тему.
СТИЛЬ ОТВЕТА (Строго соблюдай Markdown):
1. Начни с загадочного вступления (1 предложение).
2. **🔮 Анализ карт:** Пройдись по каждой карте. Объясни её значение именно в контексте вопроса. Не давай общих энциклопедических определений, связывай карты друг с другом.
3. **✨ Синтез:** Как эти карты взаимодействуют? Есть ли конфликт или гармония?
4. **🧭 Совет Оракула:** Четкое, практичное руководство к действию.
5. Заверши теплым напутствием.

ВАЖНО: Текст должен быть структурирован, разбит на абзацы. Используй жирный шрифт для акцентов. Тон — поддерживающий, но честный.
`;

// ===============================================
// --- ИЗМЕНЕНИЕ №1: Полностью переписана функция groq ---
// ===============================================
async function groq(system, messages) {
    if (!messages || messages.length === 0) {
        console.error('AI call prevented: messages array is empty.');
        throw new Error('empty_messages_array');
    }
    const userMessage = messages[messages.length - 1]?.content;
    if (!userMessage || !userMessage.trim()) {
        console.error('AI call prevented: user message content is empty.');
        throw new Error('empty_user_message');
    }

    // --- ИСПРАВЛЕНИЕ: Надежное получение initData ---
    // 1. Пробуем взять из Telegram WebApp
    let initData = tg.initData || (tg.initDataUnsafe && tg.initDataUnsafe.initData);
    
    // 2. Если пусто (мы тестируем в браузере), берем жесткую заглушку
    if (!initData) {
        console.warn("⚠️ InitData не найдена (тест в браузере?). Использую dev_init_data");
        initData = "dev_init_data";
    }

    console.log("Sending to AI:", { initDataLength: initData.length, messagesCount: messages.length });

    const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, system, messages })
    });

    const data = await res.json();
    
    if (!res.ok || data.ok === false) {
        // Логируем ошибку в консоль браузера, чтобы ты ее видел
        console.error("Server Error:", data);
        if (res.status === 402) { 
             toast('Недостаточно сообщений на балансе');
        }
        throw new Error(data.error || 'ai_error');
    }

    if (data.newBalance !== null && data.newBalance !== undefined) {
        state.balance = data.newBalance;
        saveLocal(state); 
        // Обновим баланс визуально сразу
        updateBalanceDisplay();
    }

    return data.text; 
}

function cardsToText(cards){ return cards.map((c,i)=>`${i+1}. ${c.name}${c.rev?' (перевёрнутая)':''}${c.suit?` — ${c.suit}`:''}`).join('\n'); }

function showSpreadResult(title, cards, text) { const html = `<div class="result-section">${renderCards(cards)}${mdToHtml(text)}<div class="tiny muted" style="margin-top:8px">Нажмите на карту, чтобы перевернуть.</div></div>`; showResult(title, html); }

// ===============================================================
// --- ИЗМЕНЕНИЕ №2: Убрана локальная проверка баланса `spend()` ---
// --- Теперь сервер является единственным источником правды    ---
// ===============================================================
async function runCardOfDay(){ showLoader('Колода тасуется…'); try{ const cards = draw(1); const text = await groq(SPREAD_SYSTEM_PROMPT, [{role:'user', content: `Вопрос: Карта дня\nКарты:\n${cardsToText(cards)}`}]); addHistory('spread', 'Карта дня', { cards, text }); showSpreadResult('Карта дня', cards, text); } catch(e) { console.error(e); if (e.message !== 'groq_error') toast('Ошибка ИИ'); } finally { hideLoader(); } }
async function runThree(){ showLoader('Тасую колоду…'); try{ const cards = draw(3); const text = await groq(SPREAD_SYSTEM_PROMPT, [{role:'user', content: `Вопрос: Расклад на 3 карты\nКарты:\n${cardsToText(cards)}`}]); addHistory('spread', 'Три карты', { cards, text }); showSpreadResult('Три карты', cards, text); } catch(e){ console.error(e); if (e.message !== 'groq_error') toast('Ошибка ИИ'); } finally { hideLoader(); } }
async function runWeek(){ showLoader('Готовлю расклад на неделю…'); try{ const cards = draw(5); const text = await groq(SPREAD_SYSTEM_PROMPT, [{role:'user', content: `Вопрос: Прогноз на неделю\nКарты:\n${cardsToText(cards)}`}]); addHistory('spread', 'Неделя', { cards, text }); showSpreadResult('Неделя', cards, text); } catch(e){ console.error(e); if (e.message !== 'groq_error') toast('Ошибка ИИ'); } finally { hideLoader(); } }
async function runYesNo(){ const q = prompt('Ваш вопрос (Да/Нет):'); if (!q) return; showLoader('Спрашиваем оракула…'); try{ const cards = draw(2); const text = await groq(SPREAD_SYSTEM_PROMPT, [{role: 'user', content: `Вопрос (Да/Нет): ${q}\nКарты:\n${cardsToText(cards)}\nОтветь "Да" или "Нет", затем дай нюанс и совет.`}]); addHistory('spread', 'Оракул Да/Нет', { cards, text, question: q }); showSpreadResult('Оракул Да/Нет', cards, text); } catch(e){ console.error(e); if (e.message !== 'groq_error') toast('Ошибка ИИ'); } finally { hideLoader(); } }
async function runCustom(){ const n = parseInt($('#cardsRange').value, 10) || 3; const topic = ($('#topicInput').value || '').trim(); showLoader('Готовлю расклад…'); try{ const cards = draw(Math.max(2, Math.min(10, n))); const text = await groq(SPREAD_SYSTEM_PROMPT, [{role:'user', content: `Вопрос: ${topic || 'Общий расклад'}\nКарты:\n${cardsToText(cards)}`}]); const title = `Расклад: ${topic||'Без темы'}`; addHistory('spread', title, { cards, text }); showSpreadResult(title, cards, text); } catch(e){ console.error(e); if (e.message !== 'groq_error') toast('Ошибка ИИ'); } finally { hideLoader(); } }

// Horoscope
const SIGNS = [['aries','♈️','Овен'],['taurus','♉️','Телец'],['gemini','♊️','Близнецы'],['cancer','♋️','Рак'],['leo','♌️','Лев'],['virgo','♍️','Дева'],['libra','♎️','Весы'],['scorpio','♏️','Скорпион'],['sagittarius','♐️','Стрелец'],['capricorn','♑️','Козерог'],['aquarius','♒️','Водолей'],['pisces','♓️','Рыбы']];
function renderHoroscopeGrid(){ const g = $('#zGrid'); if (!g) return; g.innerHTML = ''; SIGNS.forEach(([key, ico, name])=>{ const el = document.createElement('div'); el.className='z-card'; el.setAttribute('data-sign', key); el.innerHTML = `<span class="z-ico">${ico}</span>${name}`; el.addEventListener('click', async ()=>{ showHoroscopeLoader(); try{ const cacheKey = `hor_${key}_${new Date().toDateString()}`; let txt = sessionStorage.getItem(cacheKey); if (!txt) { 
    const systemPrompt = `Ты — профессиональный и загадочный астролог по имени АстроЛогос. Твоя задача - написать вдохновляющий и подробный гороскоп для знака зодиака на сегодня на русском языке. ТРЕБОВАНИЯ К ОТВЕТУ: - Используй Markdown для форматирования. - Ответ должен содержать заголовок. - Обязательно включи три раздела: **💖 Любовь**, **💼 Карьера** и **🌿 Здоровье**. - В конце дай краткий **🧭 Совет дня**. - Используй 1-2 уместных эмодзи в каждом разделе для живости. - Тон должен быть позитивным и мудрым.`;
    // Гороскопы бесплатные, поэтому для них не списывается баланс на сервере
    txt = await groq(systemPrompt, [{role: 'user', content: `Сделай гороскоп для знака: ${name}.`}]);
    sessionStorage.setItem(cacheKey, txt); 
} showResult(`Гороскоп • ${name}`, mdToHtml(txt)); }catch(e){ toast('Ошибка гороскопа'); } finally { hideHoroscopeLoader(); } }); g.appendChild(el); }); }

// AI chat
function renderChat(){ const c = $('#chat'); if(!c) return; c.innerHTML = state.ai.map(m=> `<div class="bubble ${m.role==='user'?'me':''}"> ${m.cards ? renderCards(m.cards) : ''} ${m.text ? mdToHtml(m.text) : ''} </div>`).join(''); enableFlipListeners(c); c.scrollTop = c.scrollHeight; }
async function onAiSend(){ const inp = $('#aiInput'); const q = (inp?.value||'').trim(); if (!q) return; 
    // Убираем `spend()`, сервер сам проверит баланс
    state.ai.push({ role:'user', text:q }); saveLocal(state); renderChat(); inp.value = ''; showLoader('ИИ думает…'); 
    try { 
        const conversationHistory = state.ai.map(m => ({ role: m.role, content: m.text })); 
        const initialResponse = await groq(CHAT_SYSTEM_PROMPT, conversationHistory); 
        if (initialResponse.trim() === '[DO_SPREAD]') { 
            hideLoader(); showLoader('Делаю расклад...'); 
            const cards = draw(3 + Math.floor(Math.random() * 3)); 
            const spreadPrompt = `Пользователь в диалоге попросил сделать расклад. Его последний запрос: "${q}".\n\nСделай глубокую интерпретацию для этого расклада:\n${cardsToText(cards)}`; 
            const spreadText = await groq(SPREAD_SYSTEM_PROMPT, [{ role: 'user', content: spreadPrompt }]); 
            state.ai.push({ role: 'assistant', text: spreadText, cards: cards }); 
        } else { 
            state.ai.push({ role: 'assistant', text: initialResponse }); 
        } 
        addHistory('ai_chat', `Чат от ${new Date(Date.now()).toLocaleTimeString('ru-RU')}`, { history: state.ai.slice(-2) }); 
        saveLocal(state); renderChat(); 
    } catch(e) { 
        console.error(e); 
        // Если была ошибка (например, баланс), удаляем последнее сообщение пользователя, чтобы он мог попробовать снова
        if (e.message !== 'groq_error') toast('Ошибка ИИ');
        state.ai.pop(); 
        saveLocal(state); 
        renderChat(); 
    } finally { 
        hideLoader(); 
    } 
}

// Bind UI
function bindUI(){
  initTabs(); initReviews(); initReferral();
  document.querySelectorAll('.action').forEach(el=>{ el.addEventListener('click', async ()=>{ const act = el.getAttribute('data-act'); haptic(); try{
    // Убираем все проверки spend() отсюда
    if (act==='card_of_day'){ await runCardOfDay(); }
    else if (act==='three'){ await runThree(); }
    else if (act==='week'){ await runWeek(); }
    else if (act==='yes_no'){ await runYesNo(); }
    else if (act==='magic_ball'){ runMagicBall(); }
  }catch(e){ console.error(e); toast('Ошибка'); } }); });

  $('#headerSupportBtn').addEventListener('click', () => { try { tg?.openLink('https://t.me/your_support_username'); } catch(_) {} });
  $('#historyBtn').addEventListener('click', () => { haptic(); renderHistoryPage(); });
  document.querySelectorAll('.fast').forEach(b=>{ b.addEventListener('click', ()=> { haptic(); const n = b.getAttribute('data-n') || '5'; const topic = b.getAttribute('data-topic') || ''; $('#cardsRange').value = n; $('#cardsOut').textContent = n; $('#topicInput').value = topic; toast('Тема выбрана! Нажмите "Сделать расклад"'); $('#topicInput').focus(); }); });
  $('#cardsRange')?.addEventListener('input', ()=> $('#cardsOut').textContent = $('#cardsRange').value );
  $('#btnDoCustom')?.addEventListener('click', runCustom);
  $('#btnPromo')?.addEventListener('click', ()=> applyPromo(($('#promoInput')?.value||'').trim()) );
  $('#btnCodSave')?.addEventListener('click', saveCOD);
  bindShop();
  $('#cardsOut').textContent = $('#cardsRange')?.value || '3';
  if ($('#codTime')) $('#codTime').value = state.cod.time || '09:00';
  if ($('#codToggle')) $('#codToggle').checked = !!state.cod.on;
  $('#aiSend')?.addEventListener('click', onAiSend);
  $('#aiInput')?.addEventListener('keydown', (e)=>{ if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); onAiSend(); } });
}

// Telegram init
function initTelegram(){ try{ tg?.ready(); tg?.expand(); const user = tg?.initDataUnsafe?.user; if (user) $('#hello').textContent = `@${user.username || 'user'} • id ${user.id}`; }catch{} }

async function start(){
  toast('App v1.4 - Server Sync', 4000); 

  initTelegram();
  if ($('#hello')) $('#hello').textContent = `@${u.username || 'user'} • id ${u.id}`;
  initClock(); bindUI(); renderHoroscopeGrid();

  try {
    const raw = await CS.getItems(['history','cod','promo','ai']);
    const parse = (v, def) => { try{ return v ? JSON.parse(v) : def; }catch{ return def; } };
    if (raw && Object.values(raw).some(v => v != null)) {
      state.history = parse(raw.history, state.history);
      state.cod = parse(raw.cod, state.cod);
      state.promo = parse(raw.promo, state.promo);
      state.ai = parse(raw.ai, state.ai);
      saveLocal(state);
    }
  } catch (e) { console.warn("Could not load from CloudStorage", e); }
  
  try { 
    state.balance = await API.getBalance(); 
    saveLocal(state); 
    updateBalanceDisplay(); 
  } catch(e) {
    console.error("Could not get balance from server", e);
    toast("Ошибка загрузки баланса", 3000);
  }

  updateBalanceDisplay();
  const range = $('#cardsRange'), out = $('#cardsOut'); if (range && out) out.textContent = range.value;
  const codTime = $('#codTime'), codToggle = $('#codToggle');
  if (codTime) codTime.value = state.cod.time || '09:00';
  if (codToggle) codToggle.checked = !!state.cod.on;
  maybeRunDailyCard();

  const urlParams = new URLSearchParams(window.location.search);
  const startParam = urlParams.get('tgWebAppStartParam');
  if (startParam && startParam.startsWith('ref_')) {
      toast('Добро пожаловать! Вам начислен бонус +11 сообщений!', 4000);
      API.topup(11).then(newBal => {
          state.balance = newBal;
          saveLocal(state);
          updateBalanceDisplay();
      }).catch(e => console.error("Referral topup failed", e));
      history.replaceState({}, document.title, window.location.pathname);
  }
  renderChat();
}

document.addEventListener('DOMContentLoaded', start);

// Loader helpers
function showLoader(text = 'Колода тасуется…') { const el = $('#loader'); if (!el) return; el.querySelector('.loader-text').textContent = text; el.classList.add('show'); }
function hideLoader() { const el = $('#loader'); if (!el) return; el.classList.remove('show'); }
function showHoroscopeLoader() { const el = $('#horoscope-loader'); if (el) el.classList.add('show'); }
function hideHoroscopeLoader() { const el = $('#horoscope-loader'); if (el) el.classList.remove('show'); }

// Markdown to HTML
function mdToHtml(md) {
  if (!md) return '';
  let s = md.replace(/\r/g,'').trim();
  s = s.replace(/^\s*\*\*([^*]+?)\*\*\s*$/gm, '<h3>$1</h3>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|\n)[\-\u2022]\s+(.*?)(?=\n(?![\-\u2022]\s)|$)/gs, (m) => { const items = m.trim().split(/\n/).map(x => x.replace(/^[-•]\s+/, '').trim()).filter(Boolean); return '\n<ul>' + items.map(x => `<li>${x}</li>`).join('') + '</ul>'; });
  s = s.split(/\n{2,}/).map(p => p.match(/^<h3>|^<ul>|^<p>|^<div>|^<h2>/) ? p : `<p>${p.replace(/\n/g,'<br>')}</p>`).join('');
  s = s.replace(/Совет:?/gi, '🧭 Совет:').replace(/Итог:?/gi, '🔮 Итог:').replace(/Ситуация:?/gi, '✨ Ситуация:');
  return `<div class="ai-output">${s}</div>`;
}


