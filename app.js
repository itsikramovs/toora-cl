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
      navigator.serviceWorker.register('./sw.js?v=2').then(function(reg) {
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

  function init() {
    setBottomNavActive();
    updateBellBadge();
    registerSW();
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
    NICON: NICON,
    DEFAULT_NOTIFICATIONS: DEFAULT_NOTIFICATIONS
  };

})();
