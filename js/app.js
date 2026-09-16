(function () {
  "use strict";

  /* ---------- config ---------- */
  // Deploy worker/ (see worker/README.md) and paste its URL here, e.g. "https://scankit-api.yourname.workers.dev"
  var CONFIG = { API_BASE: "https://scankit-api.aleeezfr.workers.dev" };
  // AdMob ad units — real ad *serving* requires native Android code (not possible in a
  // pure TWA wrapper with no native layer). Kept here so they're ready the moment this
  // app is converted to a hybrid/native shell (e.g. via Capacitor) in the future.
  var AD_UNITS = {
    banner: "ca-app-pub-9125815530210447/9646844122",
    interstitial: "ca-app-pub-9125815530210447/1768354106"
  };
  var IAP_PRODUCT_REMOVE_ADS = "com.qrstudio.app.remove_ads";
  var FREE_TRACK_LIMIT = 3; // keep in sync with worker/src/index.js FREE_CODE_LIMIT

  function getOwnerKey() {
    var k = localStorage.getItem("sk-owner");
    if (!k) {
      k = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("sk-owner", k);
    }
    return k;
  }

  /* ---------- Trackable (dynamic) QR bridge — talks to worker/ backend ---------- */
  var TrackBridge = {
    configured: function () { return !!CONFIG.API_BASE; },
    create: function (destination, label) {
      if (!this.configured()) return Promise.reject({ error: "not_configured" });
      return fetch(CONFIG.API_BASE + "/api/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: getOwnerKey(), destination: destination, label: label, premium: AdsBridge.isPremium() })
      }).then(function (res) {
        if (res.status === 402) return res.json().then(function (d) { return Promise.reject({ error: "free_limit_reached", limit: d.limit }); });
        if (!res.ok) return Promise.reject({ error: "request_failed" });
        return res.json();
      });
    },
    stats: function (id) {
      return fetch(CONFIG.API_BASE + "/api/codes/" + id + "/stats?owner=" + encodeURIComponent(getOwnerKey())).then(function (res) {
        if (!res.ok) return Promise.reject({ error: "not_found" });
        return res.json();
      });
    },
    update: function (id, destination) {
      return fetch(CONFIG.API_BASE + "/api/codes/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: getOwnerKey(), destination: destination })
      }).then(function (res) { return res.ok; });
    },
    remove: function (id) {
      return fetch(CONFIG.API_BASE + "/api/codes/" + id + "?owner=" + encodeURIComponent(getOwnerKey()), { method: "DELETE" })
        .then(function (res) { return res.ok; });
    }
  };

  /* ---------- Ads / IAP bridge (stubbed — wire to native plugin later) ---------- */
  // On a Capacitor build, replace the bodies of these functions with calls into
  // @capacitor-community/admob (or your chosen SDK). Kept as a single bridge object
  // so the rest of the app never talks to an ad SDK directly.
  var AdsBridge = {
    isPremium: function () { return localStorage.getItem("sk-premium") === "1"; },
    initBanner: function () {
      if (this.isPremium()) return;
      // Real AdMob rendering needs a native Android layer (Capacitor/native shell) —
      // not possible inside a pure TWA wrapper. AD_UNITS.banner is ready for that.
    },
    showInterstitial: function () {
      if (this.isPremium()) return;
      // Same as above — AD_UNITS.interstitial is ready for a native build.
    }
  };
  // Google Play Billing via the Digital Goods API — this DOES work inside a TWA
  // (no native code needed), as long as the .aab was packaged with Play Billing
  // support enabled and the product id below is created in Play Console.
  var IAPBridge = {
    purchaseRemoveAds: function () {
      if (!window.PaymentRequest) {
        toast(I18N.t("toast_store_not_connected"));
        return;
      }
      var method = [{ supportedMethods: "https://play.google.com/billing", data: { sku: IAP_PRODUCT_REMOVE_ADS } }];
      var details = { total: { label: "Remove Ads", amount: { currency: "USD", value: "4.99" } } };
      try {
        var request = new PaymentRequest(method, details);
        request.show().then(function (response) {
          return response.complete("success").then(function () {
            localStorage.setItem("sk-premium", "1");
            toast(I18N.t("iap_success") || "Purchase successful!");
            setTimeout(function () { location.reload(); }, 900);
          });
        }).catch(function () { /* user cancelled or purchase failed — no-op */ });
      } catch (e) {
        toast(I18N.t("toast_store_not_connected"));
      }
    },
    restore: function () {
      if (!window.getDigitalGoodsService) { toast(I18N.t("toast_store_not_connected")); return; }
      window.getDigitalGoodsService("https://play.google.com/billing").then(function (service) {
        return service.listPurchases();
      }).then(function (purchases) {
        var owned = purchases.some(function (p) { return p.itemId === IAP_PRODUCT_REMOVE_ADS; });
        if (owned) { localStorage.setItem("sk-premium", "1"); toast(I18N.t("iap_success") || "Purchase restored!"); setTimeout(function () { location.reload(); }, 900); }
        else { toast(I18N.t("toast_store_not_connected")); }
      }).catch(function () { toast(I18N.t("toast_store_not_connected")); });
    }
  };

  /* ---------- small utils ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function iconEl(name, cls) {
    var span = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    span.setAttribute("class", cls || "icon");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-" + name);
    span.appendChild(use);
    return span;
  }
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._tid);
    toast._tid = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }
  function vibrate(ms) { try { navigator.vibrate && navigator.vibrate(ms || 15); } catch (e) {} }
  function fmtTime(ts) {
    var d = new Date(ts), now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    var opts = sameDay ? { hour: "2-digit", minute: "2-digit" } : { month: "short", day: "numeric" };
    return d.toLocaleString(undefined, opts);
  }

  /* ---------- theme ---------- */
  function initTheme() {
    var saved = localStorage.getItem("sk-theme");
    var mode = saved || "system";
    applyTheme(mode);
  }
  function applyTheme(mode) {
    var root = document.documentElement;
    if (mode === "dark") root.setAttribute("data-theme", "dark");
    else if (mode === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    localStorage.setItem("sk-theme", mode);
    updateThemeRow(mode);
  }
  function updateThemeRow(mode) {
    var sw = $("#sw-dark");
    if (!sw) return;
    var isDark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    sw.classList.toggle("on", isDark);
  }

  /* ---------- history storage ---------- */
  var HISTORY_KEY = "sk-history-v1";
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; }
  }
  function saveHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 200))); } catch (e) {}
  }
  function addHistory(entry) {
    var list = loadHistory();
    list.unshift(entry);
    saveHistory(list);
    renderHistory();
  }
  function removeHistory(id) {
    saveHistory(loadHistory().filter(function (h) { return h.id !== id; }));
    renderHistory();
  }
  function updateHistoryEntry(updated) {
    var list = loadHistory().map(function (h) { return h.id === updated.id ? updated : h; });
    saveHistory(list);
    renderHistory();
  }

  /* ---------- content classification ---------- */
  function classify(text) {
    if (/^https?:\/\//i.test(text)) return "link";
    if (/^WIFI:/i.test(text)) return "wifi";
    if (/^(MECARD:|BEGIN:VCARD)/i.test(text)) return "contact";
    if (/^mailto:/i.test(text)) return "email";
    if (/^tel:/i.test(text)) return "phone";
    return "text";
  }
  var TYPE_META = {
    link: { icon: "link", labelKey: "type_meta_website" },
    wifi: { icon: "wifi", labelKey: "type_meta_wifi" },
    contact: { icon: "person", labelKey: "type_meta_contact" },
    email: { icon: "mail", labelKey: "type_meta_email" },
    phone: { icon: "phone", labelKey: "type_meta_phone" },
    text: { icon: "text", labelKey: "type_meta_text" }
  };
  function typeLabel(type) { return I18N.t(TYPE_META[type].labelKey); }
  function parseWifi(text) {
    var out = {};
    text.replace(/^WIFI:/i, "").split(";").forEach(function (part) {
      var i = part.indexOf(":");
      if (i === -1) return;
      out[part.slice(0, i).toUpperCase()] = part.slice(i + 1);
    });
    return { ssid: out.S || "", pass: out.P || "", sec: out.T || "nopass" };
  }
  function parseMecard(text) {
    var out = {};
    text.replace(/^MECARD:/i, "").split(";").forEach(function (part) {
      var i = part.indexOf(":");
      if (i === -1) return;
      out[part.slice(0, i).toUpperCase()] = part.slice(i + 1);
    });
    return { name: out.N || "", tel: out.TEL || "", email: out.EMAIL || "" };
  }

  /* ---------- SCAN screen ---------- */
  var scanState = { stream: null, video: null, canvas: null, ctx: null, raf: null, torch: false, facing: "environment" };

  function initScan() {
    scanState.video = $("#scan-video");
    scanState.canvas = document.createElement("canvas");
    scanState.ctx = scanState.canvas.getContext("2d", { willReadFrequently: true });
    $("#btn-start-scan").addEventListener("click", startCamera);
    $("#btn-flip-cam").addEventListener("click", flipCamera);
    $("#btn-flash").addEventListener("click", toggleTorch);
    $("#btn-upload-scan").addEventListener("click", function () { $("#file-scan").click(); });
    $("#file-scan").addEventListener("change", handleFileScan);
    $("#btn-scan-again").addEventListener("click", function () {
      $("#scan-result").hidden = true;
      if (!scanState.stream) startCamera(); else loopScan();
    });
  }

  function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast(I18N.t("toast_camera_unavailable"));
      return;
    }
    var constraints = { video: { facingMode: scanState.facing }, audio: false };
    navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
      scanState.stream = stream;
      scanState.video.srcObject = stream;
      scanState.video.play();
      $("#scan-idle").hidden = true;
      scanState.video.hidden = false;
      $(".scan-frame").hidden = false;
      $(".scan-controls").hidden = false;
      $(".scan-hint").hidden = false;
      loopScan();
    }).catch(function (err) {
      toast(I18N.t("toast_camera_denied"));
    });
  }
  function stopCamera() {
    if (scanState.raf) cancelAnimationFrame(scanState.raf);
    if (scanState.stream) scanState.stream.getTracks().forEach(function (t) { t.stop(); });
    scanState.stream = null;
  }
  function flipCamera() {
    scanState.facing = scanState.facing === "environment" ? "user" : "environment";
    stopCamera();
    startCamera();
  }
  function toggleTorch() {
    if (!scanState.stream) return;
    var track = scanState.stream.getVideoTracks()[0];
    var caps = track.getCapabilities ? track.getCapabilities() : {};
    if (!caps.torch) { toast(I18N.t("toast_flash_unsupported")); return; }
    scanState.torch = !scanState.torch;
    track.applyConstraints({ advanced: [{ torch: scanState.torch }] }).catch(function () {});
    $("#btn-flash").classList.toggle("active", scanState.torch);
  }
  function loopScan() {
    var v = scanState.video;
    if (v.readyState === v.HAVE_ENOUGH_DATA) {
      scanState.canvas.width = v.videoWidth;
      scanState.canvas.height = v.videoHeight;
      scanState.ctx.drawImage(v, 0, 0, v.videoWidth, v.videoHeight);
      var img = scanState.ctx.getImageData(0, 0, v.videoWidth, v.videoHeight);
      var code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
      if (code && code.data) {
        onScanSuccess(code.data);
        return;
      }
    }
    scanState.raf = requestAnimationFrame(loopScan);
  }
  function handleFileScan(e) {
    var file = e.target.files[0];
    if (!file) return;
    var img = new Image();
    img.onload = function () {
      var c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      var ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      var data = ctx.getImageData(0, 0, c.width, c.height);
      var code = jsQR(data.data, data.width, data.height);
      if (code && code.data) onScanSuccess(code.data);
      else toast(I18N.t("toast_no_qr_found"));
    };
    img.src = URL.createObjectURL(file);
    e.target.value = "";
  }
  function onScanSuccess(text) {
    vibrate(30);
    if (scanState.raf) cancelAnimationFrame(scanState.raf);
    showScanResult(text);
    addHistory({ id: "h" + Date.now(), kind: "scan", type: classify(text), value: text, ts: Date.now() });
    AdsBridge.showInterstitial();
  }
  function showScanResult(text) {
    var type = classify(text);
    var meta = TYPE_META[type];
    var card = $("#scan-result");
    card.hidden = false;
    $("#scan-result .type-chip span").textContent = typeLabel(type);
    $("#scan-result .type-chip use").setAttribute("href", "#i-" + meta.icon);
    var valueEl = $("#scan-result .value");
    valueEl.innerHTML = "";
    valueEl.appendChild(renderValueBlock(type, text));
    var actions = $("#scan-result .row-actions");
    actions.innerHTML = "";
    actions.appendChild(makeBtn(I18N.t("btn_copy"), "copy", "btn-secondary btn-sm", function () { copyText(text); }));
    actions.appendChild(makeBtn(I18N.t("btn_share"), "share", "btn-secondary btn-sm", function () { shareText(text); }));
    if (type === "link") actions.appendChild(makeBtn(I18N.t("btn_open"), "link", "btn-primary btn-sm", function () { window.open(text, "_blank"); }));
    if (type === "phone") actions.appendChild(makeBtn(I18N.t("btn_call"), "phone", "btn-primary btn-sm", function () { location.href = text; }));
    if (type === "email") actions.appendChild(makeBtn(I18N.t("btn_email_action"), "mail", "btn-primary btn-sm", function () { location.href = text; }));
    if (type === "contact") actions.appendChild(makeBtn(I18N.t("btn_save_vcf"), "download", "btn-primary btn-sm", function () { downloadContact(text); }));
  }
  function renderValueBlock(type, text) {
    var wrap = document.createElement("div");
    if (type === "wifi") {
      var w = parseWifi(text);
      wrap.innerHTML = "<strong>" + escapeHtml(w.ssid) + "</strong><br><span style='color:var(--text-muted);font-size:13px'>Password: " + escapeHtml(w.pass || "—") + " &middot; " + escapeHtml(w.sec) + "</span>";
    } else if (type === "contact") {
      var c = parseMecard(text);
      wrap.innerHTML = "<strong>" + escapeHtml(c.name || "Unnamed") + "</strong><br><span style='color:var(--text-muted);font-size:13px'>" + escapeHtml(c.tel || "") + (c.tel && c.email ? " &middot; " : "") + escapeHtml(c.email || "") + "</span>";
    } else if (type === "link") {
      var a = document.createElement("a");
      a.href = text; a.target = "_blank"; a.rel = "noopener"; a.textContent = text;
      wrap.appendChild(a);
    } else {
      wrap.textContent = text.replace(/^mailto:|^tel:/i, "");
    }
    return wrap;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function makeBtn(label, icon, cls, onClick) {
    var b = el("button", { class: "btn " + cls, type: "button" });
    b.appendChild(iconEl(icon));
    b.appendChild(document.createTextNode(label));
    b.addEventListener("click", onClick);
    return b;
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(I18N.t("toast_copied")); });
    } else {
      toast(I18N.t("toast_copy_unsupported"));
    }
  }
  function shareText(text) {
    if (navigator.share) navigator.share({ text: text }).catch(function () {});
    else copyText(text);
  }
  function downloadContact(mecard) {
    var c = parseMecard(mecard);
    var vcf = "BEGIN:VCARD\nVERSION:3.0\nFN:" + c.name + "\nTEL:" + c.tel + "\nEMAIL:" + c.email + "\nEND:VCARD";
    var blob = new Blob([vcf], { type: "text/vcard" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (c.name || "contact") + ".vcf";
    a.click();
  }

  /* ---------- CREATE screen ---------- */
  var CREATE_TYPES = [
    { id: "link", labelKey: "type_link", icon: "link" },
    { id: "text", labelKey: "type_text", icon: "text" },
    { id: "wifi", labelKey: "type_wifi", icon: "wifi" },
    { id: "contact", labelKey: "type_contact", icon: "person" },
    { id: "email", labelKey: "type_email", icon: "mail" },
    { id: "phone", labelKey: "type_phone", icon: "phone" }
  ];
  var createType = "link";
  var lastGenerated = null;

  function renderTypeScroll() {
    var scroll = $("#type-scroll");
    scroll.innerHTML = "";
    CREATE_TYPES.forEach(function (t) {
      var b = el("button", { class: "type-chip-btn" + (t.id === createType ? " active" : ""), type: "button", "data-type": t.id });
      b.appendChild(iconEl(t.icon));
      b.appendChild(document.createTextNode(I18N.t(t.labelKey)));
      b.addEventListener("click", function () {
        createType = t.id;
        $all(".type-chip-btn", scroll).forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        renderCreateFields();
      });
      scroll.appendChild(b);
    });
  }

  function initCreate() {
    renderTypeScroll();
    renderCreateFields();
    $("#btn-generate").addEventListener("click", generateQr);
    $("#btn-download-qr").addEventListener("click", downloadQr);
    $("#btn-share-qr").addEventListener("click", function () { if (lastGenerated) shareText(lastGenerated); });
  }

  function fieldHtml(id, label, placeholder, type) {
    return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + (type || "text") + '" placeholder="' + (placeholder || "") + '"></div>';
  }
  function renderCreateFields() {
    var box = $("#create-fields");
    var html = "";
    var t = I18N.t;
    if (createType === "link") {
      html = fieldHtml("f-url", t("field_url_label"), t("field_url_placeholder")) +
        '<label class="track-toggle-row" for="f-trackable">' +
        '<input type="checkbox" id="f-trackable">' +
        '<span><strong>' + t("trackable_title") + '</strong><br><span class="sub">' + t("trackable_sub", { limit: FREE_TRACK_LIMIT }) + '</span></span>' +
        '</label>';
    }
    else if (createType === "text") html = '<div class="field"><label for="f-text">' + t("field_text_label") + '</label><textarea id="f-text" placeholder="' + t("field_text_placeholder") + '"></textarea></div>';
    else if (createType === "wifi") {
      html = fieldHtml("f-ssid", t("field_ssid_label"), t("field_ssid_placeholder")) +
        fieldHtml("f-pass", t("field_pass_label"), "") +
        '<div class="field"><label for="f-sec">' + t("field_security_label") + '</label><select id="f-sec"><option value="WPA">' + t("security_wpa") + '</option><option value="WEP">' + t("security_wep") + '</option><option value="nopass">' + t("security_open") + '</option></select></div>';
    } else if (createType === "contact") {
      html = fieldHtml("f-name", t("field_name_label"), t("field_name_placeholder")) +
        fieldHtml("f-tel", t("field_tel_label"), t("field_tel_placeholder"), "tel") +
        fieldHtml("f-email", t("field_email_label"), t("field_email_placeholder"), "email");
    } else if (createType === "email") {
      html = fieldHtml("f-email", t("field_to_label"), t("field_email_placeholder"), "email") +
        fieldHtml("f-subject", t("field_subject_label"), "") +
        '<div class="field"><label for="f-body">' + t("field_message_label") + '</label><textarea id="f-body" placeholder=""></textarea></div>';
    } else if (createType === "phone") {
      html = fieldHtml("f-phone", t("field_phone_label"), t("field_tel_placeholder"), "tel");
    }
    box.innerHTML = html;
  }
  function buildPayload() {
    function v(id) { var e = $("#" + id); return e ? e.value.trim() : ""; }
    if (createType === "link") {
      var u = v("f-url");
      if (!u) return null;
      if (!/^https?:\/\//i.test(u)) u = "https://" + u;
      return u;
    }
    if (createType === "text") return v("f-text") || null;
    if (createType === "wifi") {
      var ssid = v("f-ssid");
      if (!ssid) return null;
      var sec = $("#f-sec").value;
      return "WIFI:T:" + sec + ";S:" + ssid + ";P:" + v("f-pass") + ";;";
    }
    if (createType === "contact") {
      var name = v("f-name");
      if (!name) return null;
      return "MECARD:N:" + name + ";TEL:" + v("f-tel") + ";EMAIL:" + v("f-email") + ";;";
    }
    if (createType === "email") {
      var em = v("f-email");
      if (!em) return null;
      return "mailto:" + em + "?subject=" + encodeURIComponent(v("f-subject")) + "&body=" + encodeURIComponent(v("f-body"));
    }
    if (createType === "phone") {
      var ph = v("f-phone");
      return ph ? "tel:" + ph : null;
    }
    return null;
  }
  function generateQr() {
    var payload = buildPayload();
    if (!payload) { toast(I18N.t("toast_fill_required")); return; }

    var wantsTracking = createType === "link" && $("#f-trackable") && $("#f-trackable").checked;
    if (wantsTracking) {
      if (!TrackBridge.configured()) {
        toast(I18N.t("toast_backend_not_configured"));
        return;
      }
      var genBtn = $("#btn-generate");
      genBtn.disabled = true;
      TrackBridge.create(payload, "").then(function (res) {
        genBtn.disabled = false;
        renderQr(res.shortUrl, { isDynamic: true, codeId: res.id, destination: payload });
      }).catch(function (err) {
        genBtn.disabled = false;
        if (err && err.error === "free_limit_reached") {
          toast(I18N.t("toast_free_limit", { limit: err.limit }));
        } else {
          toast(I18N.t("toast_backend_unreachable"));
        }
      });
      return;
    }
    renderQr(payload, { isDynamic: false });
  }
  function renderQr(text, meta) {
    var canvas = $("#qr-canvas");
    QRCode.toCanvas(canvas, text, { width: 240, margin: 1, color: { dark: "#14171F", light: "#FFFFFF" } }, function (err) {
      if (err) { toast(I18N.t("toast_qr_gen_failed")); return; }
      $("#qr-empty").hidden = true;
      canvas.hidden = false;
      $("#qr-actions").hidden = false;
      lastGenerated = text;
      var entry = { id: "h" + Date.now(), kind: "create", type: classify(text), value: text, ts: Date.now() };
      if (meta && meta.isDynamic) { entry.isDynamic = true; entry.codeId = meta.codeId; entry.destination = meta.destination; }
      addHistory(entry);
      vibrate(15);
    });
  }
  function downloadQr() {
    var canvas = $("#qr-canvas");
    var a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "qr-code.png";
    a.click();
  }

  /* ---------- HISTORY screen ---------- */
  function renderHistory() {
    var list = loadHistory();
    var box = $("#history-list");
    box.innerHTML = "";
    if (!list.length) {
      box.innerHTML = "";
      var empty = el("div", { class: "empty-state" });
      empty.appendChild(iconEl("clock"));
      empty.appendChild(el("p", { text: I18N.t("history_empty") }));
      box.appendChild(empty);
      return;
    }
    list.forEach(function (h) {
      var meta = TYPE_META[h.type];
      var item = el("div", { class: "history-item" });
      var hi = el("div", { class: "h-icon" });
      hi.appendChild(iconEl(meta.icon));
      var body = el("div", { class: "h-body" });
      body.appendChild(el("div", { class: "h-title", text: previewText(h) }));
      var metaText = I18N.t(h.kind === "scan" ? "history_scanned" : "history_created") + " · " + fmtTime(h.ts) + (h.isDynamic ? " · " + I18N.t("history_tracked_suffix") : "");
      body.appendChild(el("div", { class: "h-meta", text: metaText }));
      item.appendChild(hi); item.appendChild(body);
      if (h.isDynamic) { var badge = iconEl("clock", "icon"); badge.style.cssText = "width:14px;height:14px;color:var(--primary)"; item.appendChild(badge); }
      item.addEventListener("click", function () { openHistorySheet(h); });
      box.appendChild(item);
    });
  }
  function previewText(h) {
    if (h.isDynamic) return h.destination;
    if (h.type === "wifi") return parseWifi(h.value).ssid || typeLabel("wifi");
    if (h.type === "contact") return parseMecard(h.value).name || typeLabel("contact");
    return h.value.replace(/^mailto:|^tel:/i, "");
  }
  function openHistorySheet(h) {
    var backdrop = $("#sheet-backdrop");
    var sheet = $("#sheet-content");
    sheet.innerHTML = "";
    sheet.appendChild(el("h3", { text: typeLabel(h.type) + (h.isDynamic ? " · " + I18N.t("history_tracked_suffix") : "") }));
    var p = el("p", { text: "" });
    p.style.wordBreak = "break-word";
    p.textContent = h.isDynamic ? I18N.t("currently_points_to", { value: h.destination }) : h.value;
    sheet.appendChild(p);

    if (h.isDynamic) {
      var statsBox = el("div", { class: "stats-box" });
      statsBox.textContent = I18N.t("stats_loading");
      sheet.appendChild(statsBox);
      TrackBridge.stats(h.codeId).then(function (data) {
        statsBox.innerHTML = "";
        statsBox.appendChild(el("div", { class: "stats-count", text: data.code.scan_count + " " + I18N.t(data.code.scan_count === 1 ? "stats_scan_one" : "stats_scan_many") }));
        if (data.recentScans.length) {
          var rows = el("div", { class: "stats-rows" });
          data.recentScans.slice(0, 6).forEach(function (s) {
            rows.appendChild(el("div", { class: "stats-row", text: fmtTime(s.ts) + "  ·  " + s.device + "  ·  " + s.country }));
          });
          statsBox.appendChild(rows);
        }
      }).catch(function () { statsBox.textContent = I18N.t("stats_error"); });

      var editRow = el("div", { class: "field", style: "margin-top:14px" });
      editRow.innerHTML = '<label>' + I18N.t("edit_dest_label") + '</label><input id="f-edit-dest" type="text" value="' + escapeHtml(h.destination) + '">';
      sheet.appendChild(editRow);
      sheet.appendChild(makeBtn(I18N.t("sheet_save_dest"), "check", "btn-secondary", function () {
        var v = $("#f-edit-dest").value.trim();
        if (!v) return;
        TrackBridge.update(h.codeId, v).then(function (ok) {
          if (ok) { h.destination = v; updateHistoryEntry(h); toast(I18N.t("toast_dest_updated")); closeSheet(); }
          else toast(I18N.t("toast_update_failed"));
        });
      }));
    }

    var actions = el("div", { class: "row-actions", style: "margin-top:14px" });
    actions.appendChild(makeBtn(I18N.t("btn_copy"), "copy", "btn-secondary", function () { copyText(h.value); }));
    actions.appendChild(makeBtn(I18N.t("btn_share"), "share", "btn-secondary", function () { shareText(h.value); }));
    actions.appendChild(makeBtn(I18N.t("btn_delete"), "trash", "btn-danger-outline", function () {
      if (h.isDynamic) TrackBridge.remove(h.codeId);
      removeHistory(h.id); closeSheet();
    }));
    sheet.appendChild(actions);
    backdrop.classList.add("show");
  }
  function closeSheet() { $("#sheet-backdrop").classList.remove("show"); }

  /* ---------- SETTINGS screen ---------- */
  function initSettings() {
    $("#sw-dark").addEventListener("click", function () {
      var current = localStorage.getItem("sk-theme") || "system";
      var isDark = current === "dark" || (current === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      applyTheme(isDark ? "light" : "dark");
    });
    $("#sw-haptics").classList.toggle("on", localStorage.getItem("sk-haptics") !== "0");
    $("#sw-haptics").addEventListener("click", function () {
      var on = localStorage.getItem("sk-haptics") !== "0";
      localStorage.setItem("sk-haptics", on ? "0" : "1");
      $("#sw-haptics").classList.toggle("on", !on);
    });
    $("#btn-clear-history").addEventListener("click", function () {
      var backdrop = $("#sheet-backdrop");
      var sheet = $("#sheet-content");
      sheet.innerHTML = "";
      sheet.appendChild(el("h3", { text: I18N.t("sheet_clear_title") }));
      sheet.appendChild(el("p", { text: I18N.t("sheet_clear_body") }));
      var actions = el("div", { class: "row-actions" });
      actions.appendChild(makeBtn(I18N.t("btn_cancel"), "close", "btn-secondary", closeSheet));
      actions.appendChild(makeBtn(I18N.t("btn_clear"), "trash", "btn-danger-outline", function () { saveHistory([]); renderHistory(); closeSheet(); toast(I18N.t("toast_history_cleared")); }));
      sheet.appendChild(actions);
      backdrop.classList.add("show");
    });
    $("#btn-upgrade").addEventListener("click", function () { IAPBridge.purchaseRemoveAds(); });
    $("#btn-rate").addEventListener("click", function () {
      window.open("https://play.google.com/store/apps/details?id=com.qrstudio.app", "_blank");
    });
    $("#btn-privacy").addEventListener("click", function () {
      window.open("privacy-policy.html", "_blank");
    });
    $("#btn-feedback").addEventListener("click", openFeedbackSheet);
    refreshPremiumUI();
    initLanguagePicker();
  }

  var FEEDBACK_EMAIL = "aleeezfr@gmail.com";
  function openFeedbackSheet() {
    var backdrop = $("#sheet-backdrop");
    var sheet = $("#sheet-content");
    sheet.innerHTML = "";
    sheet.appendChild(el("h3", { text: I18N.t("feedback_title") }));
    var field = el("div", { class: "field", style: "margin-top:10px" });
    field.innerHTML = '<textarea id="f-feedback" rows="4" placeholder="' + I18N.t("feedback_placeholder") + '"></textarea>';
    sheet.appendChild(field);
    var actions = el("div", { class: "row-actions", style: "margin-top:14px" });
    actions.appendChild(makeBtn(I18N.t("btn_cancel"), "close", "btn-secondary", closeSheet));
    actions.appendChild(makeBtn(I18N.t("feedback_send"), "mail", "btn-primary", function () {
      var msg = $("#f-feedback").value.trim();
      var body = encodeURIComponent(msg || "");
      window.location.href = "mailto:" + FEEDBACK_EMAIL + "?subject=" + encodeURIComponent("QR Studio Feedback") + "&body=" + body;
      closeSheet();
    }));
    sheet.appendChild(actions);
    backdrop.classList.add("show");
  }

  function initLanguagePicker() {
    var sel = $("#sel-language");
    if (!sel) return;
    sel.innerHTML = "";
    Object.keys(I18N.languages).forEach(function (code) {
      var opt = document.createElement("option");
      opt.value = code;
      opt.textContent = I18N.languages[code];
      sel.appendChild(opt);
    });
    sel.value = I18N.current();
    sel.addEventListener("change", function () { I18N.setLang(sel.value); });
  }
  function refreshPremiumUI() {
    var isPremium = AdsBridge.isPremium();
    $all(".ad-slot").forEach(function (n) { n.hidden = isPremium; });
    var card = $("#upgrade-card");
    if (card) card.hidden = isPremium;
  }

  /* ---------- tabs / nav ---------- */
  function initTabs() {
    $all(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var screen = tab.getAttribute("data-screen");
        $all(".tab").forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        $all(".screen").forEach(function (s) { s.classList.remove("active"); });
        $("#screen-" + screen).classList.add("active");
        if (screen !== "scan") stopCamera();
      });
    });
    $("#sheet-backdrop").addEventListener("click", function (e) { if (e.target.id === "sheet-backdrop") closeSheet(); });
  }

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    I18N.setLang(I18N.current());
    initTheme();
    initTabs();
    initScan();
    initCreate();
    initSettings();
    renderHistory();
    AdsBridge.initBanner();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
    document.addEventListener("i18n:change", function () {
      renderTypeScroll();
      renderCreateFields();
      renderHistory();
      var sel = $("#sel-language");
      if (sel) sel.value = I18N.current();
    });
  });
})();
