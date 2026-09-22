/* Craft Quest Frames — storefront renderer.
   Theme-agnostic: resolves which frames apply to this product from the
   published config, draws them (PNG via border-image, or CSS), and keeps the
   theme's product form in sync so its own price and buy button follow. */
(function () {
  // App embeds render near the end of <body> by default. Move this embed's
  // markup into the product info column (right side, above the title/price
  // blocks) so it behaves like a built-in part of that section instead of a
  // block the merchant has to place by hand.
  function reposition() {
    var embed = document.querySelector("[data-cqf-embed]");
    var target = document.querySelector(".cq-pdp__info");
    if (embed && target && embed.parentElement !== target) {
      target.insertBefore(embed, target.firstChild);
    }
  }
  reposition();
  document.addEventListener("shopify:section:load", reposition);

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

    function currentVariant() {
      return variants.filter(function (v) {
        if (sizeIdx > -1 && v.options[sizeIdx] !== state.size) return false;
        if (colorIdx > -1 && v.options[colorIdx] !== state.color) return false;
        return true;
      })[0] || null;
    }

    /* ---------- 4. Elements ---------- */
    var q = function (s) { return root.querySelector(s); };
    var frame = q("[data-cqf-frame]"), mat = q("[data-cqf-mat]"), art = q("[data-cqf-art]");
    var caption = q("[data-cqf-caption]"), priceEl = q("[data-cqf-price]"), buy = q("[data-cqf-buy]");
    var atc = q("[data-cqf-atc]"), msg = q("[data-cqf-msg]");
    var roomImg = q("[data-cqf-room-img]"), toggle = q("[data-cqf-toggle]"), scaleEl = q("[data-cqf-scale]");

    if (settings.roomImageUrl) {
      roomImg.src = settings.roomImageUrl;
      roomImg.hidden = false;
      toggle.hidden = false;
    }
    if (settings.showScale) scaleEl.hidden = false;

    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
    }

    /* ---------- 5. Controls ---------- */
    var colorsWrap = q("[data-cqf-colors]");
    q("[data-cqf-color-label]").textContent = (colorIdx > -1 ? product.options[colorIdx] : "Frame") + ":";
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
        return '<button type="button" class="cqf__size" role="radio" aria-checked="false" data-cqf-size="' + esc(sz) + '">' + esc(sz) + "</button>";
      }).join("");
      sizesWrap.hidden = false;
    }

    /* ---------- 6. Render ---------- */
    function parseSize(label) {
      var m = String(label || "").match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
      return m ? { w: parseFloat(m[1]), h: parseFloat(m[2]) } : null;
    }
    var maxSide = 0;
    sizes.forEach(function (s) { var d = parseSize(s); if (d) maxSide = Math.max(maxSide, d.w, d.h); });

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
      var px = Math.max(4, Math.round(shortSide * ((s.thickness || 5) / 100)));

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
      var dim = parseSize(state.size) || { w: 2, h: 3 };
      var longest = Math.max(dim.w, dim.h);
      var scale = maxSide ? Math.max(0.4, longest / maxSide) : 1;

      frame.style.aspectRatio = dim.w + " / " + dim.h;
      frame.style.setProperty("--cqf-scale", scale.toFixed(3));
      // Measure after the size change has laid out, then draw the moulding.
      requestAnimationFrame(function () { applyStyle(sw.style, dim); });

      q("[data-cqf-color-current]").textContent = state.color;
      caption.textContent = [state.color, state.size].filter(Boolean).join(" · ");

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

      var v = currentVariant();
      if (v) {
        buy.hidden = false;
        priceEl.textContent = money(v.price);
        if (atc) { atc.disabled = !v.available; atc.textContent = v.available ? root.dataset.atcLabel : "Sold out"; }
        if (v.featured_image && art) art.src = v.featured_image.src;
      } else {
        buy.hidden = false;
        priceEl.textContent = "Not available";
        if (atc) atc.disabled = true;
      }
    }

    /* ---------- 7. Sync with the theme's product form ---------- */
    var syncing = false;
    function pushToTheme(v) {
      if (!v) return;
      syncing = true;
      // Generic: every product form on the page carries the variant id here
      document.querySelectorAll('form[action*="/cart/add"] [name="id"]').forEach(function (input) {
        if (input.value !== String(v.id)) {
          input.value = String(v.id);
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      // Themes that render option radios/selects: tick the matching values
      [[sizeIdx, state.size], [colorIdx, state.color]].forEach(function (pair) {
        if (pair[0] < 0) return;
        document.querySelectorAll('input[type="radio"][value="' + CSS.escape(pair[1]) + '"]').forEach(function (r) {
          if (!r.checked && !root.contains(r)) { r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); }
        });
        document.querySelectorAll("select").forEach(function (sel) {
          if (root.contains(sel)) return;
          var opt = Array.prototype.filter.call(sel.options, function (o) { return o.value === pair[1]; })[0];
          if (opt && sel.value !== pair[1]) { sel.value = pair[1]; sel.dispatchEvent(new Event("change", { bubbles: true })); }
        });
      });
      var url = new URL(location.href);
      url.searchParams.set("variant", v.id);
      history.replaceState(history.state, "", url);
      setTimeout(function () { syncing = false; }, 50);
    }

    function pullFromVariantId(id) {
      if (syncing) return;
      var v = variants.filter(function (x) { return String(x.id) === String(id); })[0];
      if (!v) return;
      if (sizeIdx > -1) state.size = v.options[sizeIdx];
      if (colorIdx > -1 && swatches.some(function (s) { return s.value === v.options[colorIdx]; })) state.color = v.options[colorIdx];
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

    /* ---------- 8. Interactions ---------- */
    root.addEventListener("click", function (e) {
      var c = e.target.closest("[data-cqf-color]");
      if (c) { state.color = c.dataset.cqfColor; render(); pushToTheme(currentVariant()); return; }
      var s = e.target.closest("[data-cqf-size]");
      if (s) { state.size = s.dataset.cqfSize; render(); pushToTheme(currentVariant()); return; }
      if (e.target.closest("[data-cqf-toggle]")) {
        var plain = root.classList.toggle("cqf--plain");
        toggle.setAttribute("aria-pressed", plain ? "false" : "true");
        return;
      }
      if (e.target.closest("[data-cqf-atc]")) addToCart();
    });

    function addToCart() {
      var v = currentVariant();
      if (!v || !v.available) return;
      var root_ = (window.Shopify && Shopify.routes && Shopify.routes.root) || "/";
      atc.disabled = true;
      atc.textContent = "Adding…";
      fetch(root_ + "cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ items: [{ id: v.id, quantity: 1 }] })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok || res.j.status) throw new Error(res.j.description || "Could not add to cart");
          atc.textContent = "Added ✓";
          // Let themes that listen for these refresh their cart UI
          document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
          document.dispatchEvent(new CustomEvent("cart:update", { bubbles: true, detail: { data: { source: "cq-frames", variantId: v.id } } }));
          if (window.CQ && window.CQ.syncCart) window.CQ.syncCart(null);
          if (window.CQ && window.CQ.openCart) window.CQ.openCart();
          setTimeout(render, 1600);
        })
        .catch(function (err) {
          msg.hidden = false;
          msg.textContent = err.message;
          render();
        });
    }

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