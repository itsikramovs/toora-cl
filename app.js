/* ──────────────────────────────────────────────────────────────
   Togora — shared application script
   Loaded on every page. Provides:
     • window.TG namespace with helpers
     • bell badge updater (header notification counter)
     • bottom nav active-state setter (based on current URL)
     • shared notifications store (localStorage-backed)
     • toast utility
   ────────────────────────────────────────────────────────────── */

window.TG = (function() {

  // ──────────────────────────────────────────────────────────────
  //  Defaults / constants
  // ──────────────────────────────────────────────────────────────
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
      time: 'Вчера', day: 'Вчера', read: true, cta: 'Оценить' }
  ];

  // SVG icons reused across pages where notifications are rendered
  var NICON = {
    promo:  '<svg viewBox="0 0 24 24"><path d="M20 12l-1.5-1.7.2-2.3-2.2-.5-1.2-2L13 6.4 11 5l-2.3 1L7.5 8 5.3 8.5 5.5 10.8 4 12l1.5 1.7-.2 2.3 2.2.5 1.2 2 2.3-.6 2 1 2.3-1 1-2 2.2-.5-.2-2.3L20 12z"/><path d="M9 12l2 2 4-4"/></svg>',
    order:  '<svg viewBox="0 0 24 24"><path d="M3 3h2l2 13h13l2-9H6"/><circle cx="9" cy="20" r="1.7"/><circle cx="18" cy="20" r="1.7"/></svg>',
    system: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>',
    bonus:  '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 1-5 5 1.5 7L12 18l-6.5 3.5L7 14.5 2 9.5l7-1z"/></svg>'
  };

  // ──────────────────────────────────────────────────────────────
  //  Storage helpers
  // ──────────────────────────────────────────────────────────────
  function loadNotifications() {
    try {
      var raw = localStorage.getItem(STORAGE_NOTIFS);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) { /* ignore */ }
    return JSON.parse(JSON.stringify(DEFAULT_NOTIFICATIONS));
  }
  function saveNotifications(arr) {
    try { localStorage.setItem(STORAGE_NOTIFS, JSON.stringify(arr)); } catch (e) {}
  }

  // ──────────────────────────────────────────────────────────────
  //  General helpers
  // ──────────────────────────────────────────────────────────────
  function escHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  function formatBadge(n) {
    if (n <= 0)  return '';
    if (n > 99)  return '99+';
    return String(n);
  }

  // ──────────────────────────────────────────────────────────────
  //  Header bell badge updater
  // ──────────────────────────────────────────────────────────────
  function updateBellBadge() {
    var badge = document.getElementById('notifBadge');
    if (!badge) return;
    var unread = loadNotifications().filter(function(n) { return !n.read; }).length;
    var text = formatBadge(unread);
    if (!text) {
      badge.classList.add('hidden');
      badge.textContent = '';
    } else {
      badge.classList.remove('hidden');
      badge.classList.remove('dot');
      badge.textContent = text;
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  Bottom nav: highlight active item based on current URL
  // ──────────────────────────────────────────────────────────────
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

  // ──────────────────────────────────────────────────────────────
  //  Toast utility (light, used by any page)
  //  Expects a <div id="cart-toast" class="cart-toast"><div class="toast-text"></div></div>
  // ──────────────────────────────────────────────────────────────
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

  // ──────────────────────────────────────────────────────────────
  //  Init
  // ──────────────────────────────────────────────────────────────
  function init() {
    setBottomNavActive();
    updateBellBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ──────────────────────────────────────────────────────────────
  //  Public API
  // ──────────────────────────────────────────────────────────────
  return {
    escHTML: escHTML,
    formatBadge: formatBadge,
    loadNotifications: loadNotifications,
    saveNotifications: saveNotifications,
    updateBellBadge: updateBellBadge,
    setBottomNavActive: setBottomNavActive,
    showToast: showToast,
    NICON: NICON,
    DEFAULT_NOTIFICATIONS: DEFAULT_NOTIFICATIONS
  };

})();
