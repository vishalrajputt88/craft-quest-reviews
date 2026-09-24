/* Craft Quest Frames — storefront renderer.
   Theme-agnostic: resolves which frames apply to this product from the
   published config, draws them (PNG via border-image, or CSS), and keeps the
   theme's product form in sync so its own price and buy button follow.
   UI: a small "Preview" button opens a popup with the live customizer. */
(function () {
  document.querySelectorAll("[data-cqf]").forEach(init);

  function init(root) {
    if (root.__cqf) return;
    root.__cqf = true;

    var cfg, product;
    try {
      cfg = JSON.parse(root.querySelector("[data-cqf-config]").textContent);
      product = JSON.parse(root.querySelector("[data-cqf-product]").textContent);
    } catch (e) { root.hidden = true; return; }
    if (!cfg || !cfg.styles || !cfg.styles.length) { root.hidden = true; return; }

    var settings = cfg.settings || {};
    var blockCfg = {};
    try { blockCfg = JSON.parse(root.querySelector("[data-cqf-block]").textContent) || {}; } catch (e) {}
    var lower = function (s) { return String(s == null ? "" : s).toLowerCase().trim(); };

    /* ---------- 1. Which set applies to this product ---------- */
    var tags = (product.tags || []).map(lower);
    var cols = (product.collections || []).map(lower);
    var type = lower(product.type);
    var pid = String(product.id);

    function matches(set) {
      var v = set.values || [];
      switch (set.rule) {
        case "ALL": return true;
        case "COLLECTION": return v.some(function (x) { return cols.indexOf(x) > -1; });
        case "TAG": return v.some(function (x) { return tags.indexOf(x) > -1; });
        case "PRODUCT_TYPE": return v.indexOf(type) > -1;
        case "PRODUCT": return v.indexOf(pid) > -1;
      }
      return false;
    }
    // Sets arrive sorted by priority (highest first); first match wins.
    var set = (cfg.sets || []).filter(matches)[0];
    var byId = {};
    cfg.styles.forEach(function (s) { byId[s.id] = s; });
    var pool = set ? set.styles.map(function (id) { return byId[id]; }).filter(Boolean) : cfg.styles;
    if (!pool.length) { root.hidden = true; return; }

    /* ---------- 2. Map the product's options onto frames ---------- */
    var opts = (product.options || []).map(lower);
    var sizeIdx = opts.indexOf(lower(settings.sizeOption || "Size"));
    var colorIdx = opts.indexOf(lower(settings.colorOption || "Frame Colour"));
    var variants = product.variants || [];

    function uniq(idx) {
      var out = [];
      variants.forEach(function (v) { var x = v.options[idx]; if (x && out.indexOf(x) === -1) out.push(x); });
      return out;
    }
    var sizes = sizeIdx > -1 ? uniq(sizeIdx) : [];
    var colorValues = colorIdx > -1 ? uniq(colorIdx) : [];

    function styleForValue(val) {
      var k = lower(val);
      for (var i = 0; i < pool.length; i++) if ((pool[i].match || []).indexOf(k) > -1) return pool[i];
      return null;
    }

    // Swatches: product colour values that have a frame; if the product has no
    // colour option, the frames themselves become a visual-only choice.
    var swatches = colorIdx > -1
      ? colorValues.map(function (v) { return { value: v, style: styleForValue(v) }; }).filter(function (x) { return x.style; })
      : pool.map(function (s) { return { value: s.name, style: s }; });
    if (!swatches.length) { root.hidden = true; return; }

    /* ---------- 3. State ---------- */
    var start = variants.filter(function (v) { return String(v.id) === String(product.selected); })[0] || variants[0];
    var state = {
      size: sizeIdx > -1 && start ? start.options[sizeIdx] : sizes[0],
      color: colorIdx > -1 && start ? start.options[colorIdx] : swatches[0].value
    };
    if (!swatches.some(function (s) { return s.value === state.color; })) state.color = swatches[0].value;

    // Every other product option (mat, glass, finish…) so the customer can
    // pick a full variant from the popup.
    var extraIdx = [];
    (product.options || []).forEach(function (_, i) { if (i !== sizeIdx && i !== colorIdx) extraIdx.push(i); });
    state.extra = {};
    extraIdx.forEach(function (i) { state.extra[i] = start ? start.options[i] : uniq(i)[0]; });

    function currentVariant() {
      return variants.filter(function (v) {
        if (sizeIdx > -1 && v.options[sizeIdx] !== state.size) return false;
        if (colorIdx > -1 && v.options[colorIdx] !== state.color) return false;
        for (var j = 0; j < extraIdx.length; j++) if (v.options[extraIdx[j]] !== state.extra[extraIdx[j]]) return false;
        return true;
      })[0] || null;
    }

    /* ---------- 4. Elements ---------- */
    var q = function (s) { return root.querySelector(s); };
    var frame = q("[data-cqf-frame]"), mat = q("[data-cqf-mat]"), art = q("[data-cqf-art]");
    var caption = q("[data-cqf-caption]"), priceEl = q("[data-cqf-price]"), buy = q("[data-cqf-buy]");
    var msg = q("[data-cqf-msg]");
    var room = q("[data-cqf-room]"), roomImg = q("[data-cqf-room-img]"), hang = q("[data-cqf-hang]");
    var dimW = q("[data-cqf-dim-w]"), dimH = q("[data-cqf-dim-h]");
    var sofa = q("[data-cqf-sofa]"), person = q("[data-cqf-person]");

    // Merchant's room photo isn't to scale, so it's only used behind Close-up.
    if (settings.roomImageUrl) {
      roomImg.src = settings.roomImageUrl;
      roomImg.hidden = false;
    }

    /* ---------- Real-world wall (all maths in inches) ----------
       The stage box is 4:3, so a wall H inches tall is H*4/3 inches wide and
       1 inch is the same number of pixels both ways — everything is to scale. */
    var WALL_FT = Math.min(12, Math.max(7, parseFloat(room.dataset.wallFt) || 9));
    var WALL_H = WALL_FT * 12;
    var WALL_W = WALL_H * 4 / 3;
    // Real room photo: the merchant tells us how wide the wall in it is; the
    // stage takes the photo's own aspect ratio so nothing is cropped.
    var photoFt = parseFloat(room.dataset.photoFt);
    var photoRatio = parseFloat(room.dataset.photoRatio);
    var hasPhoto = !!(photoFt && photoRatio);
    var hangX = 50, hangY = 50;
    if (hasPhoto) {
      WALL_W = photoFt * 12;
      WALL_H = WALL_W / photoRatio;
      hangX = parseFloat(room.dataset.hangX) || 50;
      hangY = parseFloat(room.dataset.hangY) || 40;
    }
    hang.style.left = hangX + "%";
    hang.style.top = hangY + "%";
    var SOFA = { w: 84, h: 30 };      // a standard 3-seater, 7 ft wide
    var PERSON = { w: 20, h: 66 };    // 5 ft 6 in
    var showSofa = !hasPhoto && room.dataset.sofa === "true";
    var showPerson = !hasPhoto && room.dataset.person === "true";
    var view = "wall";

    function pctW(inches) { return (inches / WALL_W * 100) + "%"; }
    function pctH(inches) { return (inches / WALL_H * 100) + "%"; }
    function ftIn(inches) {
      var ft = Math.floor(inches / 12), inch = Math.round(inches - ft * 12);
      if (inch === 12) { ft++; inch = 0; }
      return ft + " ft" + (inch ? " " + inch + " in" : "");
    }
    function cm(inches) { return Math.round(inches * 2.54); }
    function num(n) { return String(Math.round(n * 10) / 10); }

    q("[data-cqf-wall-chip]").textContent = hasPhoto
      ? "Wall shown about " + ftIn(WALL_W) + " wide"
      : "Wall " + ftIn(WALL_W) + " wide \u00d7 " + ftIn(WALL_H) + " high";

    var ruler = q("[data-cqf-ruler]");
    var ticks = "";
    for (var t = 6; !hasPhoto && t < WALL_H; t += 6) {
      var major = t % 12 === 0;
      ticks += '<i class="' + (major ? "is-major" : "") + '" style="bottom:' + pctH(t) + '">' +
        (major ? "<span>" + (t / 12) + " ft</span>" : "") + "</i>";
    }
    ruler.innerHTML = ticks;

    if (showSofa) {
      sofa.removeAttribute("hidden");
      sofa.style.width = pctW(SOFA.w);
      sofa.style.height = pctH(SOFA.h);
    }
    if (showPerson) {
      person.removeAttribute("hidden");
      var px0 = showSofa ? WALL_W / 2 + SOFA.w / 2 + 8 : WALL_W * 0.78;
      px0 = Math.min(px0, WALL_W - PERSON.w - 4);
      person.style.left = pctW(px0);
      person.style.width = pctW(PERSON.w);
      person.style.height = pctH(PERSON.h);
    }

    // Something everyone can picture, by longest side
    function compare(w, h) {
      var a = Math.max(w, h), b = Math.min(w, h);
      if (a <= 7) return "about the size of a postcard";
      if (a <= 12.5 && b <= 9) return "about the size of an A4 sheet";
      if (a <= 17.5 && b <= 12.5) return "about the size of an A3 sheet";
      if (a <= 24.5 && b <= 18) return "about the size of an A2 poster";
      if (a <= 36.5 && b <= 25) return "about the size of an A1 poster";
      if (a <= 48) return "a large statement piece";
      return "an extra-large statement piece";
    }

    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
    }

    /* ---------- 5. Controls ---------- */
    var colorsWrap = q("[data-cqf-colors]");
    // No colon / current-value repeated in the label — each swatch already
    // shows its own name underneath, matching the target design.
    q("[data-cqf-color-label]").textContent = colorIdx > -1 ? product.options[colorIdx] : "Frame Colour";
    colorsWrap.querySelector(".cqf__swatches").innerHTML = swatches.map(function (sw) {
      var s = sw.style;
      var chip = s.swatch && s.swatch.url
        ? "background:center/cover url('" + esc(s.swatch.url) + "')"
        : s.png && s.png.url ? "background:center/cover url('" + esc(s.png.url) + "')"
        : "background:" + ((s.css && s.css.face) || (s.swatch && s.swatch.color) || "#ccc");
      return '<button type="button" class="cqf__swatch" role="radio" aria-checked="false" data-cqf-color="' + esc(sw.value) + '" title="' + esc(sw.value) + '">' +
        '<span class="cqf__chip" style="' + chip + '"></span>' +
        '<span class="cqf__swatch-name">' + esc(sw.value) + "</span></button>";
    }).join("");
    colorsWrap.hidden = false;

    if (sizes.length) {
      var sizesWrap = q("[data-cqf-sizes]");
      q("[data-cqf-size-label]").textContent = product.options[sizeIdx];
      sizesWrap.querySelector(".cqf__sizes").innerHTML = sizes.map(function (sz) {
        return '<button type="button" class="cqf__size" role="radio" aria-checked="false" data-cqf-size="' + esc(sz) + '">' + esc(sz) +
          (function () { var d = parseSize(sz); return d ? "<small>" + cm(d.w) + " \u00d7 " + cm(d.h) + " cm</small>" : ""; })() +
          "</button>";
      }).join("");
      sizesWrap.hidden = false;
    }

    var extraWrap = q("[data-cqf-extra]");
    extraWrap.innerHTML = extraIdx.map(function (i) {
      var vals = uniq(i);
      if (vals.length < 2) return "";
      return '<div class="cqf__group"><p class="cqf__label">' + esc(product.options[i]) + '</p><div class="cqf__sizes" role="radiogroup">' +
        vals.map(function (v) {
          return '<button type="button" class="cqf__size" role="radio" aria-checked="false" data-cqf-extra-idx="' + i + '" data-cqf-extra-val="' + esc(v) + '">' + esc(v) + "</button>";
        }).join("") + "</div></div>";
    }).join("");

    // Orientation: only offered when at least one size isn't square
    var orientWrap = q("[data-cqf-orient-wrap]");
    var anyRect = sizes.some(function (sz) { var d = parseSize(sz); return d && d.w !== d.h; });
    var firstDim = parseSize(state.size);
    state.orient = firstDim && firstDim.w > firstDim.h ? "landscape" : "portrait";
    if (orientWrap && anyRect) orientWrap.hidden = false;
    var canOrient = !!(orientWrap && anyRect);

    function oriented(d) {
      if (!d || !canOrient) return d;
      var a = Math.min(d.w, d.h), b = Math.max(d.w, d.h);
      return state.orient === "landscape" ? { w: b, h: a } : { w: a, h: b };
    }

    /* ---------- 6. Render ---------- */
    function parseSize(label) {
      var m = String(label || "").match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
      if (!m) return null;
      var w = parseFloat(m[1]), h = parseFloat(m[2]), unit = String(label).toLowerCase();
      // Sizes are inches unless the label says cm / mm / ft
      var f = /\bcm\b|centimet/.test(unit) ? 1 / 2.54 : /\bmm\b/.test(unit) ? 1 / 25.4 : /\bft\b|feet|foot/.test(unit) ? 12 : 1;
      return { w: w * f, h: h * f };
    }

    function money(cents) {
      var fmt = (window.Shopify && window.Shopify.money_format) || "{{amount}}";
      var a = (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      var n = String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return fmt.replace(/\{\{\s*amount_no_decimals[^}]*\}\}/g, n).replace(/\{\{\s*amount[^}]*\}\}/g, a);
    }

    function applyStyle(s, dim) {
      // Moulding width in px = thickness % of the frame's short side.
      var box = frame.getBoundingClientRect();
      var shortSide = Math.min(box.width, box.height) || 300;
      var px = Math.max(2, Math.round(shortSide * ((s.thickness || 5) / 100)));

      if (s.png && s.png.url) {
        frame.classList.add("cqf__frame--png");
        frame.style.borderWidth = px + "px";
        frame.style.borderImageSource = 'url("' + s.png.url + '")';
        frame.style.borderImageSlice = s.png.slice.map(function (x) { return x + "%"; }).join(" ");
        frame.style.background = "";
        frame.style.padding = "0";
      } else {
        frame.classList.remove("cqf__frame--png");
        frame.style.borderWidth = "0";
        frame.style.borderImageSource = "none";
        frame.style.background = (s.css && s.css.face) || "#2b2b2b";
        frame.style.padding = px + "px";
        frame.style.setProperty("--cqf-edge", (s.css && s.css.edge) || "#0a0a0a");
      }

      if (s.mat) {
        mat.style.background = s.mat.color;
        mat.style.padding = Math.round(px * (s.mat.width / Math.max(s.thickness || 5, 1))) + "px";
        mat.classList.add("has-mat");
      } else {
        mat.style.background = "transparent";
        mat.style.padding = "0";
        mat.classList.remove("has-mat");
      }
    }

    function render() {
      var sw = swatches.filter(function (x) { return x.value === state.color; })[0] || swatches[0];
      var real = oriented(parseSize(state.size));
      var dim = real || { w: 16, h: 24 };

      // True size: inches on the wall. Close-up: same shape, blown up to fit.
      var k = view === "close" ? Math.min(0.78 * WALL_H / dim.h, 0.8 * WALL_W / dim.w) : 1;
      hang.style.left = (view === "close" ? 50 : hangX) + "%";
      hang.style.top = (view === "close" ? 50 : hangY) + "%";
      hang.style.width = pctW(dim.w * k);
      hang.style.height = pctH(dim.h * k);
      dimW.innerHTML = "<b>" + num(dim.w) + " in</b>";
      dimH.innerHTML = "<b>" + num(dim.h) + " in</b>";
      // Measure after the size change has laid out, then draw the moulding.
      setTimeout(function () { applyStyle(sw.style, dim); }, 420);

      var currentEl = q("[data-cqf-color-current]");
      if (currentEl) currentEl.textContent = state.color;
      if (real) {
        var ftTxt = Math.max(dim.w, dim.h) >= 24 ? ", " + ftIn(dim.w) + " \u00d7 " + ftIn(dim.h) : "";
        caption.innerHTML = "<strong>" + esc(state.color) + " frame, " + num(dim.w) + " \u00d7 " + num(dim.h) + " in</strong> (" +
          cm(dim.w) + " \u00d7 " + cm(dim.h) + " cm" + ftTxt + "), " + compare(dim.w, dim.h) + ". " +
          (view === "close"
            ? "Close-up is not to scale. Switch to True size to see it on the wall."
            : "Drawn to scale on a " + ftIn(WALL_W) + " \u00d7 " + ftIn(WALL_H) + " wall" +
              (showSofa ? " above a 7 ft sofa" : "") + ".");
      } else {
        caption.textContent = [state.color, state.size].filter(Boolean).join(", ");
      }

      root.querySelectorAll("[data-cqf-color]").forEach(function (b) {
        var on = b.dataset.cqfColor === state.color;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      });
      root.querySelectorAll("[data-cqf-size]").forEach(function (b) {
        var on = b.dataset.cqfSize === state.size;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      });

      root.querySelectorAll("[data-cqf-extra-idx]").forEach(function (b) {
        var on = state.extra[b.dataset.cqfExtraIdx] === b.dataset.cqfExtraVal;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      });
      root.querySelectorAll("[data-cqf-orient]").forEach(function (b) {
        var on = b.dataset.cqfOrient === state.orient;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      });

      var v = currentVariant();
      var ok = !!(v && v.available !== false);
      buy.hidden = false;
      priceEl.textContent = v ? money(v.price) : "Not available";
      [q("[data-cqf-apply]"), q("[data-cqf-add]"), q("[data-cqf-buynow]")].forEach(function (b) { if (b) b.disabled = !v || (b !== q("[data-cqf-apply]") && !ok); });
      msg.hidden = ok || !v;
      msg.textContent = v && !ok ? (blockCfg.soldOut || "Sold out") : "";
    }

    /* ---------- 7. Sync with the theme's product form ---------- */
    var syncing = false;
    function productForms() {
      return Array.prototype.filter.call(document.querySelectorAll('form[action*="/cart/add"]'), function (f) { return !root.contains(f); });
    }
    function orientationValue() {
      return canOrient ? (state.orient === "landscape" ? "Landscape" : "Portrait") : null;
    }
    function pushToTheme(v) {
      if (!v) return;
      syncing = true;
      var orient = orientationValue();

      // Themes can listen for this and update their own picker precisely
      // (the Craft Quest theme does — see sections/cq-product.liquid).
      document.dispatchEvent(new CustomEvent("cqf:apply", { detail: { variant: v, orientation: orient } }));
      var themeListens = !!document.querySelector("[data-cqf-listener]");

      productForms().forEach(function (form) {
        if (!themeListens) {
          // Generic fallback: tick matching radios/selects inside the product form
          v.options.forEach(function (val) {
            Array.prototype.forEach.call(form.querySelectorAll('input[type="radio"]'), function (r) {
              if (r.value === val && !r.checked) { r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); }
            });
            Array.prototype.forEach.call(form.querySelectorAll("select"), function (sel) {
              var has = Array.prototype.some.call(sel.options, function (o) { return o.value === val; });
              if (has && sel.value !== val) { sel.value = val; sel.dispatchEvent(new Event("change", { bubbles: true })); }
            });
          });
          Array.prototype.forEach.call(form.querySelectorAll('[name="id"]'), function (input) {
            if (input.value !== String(v.id)) { input.value = String(v.id); input.dispatchEvent(new Event("change", { bubbles: true })); }
          });
        }
        // Orientation rides along as a line item property
        if (blockCfg.orientationProperty && orient) {
          var name = "properties[" + blockCfg.orientationProperty + "]";
          var p = form.querySelector('input[name="' + CSS.escape(name) + '"]');
          if (!p) { p = document.createElement("input"); p.type = "hidden"; p.name = name; p.setAttribute("data-cqf-prop", ""); form.appendChild(p); }
          p.value = orient;
        }
      });

      var url = new URL(location.href);
      url.searchParams.set("variant", v.id);
      history.replaceState(history.state, "", url);
      setTimeout(function () { syncing = false; }, 80);
    }

    function cartLine(v) {
      var qtyInput = productForms().map(function (f) { return f.querySelector('[name="quantity"]'); }).filter(Boolean)[0];
      var line = { id: v.id, quantity: Math.max(1, parseInt(qtyInput && qtyInput.value, 10) || 1) };
      var orient = orientationValue();
      if (blockCfg.orientationProperty && orient) { line.properties = {}; line.properties[blockCfg.orientationProperty] = orient; }
      return line;
    }
    var rootUrl = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";

    function addToCart(v, thenCheckout) {
      pushToTheme(v);
      if (!thenCheckout) {
        // Prefer the theme's own button so its cart drawer / counter update
        var btn = productForms().map(function (f) { return f.querySelector('[type="submit"][name="add"], button[type="submit"]'); }).filter(Boolean)[0];
        if (btn) {
          closeModal();
          setTimeout(function () { btn.disabled = false; btn.click(); }, 150);
          return;
        }
      }
      var buttons = root.querySelectorAll("[data-cqf-add], [data-cqf-buynow]");
      buttons.forEach(function (b) { b.disabled = true; });
      fetch(rootUrl + "cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ items: [cartLine(v)] })
      }).then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.description || e.message || "Could not add to cart"); });
        location.href = rootUrl + (thenCheckout ? "checkout" : "cart");
      }).catch(function (e) {
        msg.textContent = e.message; msg.hidden = false;
        buttons.forEach(function (b) { b.disabled = false; });
      });
    }

    function pullFromVariantId(id) {
      if (syncing) return;
      var v = variants.filter(function (x) { return String(x.id) === String(id); })[0];
      if (!v) return;
      if (sizeIdx > -1) state.size = v.options[sizeIdx];
      if (colorIdx > -1 && swatches.some(function (s) { return s.value === v.options[colorIdx]; })) state.color = v.options[colorIdx];
      extraIdx.forEach(function (i) { state.extra[i] = v.options[i]; });
      render();
    }

    // Theme → preview: form id changes, URL changes, and the CQ theme's event
    document.addEventListener("change", function (e) {
      if (root.contains(e.target)) return;
      var form = e.target.closest && e.target.closest('form[action*="/cart/add"]');
      if (form) setTimeout(function () {
        var idInput = form.querySelector('[name="id"]');
        if (idInput) pullFromVariantId(idInput.value);
      }, 30);
    });
    document.addEventListener("cq:variant-change", function (e) {
      if (e.detail && e.detail.variant) pullFromVariantId(e.detail.variant.id);
    });
    window.addEventListener("popstate", function () {
      var id = new URLSearchParams(location.search).get("variant");
      if (id) pullFromVariantId(id);
    });

    /* ---------- Art image follows the gallery ----------
       The customer may have picked any image in the theme's gallery; the
       popup shows that one. Order: active gallery slide → variant image →
       whatever Liquid rendered. */
    var media = [];
    try { media = JSON.parse(root.querySelector("[data-cqf-media]").textContent) || []; } catch (e) {}
    var mediaById = {};
    media.forEach(function (m) { mediaById[String(m.id)] = m; });

    var ACTIVE_SELECTORS = [
      "[data-cq-slide].is-active[data-media-id]",          // Craft Quest theme
      ".product__media-item.is-active[data-media-id]",     // Dawn & friends
      "[data-media-id].is-active",
      "[data-media-id].is-selected",
      "[data-media-id][aria-current=\"true\"]",
      "[data-media-id].active",
      ".swiper-slide-active[data-media-id]",
      ".slick-current[data-media-id]"
    ];
    function mediaIdOf(el) {
      // Some themes use "sectionId-12345" — take the trailing number
      var m = String(el.getAttribute("data-media-id") || "").match(/(\d+)\s*$/);
      return m ? m[1] : null;
    }
    function activeGalleryMediaId() {
      for (var i = 0; i < ACTIVE_SELECTORS.length; i++) {
        var els = document.querySelectorAll(ACTIVE_SELECTORS[i]);
        for (var j = 0; j < els.length; j++) {
          if (root.contains(els[j])) continue;
          var id = mediaIdOf(els[j]);
          if (id && mediaById[id]) return id;
        }
      }
      return null;
    }
    function setArt(m) {
      if (!art || !m) return;
      if (art.getAttribute("data-cqf-art-id") === String(m.id)) return;
      art.setAttribute("data-cqf-art-id", String(m.id));
      art.removeAttribute("loading");
      art.srcset = m.srcset || "";
      art.src = m.src;
    }
    function syncArt() {
      var id = activeGalleryMediaId();
      if (!id) {
        var v = currentVariant();
        if (v && v.featured_media && mediaById[String(v.featured_media.id)]) id = String(v.featured_media.id);
      }
      if (id) setArt(mediaById[id]);
    }

    /* ---------- 8. Popup open/close ---------- */
    var modal = q("[data-cqf-modal]");
    function openModal() {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.documentElement.style.overflow = "hidden";
      syncArt();
      render();
    }
    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.documentElement.style.overflow = "";
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
    });

    /* ---------- 9. Interactions ---------- */
    root.addEventListener("click", function (e) {
      if (e.target.closest("[data-cqf-open]")) { openModal(); return; }
      if (e.target.closest("[data-cqf-close]")) { closeModal(); return; }

      var c = e.target.closest("[data-cqf-color]");
      if (c) { state.color = c.dataset.cqfColor; render(); return; }
      var s = e.target.closest("[data-cqf-size]");
      if (s) { state.size = s.dataset.cqfSize; render(); return; }
      var ex = e.target.closest("[data-cqf-extra-idx]");
      if (ex) { state.extra[ex.dataset.cqfExtraIdx] = ex.dataset.cqfExtraVal; render(); return; }
      var ob = e.target.closest("[data-cqf-orient]");
      if (ob) { state.orient = ob.dataset.cqfOrient; render(); return; }
      if (e.target.closest("[data-cqf-add]")) { var va = currentVariant(); if (va) addToCart(va, false); return; }
      if (e.target.closest("[data-cqf-buynow]")) { var vn = currentVariant(); if (vn) addToCart(vn, true); return; }
      var vb = e.target.closest("[data-cqf-view]");
      if (vb) {
        view = vb.dataset.cqfView;
        root.classList.toggle("cqf--close", view === "close");
        root.querySelectorAll("[data-cqf-view]").forEach(function (b) {
          var on = b === vb;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        render();
        return;
      }
      if (e.target.closest("[data-cqf-apply]")) {
        // Clicks inside the popup only change the preview; Apply commits the
        // variant (and orientation) to the product page.
        pushToTheme(currentVariant());
        closeModal();
      }
    });

    // Redraw moulding thickness when the stage resizes
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        var sw = swatches.filter(function (x) { return x.value === state.color; })[0];
        if (sw) applyStyle(sw.style);
      }).observe(frame);
    }

    render();
  }
})();
