// hello-cdn.js — module test chargé via CDN (jsDelivr depuis GitHub)
OD.define('hello-cdn', {
  async mount(el, ctx) {
    el.innerHTML =
      '<div style="padding:12px;border:1px solid #2563eb;border-radius:8px;background:#eff6ff;font-family:sans-serif">'
      + '🌐 Module <b>hello-cdn</b> chargé depuis le <b>CDN</b> pour <b>' + ctx.tenant.group_name + '</b>'
      + '</div>';
  }
});
