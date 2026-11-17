/* Google Analytics (GA4) for the Karva site.
   Counts visits, plus the clicks that matter to a restaurant:
   calls, directions, order and reserve. Skipped on this computer (localhost)
   so testing doesn't count as real visitors. */
(function () {
  var ID = 'G-CSD251815N';
  var host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '' || location.protocol === 'file:') return;

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', ID);

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(s);

  // one listener for the whole page: find the link that was clicked and name the action
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var name = null;
    if (href.indexOf('tel:') === 0) name = 'call_click';
    else if (href.indexOf('google.com/maps') > -1) name = 'directions_click';
    else if (/(^|\/)order\.html/.test(href)) name = 'order_click';
    else if (/(^|\/)table\.html/.test(href)) name = 'reserve_click';
    if (name) gtag('event', name, { link_text: (a.textContent || '').trim().slice(0, 60), page: location.pathname });
  }, true);
})();
