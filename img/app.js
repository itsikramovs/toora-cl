/* ──────────────────────────────────────────────────────────────
   Togora — shared application script
   Loaded on every page. Provides:
     • window.TG namespace with helpers
     • bell badge updater (header notification counter)
     • bottom nav active-state setter (based on current URL)
     • shared notifications store (localStorage-backed)
     • toast utility
     • PWA: service worker registration (with auto-update)
     • Notification API helpers (permission, sound, system push)
     • Auto random notification 30s after launch (once per session)
   ────────────────────────────────────────────────────────────── */

window.TG = (function() {

  var STORAGE_NOTIFS = 'tg_notifications_v1';

  var DEFAULT_NOTIFICATIONS = [
    { id: 1, type: 'order',  title: 'Заказ в пути',
      preview: 'Курьер Алишер забрал ваш заказ в Beshqozon. Прибудет через ~25 минут.',
      full: 'Курьер Алишер забрал ваш заказ из Beshqozon Plov Markazi и направляется к вам.\n\nОжидаемое время прибытия: 19:25.\nКонтакт курьера будет доступен в карточке заказа.',
      time: '2 мин назад', day: 'Сегодня', read: false, cta: 'Открыть заказ' },
    { id: 2, type: 'promo',  title: '−30% на азиатскую кухню',
      preview: 'Только сегодня скидка 30% во всех ресторанах категории «Азия».',
      full: 'Не упустите момент! Сегодня действует скидка 30% на все блюда в ресторанах категории «Азиатская кухня».\n\nПромокод применяется автоматически. Минимальная сумма заказа — 50 000 сум.',
      time: '1 ч назад', day: 'Сегодня', read: false, cta: 'Перейти к акции' },
    { id: 3, type: 'bonus',  title: 'Вам начислено 250 бонусов',
      preview: 'Спасибо за заказ в Khan Atlas. Бонусы можно потратить на следующий заказ.',
      full: 'Благодарим за заказ в ресторане Khan Atlas!\n\nНа ваш счёт зачислено 250 бонусных баллов. 1 балл = 1 сум при оплате следующего заказа.',
      time: '5 ч назад', day: 'Сегодня', read: false, cta: 'Мои бонусы' },
    { id: 4, type: 'system', title: 'Обновление приложения',
      preview: 'Мы улучшили карту и добавили историю заказов.',
      full: 'Доступна новая версия приложения.\n\nЧто нового:\n• Улучшенная карта с подсказками адресов\n• История заказов с быстрым повтором\n• Исправлены мелкие ошибки',
      time: 'Вчера', day: 'Вчера', read: true, cta: null },
    { id: 5, type: 'order',  title: 'Заказ доставлен',
      preview: 'Приятного аппетита! Оцените качество доставки.',
      full: 'Ваш заказ из Plov Center успешно доставлен.\n\nПриятного аппетита! Будем рады оценке — это поможет нам стать лучше.',
      time: 'Вчера', day: 'Вчера', read: true, cta: 'Оценить' },
    { id: 6, type: 'system', title: 'Тестовое уведомление',
      preview: 'Это тестовое уведомление для проверки звука и системных пушей.',
      full: 'Это тестовое уведомление.\n\nИспользуется для проверки:\n• Звукового оповещения\n• Системного push-уведомления\n• PWA-режима приложения\n\nНажми кнопку «Тест» в шапке, чтобы получить такое же.',
      time: 'Только что', day: 'Сегодня', read: false, cta: null }
  ];

  var NICON = {
    promo:  '<svg viewBox="0 0 24 24"><path d="M20 12l-1.5-1.7.2-2.3-2.2-.5-1.2-2L13 6.4 11 5l-2.3 1L7.5 8 5.3 8.5 5.5 10.8 4 12l1.5 1.7-.2 2.3 2.2.5 1.2 2 2.3-.6 2 1 2.3-1 1-2 2.2-.5-.2-2.3L20 12z"/><path d="M9 12l2 2 4-4"/></svg>',
    order:  '<svg viewBox="0 0 24 24"><path d="M3 3h2l2 13h13l2-9H6"/><circle cx="9" cy="20" r="1.7"/><circle cx="18" cy="20" r="1.7"/></svg>',
    system: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>',
    bonus:  '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 1-5 5 1.5 7L12 18l-6.5 3.5L7 14.5 2 9.5l7-1z"/></svg>'
  };

  // Pool used by the auto-fire scheduler
  var AUTO_NOTIF_POOL = [
    { type: 'promo',  title: 'Скидка 25% на плов',
      preview: 'В Beshqozon Plov Markazi до конца дня скидка 25% на все плов-блюда.',
      full: 'Только сегодня в ресторане Beshqozon Plov Markazi скидка 25% на:\n• Палов\n• Тошкент палов\n• Тухум барак\n\nПромокод применится автоматически.',
      cta: 'Перейти к акции' },
    { type: 'order',  title: 'Любимый ресторан рядом',
      preview: 'Khan Atlas в 10 минутах от тебя — заказ доставят быстро.',
      full: 'Заметили, что вы часто заказываете из Khan Atlas. Сейчас ресторан работает и сможет доставить за 10–15 минут.',
      cta: 'Открыть ресторан' },
    { type: 'bonus',  title: '+100 бонусов на счёт',
      preview: 'Тебе начислены приветственные бонусы — потрать их в следующем заказе.',
      full: 'Вам начислено 100 приветственных бонусов.\n\n1 балл = 1 сум при оплате следующего заказа. Бонусы действуют 30 дней.',
      cta: 'Мои бонусы' },
    { type: 'system', title: 'Новая категория «Стрит-фуд»',
      preview: 'Добавили лагман-такси, бутерброды и шаурму. Загляни!',
      full: 'Мы добавили новую категорию «Стрит-фуд»:\n• Лагман-такси\n• Хот-доги и бутерброды\n• Шаурма\n• Самса навынос\n\nЦены ниже обычных, доставка от 10 минут.',
      cta: 'Смотреть категорию' },
    { type: 'promo',  title: 'Бесплатная доставка с Togora+',
      preview: 'Подключи подписку и получи бесплатную доставку на всё.',
      full: 'Togora+ — это:\n• Бесплатная доставка на все заказы\n• +5% бонусов с каждого заказа\n• Ранний доступ к акциям\n\nПервый месяц — бесплатно.',
      cta: 'Подключить Togora+' }
  ];

  function loadNotifications() {
    try {
      var raw = localStorage.getItem(STORAGE_NOTIFS);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_NOTIFICATIONS));
  }
  function saveNotifications(arr) {
    try { localStorage.setItem(STORAGE_NOTIFS, JSON.stringify(arr)); } catch (e) {}
  }

  function escHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }
  function formatBadge(n) {
    if (n <= 0) return '';
    if (n > 99) return '99+';
    return String(n);
  }

  function updateBellBadge() {
    var badge = document.getElementById('notifBadge');
    if (!badge) return;
    var unread = loadNotifications().filter(function(n) { return !n.read; }).length;
    var text = formatBadge(unread);
    if (!text) { badge.classList.add('hidden'); badge.textContent = ''; }
    else { badge.classList.remove('hidden'); badge.classList.remove('dot'); badge.textContent = text; }
  }

  function currentPageFile() {
    var p = (location.pathname || '').split('/').pop().toLowerCase();
    if (!p) return 'index.html';
    return p;
  }
  function setBottomNavActive() {
    var nav = document.querySelector('.bottom-nav');
    if (!nav) return;
    var here = currentPageFile();
    nav.querySelectorAll('.nav-item').forEach(function(item) {
      var page = (item.dataset.page || '').toLowerCase();
      item.classList.toggle('active', page === here || (page === 'index.html' && (here === '' || here === 'index.html')));
    });
  }

  var _toastTimer = null;
  function showToast(message) {
    var toast = document.getElementById('cart-toast');
    if (!toast) return;
    var textEl = toast.querySelector('.toast-text');
    if (textEl) textEl.textContent = message || '';
    toast.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function() { toast.classList.remove('show'); }, 2400);
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('./sw.js?v=67').then(function(reg) {
        if (reg.waiting) reg.waiting.postMessage({ type: 'skip-waiting' });
        reg.addEventListener('updatefound', function() {
          var nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', function() {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              nw.postMessage({ type: 'skip-waiting' });
            }
          });
        });
      }).catch(function(err) {
        console.warn('[Togora] SW registration failed', err);
      });
      var reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function() {
        if (reloaded) return;
        reloaded = true;
        setTimeout(function() { location.reload(); }, 50);
      });
    });
  }

  function requestNotificationPermission() {
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    if (Notification.permission === 'denied')  return Promise.resolve('denied');
    return Notification.requestPermission();
  }

  var _audioCtx = null;
  function playNotifSound() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!_audioCtx) _audioCtx = new Ctx();
      if (_audioCtx.state === 'suspended') _audioCtx.resume();
      var now = _audioCtx.currentTime;
      function tone(freq, start, dur, gainPeak) {
        var osc = _audioCtx.createOscillator();
        var g = _audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + start);
        g.gain.setValueAtTime(0.0001, now + start);
        g.gain.exponentialRampToValueAtTime(gainPeak, now + start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
        osc.connect(g); g.connect(_audioCtx.destination);
        osc.start(now + start);
        osc.stop(now + start + dur + 0.02);
      }
      tone(880,  0.00, 0.16, 0.20);
      tone(1320, 0.10, 0.22, 0.18);
    } catch (e) { console.warn('[Togora] audio failed', e); }
  }

  function sendSystemNotif(payload) {
    payload = payload || {};
    var p = {
      title: payload.title || 'Togora',
      body:  payload.body  || '',
      icon:  payload.icon  || './icon-192.png',
      badge: payload.badge || './icon-192.png',
      tag:   payload.tag   || ('togora-' + Date.now()),
      url:   payload.url   || './notifications.html',
      id:    payload.id    || null
    };
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return Promise.resolve(false);
    }
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      return navigator.serviceWorker.ready.then(function(reg) {
        if (reg && reg.showNotification) {
          return reg.showNotification(p.title, {
            body: p.body, icon: p.icon, badge: p.badge, tag: p.tag,
            data: { url: p.url, id: p.id },
            vibrate: [60, 30, 60]
          }).then(function() { return true; });
        }
        new Notification(p.title, { body: p.body, icon: p.icon, tag: p.tag });
        return true;
      });
    }
    try {
      var n = new Notification(p.title, { body: p.body, icon: p.icon, tag: p.tag });
      n.onclick = function() { window.focus(); n.close(); };
      return Promise.resolve(true);
    } catch (e) { return Promise.resolve(false); }
  }

  // ── Auto random notification — 30 s after launch, once per session ──
  function scheduleRandomAutoNotif(delayMs) {
    try {
      if (sessionStorage.getItem('tg_auto_notif_fired') === '1') return;
    } catch (e) {}
    setTimeout(function() {
      try { sessionStorage.setItem('tg_auto_notif_fired', '1'); } catch (e) {}
      fireRandomAutoNotif();
    }, delayMs);
  }

  function fireRandomAutoNotif() {
    var notifs = loadNotifications();
    var nextId = notifs.reduce(function(m, n) { return Math.max(m, n.id); }, 0) + 1;
    var pick = AUTO_NOTIF_POOL[Math.floor(Math.random() * AUTO_NOTIF_POOL.length)];
    var item = {
      id: nextId, type: pick.type, title: pick.title,
      preview: pick.preview, full: pick.full,
      time: 'Только что', day: 'Сегодня', read: false, cta: pick.cta
    };
    notifs.unshift(item);
    saveNotifications(notifs);
    updateBellBadge();

    // In-app sound (silent if no user gesture happened — by spec)
    playNotifSound();

    // System push — needs Notification permission already granted
    sendSystemNotif({
      title: item.title, body: item.preview,
      tag: 'togora-auto-' + item.id,
      url: './notifications.html', id: item.id
    });

    // Live-refresh notifications page if it's open in this tab
    try {
      window.dispatchEvent(new CustomEvent('tg:notifications-changed', { detail: { id: item.id } }));
    } catch (e) {}

    showToast('Новое уведомление: ' + item.title);
  }

  // ════════════════════════════════════════════════
  //  CART — shared add/remove/count helpers
  //  storage key: 'tg-cart'  (also read by cart.html)
  //  schema: [{ id, name, img, price, qty, vendorId, vendorName }]
  // ════════════════════════════════════════════════
  var CART_KEY = 'tg-cart';
  var FAV_KEY  = 'tg-favorites';

  // ─── Favorites API ───
  function favLoad() {
    try {
      var s = localStorage.getItem(FAV_KEY);
      if (!s) return [];
      var arr = JSON.parse(s);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function favSave(arr) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(arr || [])); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('tg:fav-changed')); } catch (e) {}
  }
  function favId(item) {
    return (item && (item.id || (item.name && cartSlug(item.name)))) || '';
  }
  function favHas(idOrItem) {
    var id = typeof idOrItem === 'string' ? idOrItem : favId(idOrItem);
    if (!id) return false;
    return favLoad().some(function (it) { return favId(it) === id; });
  }
  function favRemove(idOrItem) {
    var id = typeof idOrItem === 'string' ? idOrItem : favId(idOrItem);
    if (!id) return;
    var items = favLoad().filter(function (it) { return favId(it) !== id; });
    favSave(items);
  }
  /** Toggle a product in favorites. Returns true if it's now favorited, false otherwise. */
  function favToggle(item) {
    if (!item || !item.name) return false;
    var id = favId(item);
    var items = favLoad();
    var idx = -1;
    for (var i = 0; i < items.length; i++) {
      if (favId(items[i]) === id) { idx = i; break; }
    }
    if (idx >= 0) {
      items.splice(idx, 1);
      favSave(items);
      return false;
    }
    items.unshift({
      id:    id,
      name:  item.name,
      img:   item.img || '',
      price: Number(item.price) || 0,
      vendorName: item.vendorName || item.vendor || ''
    });
    favSave(items);
    return true;
  }
  function favCount() { return favLoad().length; }

  function cartSlug(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/['`’]/g, '')
      .replace(/[^a-z0-9а-яё]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'unknown';
  }
  function cartParsePrice(s) {
    var n = String(s || '').replace(/[^\d]/g, '');
    return n ? parseInt(n, 10) : 0;
  }
  function cartLoad() {
    try {
      var s = localStorage.getItem(CART_KEY);
      if (!s) return [];
      var arr = JSON.parse(s);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function cartSave(items) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('tg:cart-changed')); } catch (e) {}
    cartUpdateNavPill();
  }
  function cartCount() {
    return cartLoad().reduce(function (s, i) { return s + (Number(i.qty) || 0); }, 0);
  }
  function cartUpdateNavPill() {
    var pill = document.querySelector('.bottom-nav .cart-pill');
    if (!pill) return;
    var n = cartCount();
    if (n > 0) {
      pill.hidden = false;
      pill.textContent = String(n);
      pill.classList.remove('hidden');
    } else {
      pill.hidden = true;
      pill.textContent = '0';
    }
  }
  /**
   * Add an item to the cart (or +1 qty if already there).
   * item: { name, img, price, vendorName, vendorId?, id?, qty? }
   *  - vendorId is auto-derived from vendorName if missing
   *  - id falls back to the name (so two cards w/ same name+vendor merge)
   */
  function cartAdd(item) {
    if (!item || !item.name) return;
    var vendorName = item.vendorName || item.vendor || 'Togora';
    var vendorId   = item.vendorId  || cartSlug(vendorName);
    var id   = item.id || cartSlug(item.name);
    var price = Number(item.price) || 0;
    var qty   = Math.max(1, Number(item.qty) || 1);

    var items = cartLoad();
    var existing = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].vendorId === vendorId && (items[i].id === id || items[i].name === item.name)) {
        existing = items[i]; break;
      }
    }
    if (existing) {
      existing.qty = (Number(existing.qty) || 0) + qty;
    } else {
      items.push({
        id: id,
        name: item.name,
        img: item.img || '',
        price: price,
        qty: qty,
        vendorId: vendorId,
        vendorName: vendorName
      });
    }
    cartSave(items);
  }
  function cartChange(vendorId, id, delta) {
    var items = cartLoad();
    for (var i = 0; i < items.length; i++) {
      if (items[i].vendorId === vendorId && items[i].id === id) {
        items[i].qty = (Number(items[i].qty) || 0) + delta;
        if (items[i].qty <= 0) items.splice(i, 1);
        break;
      }
    }
    cartSave(items);
  }
  function cartFindQty(vendorId, id) {
    var items = cartLoad();
    for (var i = 0; i < items.length; i++) {
      if (items[i].vendorId === vendorId && items[i].id === id) {
        return Number(items[i].qty) || 0;
      }
    }
    return 0;
  }

  /**
   * Wire mini-cards on a container so the + button stores into the real cart.
   * Container: parent element holding `.mini-card` cards. Each card must have:
   *   .mini-name, .mini-vendor (optional, falls back to opts.vendorName),
   *   .mini-price, .mini-img > img, and a `.add-btn-float` button.
   * The handler converts + → qty-stepper inline; pressing − below 1 restores +.
   */
  function wireMiniCardCart(container, opts) {
    if (!container) return;
    opts = opts || {};
    container.addEventListener('click', function (e) {
      var card = e.target.closest('.mini-card');
      var add  = e.target.closest('.add-btn-float');
      var qsBtn = e.target.closest('.qs-btn');

      // + button → add to cart, swap to stepper
      if (add && card) {
        e.preventDefault();
        e.stopPropagation();
        var name   = (card.querySelector('.mini-name')   || {}).textContent || add.dataset.name || 'Блюдо';
        var vName  = (card.querySelector('.mini-vendor') || {}).textContent || opts.vendorName || 'Togora';
        var pTxt   = (card.querySelector('.mini-price')  || {}).textContent || '0';
        var img    = (card.querySelector('.mini-img img') || {}).getAttribute ? card.querySelector('.mini-img img').getAttribute('src') : '';
        var price  = cartParsePrice(pTxt);
        cartAdd({ name: name, img: img, price: price, vendorName: vName });
        var stepper = document.createElement('div');
        stepper.className = 'qty-stepper';
        stepper.dataset.name = name;
        stepper.dataset.vendor = vName;
        stepper.innerHTML =
          '<button class="qs-btn qs-minus" type="button" aria-label="Меньше">−</button>' +
          '<span class="qs-count">1</span>' +
          '<button class="qs-btn qs-plus" type="button" aria-label="Больше">+</button>';
        add.replaceWith(stepper);
        showToast(name + ' — добавлено');
        return;
      }

      // stepper +/−
      if (qsBtn) {
        e.preventDefault();
        e.stopPropagation();
        var stepper2 = qsBtn.closest('.qty-stepper');
        if (!stepper2) return;
        var card2 = qsBtn.closest('.mini-card');
        var name2 = stepper2.dataset.name || ((card2 && card2.querySelector('.mini-name') || {}).textContent) || 'Блюдо';
        var vendor2 = stepper2.dataset.vendor || ((card2 && card2.querySelector('.mini-vendor') || {}).textContent) || opts.vendorName || 'Togora';
        var vId = cartSlug(vendor2);
        var id  = cartSlug(name2);
        var countEl = stepper2.querySelector('.qs-count');
        var n = parseInt(countEl.textContent, 10) || 0;
        if (qsBtn.classList.contains('qs-plus'))  { n += 1; cartChange(vId, id, +1); }
        if (qsBtn.classList.contains('qs-minus')) {
          n -= 1; cartChange(vId, id, -1);
          if (n <= 0) {
            var add2 = document.createElement('button');
            add2.className = 'add-btn-float';
            add2.type = 'button';
            add2.dataset.name = name2;
            add2.setAttribute('aria-label','Добавить');
            add2.innerHTML = '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
            stepper2.replaceWith(add2);
            return;
          }
        }
        countEl.textContent = String(n);
        return;
      }
    });
  }

  function init() {
    setBottomNavActive();
    updateBellBadge();
    registerSW();
    scheduleRandomAutoNotif(30000);
    cartUpdateNavPill();
    window.addEventListener('tg:cart-changed', cartUpdateNavPill);
    window.addEventListener('storage', function (e) {
      if (e.key === CART_KEY) cartUpdateNavPill();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    escHTML: escHTML,
    formatBadge: formatBadge,
    loadNotifications: loadNotifications,
    saveNotifications: saveNotifications,
    updateBellBadge: updateBellBadge,
    setBottomNavActive: setBottomNavActive,
    showToast: showToast,
    requestNotificationPermission: requestNotificationPermission,
    playNotifSound: playNotifSound,
    sendSystemNotif: sendSystemNotif,
    scheduleRandomAutoNotif: scheduleRandomAutoNotif,
    fireRandomAutoNotif: fireRandomAutoNotif,
    NICON: NICON,
    DEFAULT_NOTIFICATIONS: DEFAULT_NOTIFICATIONS,
    AUTO_NOTIF_POOL: AUTO_NOTIF_POOL,
    // ── Cart API ──
    cartLoad: cartLoad,
    cartSave: cartSave,
    cartAdd: cartAdd,
    cartChange: cartChange,
    cartCount: cartCount,
    cartFindQty: cartFindQty,
    cartParsePrice: cartParsePrice,
    cartSlug: cartSlug,
    cartUpdateNavPill: cartUpdateNavPill,
    wireMiniCardCart: wireMiniCardCart,
    // ── Favorites API ──
    favLoad: favLoad,
    favSave: favSave,
    favHas: favHas,
    favToggle: favToggle,
    favRemove: favRemove,
    favCount: favCount
  };

})();
