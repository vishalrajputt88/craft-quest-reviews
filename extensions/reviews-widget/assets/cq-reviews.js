/* Craft Quest Reviews — storefront widget.
   Renders into the theme's own cq-previews markup, so the design matches the
   theme section exactly. Data comes from the app through the App Proxy. */
(function () {
  if (!window.customElements || !customElements.get("iconify-icon")) {
    var ic = document.createElement("script");
    ic.src = "https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js";
    ic.async = true;
    document.head.appendChild(ic);
  }

  document.querySelectorAll("[data-cqr]").forEach(init);

  function init(root) {
    if (root.__cqr) return;
    root.__cqr = true;

    var proxy = root.dataset.proxy;
    var productId = root.dataset.productId;
    var state = { page: 1, pages: 1, sort: "recent" };

    var track = root.querySelector("[data-cqr-track]");
    var barsEl = root.querySelector("[data-cqr-bars]");
    var carousel = root.querySelector("[data-cqr-carousel]");
    var prevBtn = root.querySelector("[data-cqr-prev]");
    var nextBtn = root.querySelector("[data-cqr-next]");
    var modal = root.querySelector("[data-cqr-modal]");
    var form = root.querySelector("[data-cqr-form]");
    var msg = root.querySelector("[data-cqr-msg]");

    function esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }
    function icon(name, size) {
      return '<iconify-icon icon="' + name + '" width="' + size + '" height="' + size + '" class="cq-icon"></iconify-icon>';
    }
    function starRow(n, size) {
      var out = "";
      for (var i = 1; i <= 5; i++) out += icon(i <= n ? "mdi:star" : "mdi:star-outline", size || 14);
      return out;
    }
    function initials(name) {
      return String(name || "?").trim().charAt(0).toUpperCase();
    }

    /* ---------- Render ---------- */
    function renderSummary(s) {
      root.querySelector("[data-cqr-avg]").textContent = Number(s.average || 0).toFixed(1);
      root.querySelector("[data-cqr-avg-stars]").innerHTML = starRow(Math.round(s.average || 0), 20);
      root.querySelector("[data-cqr-based]").textContent =
        "Based on " + s.count + (s.count === 1 ? " review" : " reviews");

      var rows = barsEl.querySelectorAll(".cq-previews__bar-row");
      for (var i = 0; i < rows.length; i++) {
        var star = 5 - i;
        var n = (s.buckets && s.buckets[star]) || 0;
        var pct = s.count ? Math.round((n / s.count) * 100) : 0;
        rows[i].querySelector(".cq-previews__bar span").style.width = pct + "%";
        rows[i].querySelector(".cq-previews__bar-pct").textContent = pct + "%";
      }
    }

    function reviewCard(r) {
      var photos = (r.images || []).map(function (u) {
        return '<img src="' + esc(u) + '" alt="" loading="lazy">';
      }).join("");

      return '<article class="cq-preview">' +
        '<header class="cq-preview__head">' +
          '<span class="cq-preview__avatar">' + esc(initials(r.authorName)) + "</span>" +
          '<div class="cq-preview__who">' +
            "<strong>" + esc(r.authorName) + "</strong>" +
            (r.verified
              ? '<span class="cq-preview__verified">' + icon("mdi:check-decagram", 14) + " Verified Purchase</span>"
              : "") +
            '<span class="cq-stars cq-stars--gold">' + starRow(r.rating, 14) + "</span>" +
          "</div>" +
          '<time class="cq-preview__date">' +
            new Date(r.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
          "</time>" +
        "</header>" +
        (r.title ? '<p class="cq-preview__text"><strong>' + esc(r.title) + "</strong></p>" : "") +
        '<p class="cq-preview__text">' + esc(r.body) + "</p>" +
        (photos ? '<div class="cqr__photos">' + photos + "</div>" : "") +
        (r.reply
          ? '<div class="cqr__reply"><strong>Store reply</strong><p>' + esc(r.reply) + "</p></div>"
          : "") +
        "</article>";
    }

    function renderList(reviews, append) {
      if (!reviews.length && !append) {
        // Empty state: the bars and arrows carry no information yet, so the
        // whole block collapses to one centred column with a single call to act.
        root.classList.add("cqr-is-empty");
        track.innerHTML =
          '<div class="cqr-empty">' +
            '<span class="cqr-empty__icon">' + icon("mdi:message-star-outline", 40) + "</span>" +
            "<h3>No reviews yet</h3>" +
            "<p>Be the first to share your thoughts about this product.</p>" +
            '<button type="button" class="cq-btn cq-btn--gold" data-cqr-open>' + (root.dataset.writeLabel || "Write a review") + "</button>" +
          "</div>";
        if (prevBtn) prevBtn.hidden = true;
        if (nextBtn) nextBtn.hidden = true;
        return;
      }
      root.classList.remove("cqr-is-empty");
      var html = reviews.map(reviewCard).join("");
      if (append) track.insertAdjacentHTML("beforeend", html);
      else track.innerHTML = html;

      var many = track.querySelectorAll(".cq-preview").length > 1;
      if (prevBtn) prevBtn.hidden = !many;
      if (nextBtn) nextBtn.hidden = !many;
      updateArrows();
    }

    function load(append) {
      var url = proxy + "/reviews?productId=" + encodeURIComponent(productId) +
                "&page=" + state.page + "&sort=" + state.sort;
      return fetch(url, { headers: { Accept: "application/json" } })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) throw new Error(data.error);
          state.pages = data.pages;
          renderSummary(data.stats || { average: 0, count: 0, buckets: {} });
          renderList(data.reviews, append);
        })
        .catch(function () {
          track.innerHTML = '<p class="cq-previews__note">Reviews are unavailable right now.</p>';
        });
    }

    /* ---------- Carousel ---------- */
    function step() {
      var card = track.querySelector(".cq-preview");
      var gap = parseFloat(getComputedStyle(track).gap) || 12;
      return card ? card.getBoundingClientRect().width + gap : track.clientWidth;
    }
    function updateArrows() {
      if (!prevBtn || !nextBtn) return;
      var max = track.scrollWidth - track.clientWidth - 1;
      prevBtn.disabled = track.scrollLeft <= 0;
      nextBtn.disabled = track.scrollLeft >= max;
      // Pull the next page in when the viewer reaches the end
      if (track.scrollLeft >= max && state.page < state.pages) {
        state.page++;
        load(true);
      }
    }
    track.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    if (prevBtn) prevBtn.addEventListener("click", function () { track.scrollBy({ left: -step(), behavior: "smooth" }); });
    if (nextBtn) nextBtn.addEventListener("click", function () { track.scrollBy({ left: step(), behavior: "smooth" }); });

    /* ---------- Modal ---------- */
    if (modal && modal.parentElement !== document.body) {
      var cs = getComputedStyle(root);
      modal.style.setProperty("--cqr-accent", cs.getPropertyValue("--cqr-accent").trim() || "#b8892b");
      modal.style.setProperty("--cqr-star", cs.getPropertyValue("--cqr-star").trim() || "#f5a623");
      document.body.appendChild(modal);
    }
    function openModal() {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.documentElement.style.overflow = "hidden";
      var first = modal.querySelector("input, textarea");
      if (first) setTimeout(function () { first.focus(); }, 60);
    }
    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.documentElement.style.overflow = "";
    }
    modal.addEventListener("click", function (e) {
      if (e.target.closest("[data-cqr-close]")) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
    });
    root.addEventListener("click", function (e) {
      if (e.target.closest("[data-cqr-open]")) openModal();
    });

    /* ---------- Photo upload (Cloudinary, unsigned) ---------- */
    var uploaded = [];
    var fileInput = modal.querySelector("[data-cqr-images]");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        var cloud = root.dataset.cloudName, preset = root.dataset.uploadPreset;
        if (!cloud || !preset) return;
        var previews = modal.querySelector("[data-cqr-previews]");
        Array.prototype.slice.call(fileInput.files, 0, 5).forEach(function (file) {
          var fd = new FormData();
          fd.append("file", file);
          fd.append("upload_preset", preset);
          fetch("https://api.cloudinary.com/v1_1/" + cloud + "/image/upload", { method: "POST", body: fd })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (!d.secure_url) return;
              uploaded.push(d.secure_url);
              modal.querySelector("[data-cqr-image-urls]").value = uploaded.join(",");
              previews.insertAdjacentHTML("beforeend", '<img src="' + d.secure_url + '" alt="">');
            });
        });
      });
    }

    /* ---------- Submit ---------- */
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = form.querySelector(".cqr__submit");
      btn.disabled = true;
      msg.hidden = true;

      fetch(proxy + "/reviews", { method: "POST", body: new FormData(form) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          msg.hidden = false;
          msg.className = "cqr__msg " + (d.ok ? "is-ok" : "is-error");
          msg.textContent = d.message || d.error || "Something went wrong.";
          if (d.ok) {
            form.reset();
            uploaded = [];
            setTimeout(function () { closeModal(); state.page = 1; load(false); }, 1800);
          }
        })
        .catch(function () {
          msg.hidden = false;
          msg.className = "cqr__msg is-error";
          msg.textContent = "Could not submit. Please try again.";
        })
        .finally(function () { btn.disabled = false; });
    });

    load(false);
  }
})();
