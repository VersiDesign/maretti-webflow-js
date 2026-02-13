(() => {
  // Single global namespace for all site interactions
  const SiteGSAP = (window.SiteGSAP = window.SiteGSAP || {});

  // =========================================================
  // SVG loader
  // =========================================================
  SiteGSAP.loadInlineSVG = async function ({ mount, url, onReady }) {
    const mountEl = typeof mount === "string" ? document.querySelector(mount) : mount;

    if (!mountEl) {
      console.warn("loadInlineSVG: mount not found:", mount);
      return null;
    }

    try {
      const res = await fetch(url, { cache: "default" });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const svgText = await res.text();

      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const svg = doc.documentElement;

      if (!svg || doc.querySelector("parsererror")) {
        console.error("SVG parse error");
        return null;
      }

      mountEl.innerHTML = "";
      mountEl.appendChild(svg);

      // Ensure sizing
      svg.style.width = "100%";
      svg.style.height = "100%";
      svg.style.display = "block";

      if (typeof onReady === "function") onReady(svg, mountEl);
      return svg;
    } catch (err) {
      console.error("SVG load failed:", err);
      return null;
    }
  };

  // =========================================================
  // Italy map init
  // =========================================================
  SiteGSAP.initItalyMap = function ({
    mount = "#map",
    url,
    className = "italy-map",
    waves = true,
    regionHoverZoom = true
  }) {
    if (!url) {
      console.warn("initItalyMap: missing url");
      return;
    }

    SiteGSAP.loadInlineSVG({
      mount,
      url,
      onReady: (svg, mountEl) => {
        svg.classList.add(className);
// Let GSAP control the "cover" via base transform
svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
svg.style.width = "100%";
svg.style.height = "100%";
svg.style.display = "block";
        svg.style.outline = "none";
        svg.style.webkitTapHighlightColor = "transparent";
        if (!document.getElementById("map-click-style")) {
          const style = document.createElement("style");
          style.id = "map-click-style";
          style.textContent = `
            .italy-map:focus { outline: none; }
            .italy-map *:focus { outline: none; }
          `;
          document.head.appendChild(style);
        }
        const disableRegionTapZoom = (() => {
          // Disable zoom-in on tablet/mobile taps
          try {
            return (
              window.matchMedia("(max-width: 991px)").matches ||
              window.matchMedia("(pointer: coarse)").matches ||
              window.matchMedia("(hover: none)").matches
            );
          } catch (e) {
            return false;
          }
        })();
        const go = () => {
          // 1) Build zoom layer so both waves + hover-zoom can transform together
          const zoomLayer = ensureZoomLayer(svg);

          // 2) Waves
          if (waves) initOceanWaves(svg);

          // 3) Region hover zoom
          if (regionHoverZoom) {
            initRegionHoverZoom(svg, zoomLayer, mountEl, {
              enableInteractions: !disableRegionTapZoom
            });
          }
        };

        if (document.fonts?.ready) document.fonts.ready.then(go);
        else go();
      }
    });
  };

  // =========================================================
  // Zoom layer helper
  // Wrap all drawable SVG content into a single <g id="zoom-layer">
  // =========================================================
  function ensureZoomLayer(svg) {
    let layer = svg.querySelector("#zoom-layer");
    if (layer) return layer;

    layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    layer.setAttribute("id", "zoom-layer");

    // Keep <defs> in place; move everything else into zoom layer
    const children = Array.from(svg.childNodes);
    const defs = svg.querySelector("defs");

    children.forEach((node) => {
      if (node === defs) return;
      // Only move element nodes (avoid whitespace text nodes messing with order)
      if (node.nodeType === 1) layer.appendChild(node);
    });

    // Insert zoom layer after defs (if exists), otherwise as first element
    if (defs && defs.parentNode === svg) {
      defs.insertAdjacentElement("afterend", layer);
    } else {
      svg.insertBefore(layer, svg.firstChild);
    }

    return layer;
  }

  // =========================================================
  // Region hover zoom (pan + zoom to hovered region bbox center)
  // =========================================================
  function initRegionHoverZoom(svg, zoomLayer, mountEl, opts = {}) {
  if (!window.gsap) {
    console.warn("GSAP not found (Webflow GSAP enabled?)");
    return;
  }
  const enableInteractions = opts.enableInteractions !== false;

  // If the SVG lacks .region classes, fall back to [data-region]
  const regionDataNodes = Array.from(svg.querySelectorAll("[data-region]"));
  if (regionDataNodes.length) {
    regionDataNodes.forEach((el) => el.classList.add("region"));
  }

  const regions = Array.from(svg.querySelectorAll(".region"));
  if (!regions.length) return;

  // (debug line removed)

  // Ensure viewBox exists
  if (!svg.hasAttribute("viewBox")) {
    try {
      const bb = svg.getBBox();
      svg.setAttribute("viewBox", `${bb.x} ${bb.y} ${bb.width} ${bb.height}`);
    } catch (e) {
      console.warn("Could not infer viewBox for SVG.");
    }
  }

  // ====== TUNE THESE ======
  const BASE_PAD = 0;            // padding in SVG units around map when idle
  const BASE_ZOOM = 1.5;         // >1 to slightly crop for a fuller frame
  const BASE_BIAS_X = -150;        // negative = crop more west (left)
  const BASE_BIAS_Y = -100;        // negative = crop more north (top)
  const HOVER_SCALE = 2;       // multiplier relative to base scale
  const HOVER_PAD = 6;            // keep a little buffer while zoomed
  const HOVER_BIAS_X = 50;      // negative = shift zoomed view further left
  const PIEDMONT_HOVER_BIAS_X = 100; // extra bias to prevent overlap on Piedmont hover
  const HOVER_BIAS_Y = 0;         // positive = shift zoomed view down
  const DUR_IN  = 0.75;
  const DUR_OUT = 0.75;
  const EASE_IN  = "power1.inOut";
  const EASE_OUT = "power1.inOut";
  const ACTIVE_CLASS = "is-active";

  // Stabilize hover switching while zoom animates
  const STICKY_PX = 18;           // require pointer move before switching regions
  const SWITCH_COOLDOWN_MS = 220; // minimum time between region switches
  const PARALLAX_STRENGTH = 0.1; // inverse follow (0.0 - 0.2 works well)
  const PARALLAX_MAX_PX = 100;     // cap parallax in SVG units
  const PARALLAX_TAU_SEC = 0.45;  // larger = floatier
  const PARALLAX_FLOAT_PX = 5;    // subtle idle drift
  const PARALLAX_FLOAT_SEC = 12;  // drift period
  const PARALLAX_IDLE_DELAY_MS = 200;
  const HOVER_FORGIVE_PX = 90;    // padded hitbox to reduce edge flicker
  const PUGLIA_HOVER_FORGIVE_RIGHT_PX = 100; // extra forgiveness to the right for Puglia
  const PUGLIA_HOVER_FORGIVE_TOP_PX = 200;   // extra forgiveness to the top for Puglia
  const VENETO_HOVER_FORGIVE_TOP_PX = 100;    // extra forgiveness to the top for Veneto

  // When pointer is over "no region", wait a beat before resetting
  const RESET_DELAY_MS = 0;
  // =======================

  let activeEl = null;
  let tween = null;
  let resetTimer = null;
  let rafPending = false;
  let lastMoveEvent = null;
  let lastSwitchAt = 0;
  let lastSwitchPos = { x: 0, y: 0 };
  let isTweening = false;
  let isZoomedIn = false;
  let parallaxCurrent = { x: 0, y: 0 };
  let parallaxTarget = { x: 0, y: 0 };
  let ignoreParallaxUntilMove = true;
  let lastPointerPos = null;
  const PARALLAX_WAKE_PX = 2; // minimum move to re-enable parallax
  let lastPointerMoveAt = 0;
  const PIEDMONT_REGION_CODE = "06";

  const stopParallax = () => {
    parallaxCurrent = { x: 0, y: 0 };
    parallaxTarget = { x: 0, y: 0 };
    ignoreParallaxUntilMove = true;
  };

  const getViewBox = () => {
    const vb = svg.viewBox.baseVal;
    return { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
  };

  const isPiedmont = (el) => {
    if (!el) return false;
    const code = el.getAttribute("data-region");
    return code === PIEDMONT_REGION_CODE || el.classList.contains("st2");
  };

  const isPuglia = (el) => el && el.classList.contains("st17");
  const isVeneto = (el) => el && el.classList.contains("st1");

  const mapBounds = (() => {
    try { return zoomLayer.getBBox(); } catch (e) { return null; }
  })();

  let base = computeBaseTransform();

  const applyBase = (immediate = false) => {
    base = computeBaseTransform();
    const vars = { x: base.x, y: base.y, scale: base.scale };
    if (!activeEl) {
      if (immediate) {
        gsap.set(zoomLayer, vars);
      } else {
        animateTo(vars, 0.35, "power2.out");
      }
    } else {
      const scale = base.scale * HOVER_SCALE;
      const target = computeTargetForRegion(activeEl, scale);
      if (target) animateTo({ x: target.x, y: target.y, scale: target.scale }, 0.35, "power2.out");
    }
  };

  gsap.set(zoomLayer, {
    transformOrigin: "0px 0px",
    x: base.x,
    y: base.y,
    scale: base.scale
  });

  // Floaty parallax ticker (frame-rate independent)
  gsap.ticker.add(() => {
    if (activeEl || isTweening) return;
    if (ignoreParallaxUntilMove) return;

    const now = performance.now();
    const idle = (now - lastPointerMoveAt) > PARALLAX_IDLE_DELAY_MS;
    const t = now / 1000;

    const floatX = idle ? Math.sin(t * (Math.PI * 2) / PARALLAX_FLOAT_SEC) * PARALLAX_FLOAT_PX : 0;
    const floatY = idle ? Math.cos(t * (Math.PI * 2) / (PARALLAX_FLOAT_SEC * 1.3)) * (PARALLAX_FLOAT_PX * 0.8) : 0;

    const targetX = parallaxTarget.x + floatX;
    const targetY = parallaxTarget.y + floatY;

    const dt = gsap.ticker.deltaRatio() / 60; // seconds
    const alpha = 1 - Math.exp(-dt / Math.max(0.001, PARALLAX_TAU_SEC));

    parallaxCurrent.x += (targetX - parallaxCurrent.x) * alpha;
    parallaxCurrent.y += (targetY - parallaxCurrent.y) * alpha;

    const vars = clampPan(
      base.x + parallaxCurrent.x,
      base.y + parallaxCurrent.y,
      base.scale,
      BASE_PAD
    );

    gsap.set(zoomLayer, { x: vars.x, y: vars.y, scale: base.scale });
  });

  function computeBaseTransform() {
    const vb = getViewBox();
    if (!mapBounds) return { x: 0, y: 0, scale: 1 };

    const paddedW = mapBounds.width + BASE_PAD * 2;
    const paddedH = mapBounds.height + BASE_PAD * 2;
    const cover = Math.max(vb.w / paddedW, vb.h / paddedH);
    const scale = cover * BASE_ZOOM;

    const cx = mapBounds.x + mapBounds.width / 2;
    const cy = mapBounds.y + mapBounds.height / 2;

    return {
      x: vb.x + vb.w / 2 - cx * scale + BASE_BIAS_X,
      y: vb.y + vb.h / 2 - cy * scale + BASE_BIAS_Y,
      scale
    };
  }

  function clampPan(x, y, scale, pad) {
    const vb = getViewBox();
    if (!mapBounds) return { x, y };

    const minX = vb.x + vb.w - pad - (mapBounds.x + mapBounds.width) * scale;
    const maxX = vb.x + pad - mapBounds.x * scale;
    const minY = vb.y + vb.h - pad - (mapBounds.y + mapBounds.height) * scale;
    const maxY = vb.y + pad - mapBounds.y * scale;

    return {
      x: Math.min(maxX, Math.max(minX, x)),
      y: Math.min(maxY, Math.max(minY, y))
    };
  }

  const computeTargetForRegion = (el, scale, anchorPoint) => {
    const { x, y, w, h } = getViewBox();
    const vcx = x + w / 2;
    const vcy = y + h / 2;

    let bb;
    try { bb = el.getBBox(); } catch (e) { return null; }

    const rcx = bb.x + bb.width / 2;
    const rcy = bb.y + bb.height / 2;

    const ax = anchorPoint ? anchorPoint.x : vcx;
    const ay = anchorPoint ? anchorPoint.y : vcy;

    // Align region center to the anchor point (cursor) instead of centering the view.
    const hoverBiasX = isPiedmont(el) ? PIEDMONT_HOVER_BIAS_X : HOVER_BIAS_X;
    const raw = {
      x: ax - rcx * scale + hoverBiasX,
      y: ay - rcy * scale + HOVER_BIAS_Y,
      scale
    };

    const clamped = clampPan(raw.x, raw.y, scale, HOVER_PAD);
    return { ...raw, ...clamped };
  };

  const labelsLayer = svg.querySelector("#labels-region") || svg.querySelector(".labels--region");
  const regionLabels = Array.from(
    svg.querySelectorAll("#labels-region .label--region, .labels--region .label--region, text.label--region")
  );
  const REGION_LABEL_NAMES = ["PIEDMONT", "LOMBARDIA", "VENETO", "TUSCANY", "FRIULI", "PUGLIA"];
  let labelCenters = null;
  let activeLabelEl = null;
  let labelUnderlineLine = null;
  const REGION_LINKS = {
    PIEDMONT: "/piedmont",
    LOMBARDIA: "/lombardia",
    VENETO: "/veneto",
    TUSCANY: "/tuscany",
    FRIULI: "/friuli",
    PUGLIA: "/puglia"
  };
  const REGION_ARIA_LABELS = {
    PIEDMONT: "Piedmont region",
    LOMBARDIA: "Lombardia region",
    VENETO: "Veneto region",
    TUSCANY: "Tuscany region",
    FRIULI: "Friuli region",
    PUGLIA: "Puglia region"
  };

  const getRegionHrefFromLabel = (labelText) => {
    const t = (labelText || "").toUpperCase();
    if (t.includes("PIEDMONT")) return REGION_LINKS.PIEDMONT;
    if (t.includes("LOMBARDIA")) return REGION_LINKS.LOMBARDIA;
    if (t.includes("VENETO")) return REGION_LINKS.VENETO;
    if (t.includes("TUSCANY")) return REGION_LINKS.TUSCANY;
    if (t.includes("FRIULI")) return REGION_LINKS.FRIULI;
    if (t.includes("PUGLIA")) return REGION_LINKS.PUGLIA;
    return null;
  };

  const getRegionKeyFromLabel = (labelText) => {
    const t = (labelText || "").toUpperCase();
    if (t.includes("PIEDMONT")) return "PIEDMONT";
    if (t.includes("LOMBARDIA")) return "LOMBARDIA";
    if (t.includes("VENETO")) return "VENETO";
    if (t.includes("TUSCANY")) return "TUSCANY";
    if (t.includes("FRIULI")) return "FRIULI";
    if (t.includes("PUGLIA")) return "PUGLIA";
    return null;
  };

  const computeLabelCenters = () => {
    labelCenters = null;
    let labelEls = regionLabels;
    if (!labelEls.length) {
      labelEls = Array.from(svg.querySelectorAll("text")).filter((el) => {
        const t = (el.textContent || "").toUpperCase().trim();
        return REGION_LABEL_NAMES.some((name) => t.includes(name));
      });
    }
    const mountRect = mountEl.getBoundingClientRect();
    labelCenters = labelEls.map((el) => {
      const r = el.getBoundingClientRect();
      if (!r || r.width < 1 || r.height < 1) return null;
      const inView =
        r.right >= mountRect.left &&
        r.left <= mountRect.right &&
        r.bottom >= mountRect.top &&
        r.top <= mountRect.bottom;
      if (!inView) return null;
      return { el, rect: r, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    }).filter(Boolean);
    return labelCenters;
  };

  const getClosestLabelForRegion = (regionEl) => {
    if (!regionEl) return null;
    const rr = regionEl.getBoundingClientRect();
    if (!rr || rr.width < 1 || rr.height < 1) return null;
    const rcx = rr.left + rr.width / 2;
    const rcy = rr.top + rr.height / 2;
    const centers = computeLabelCenters();
    if (!centers.length) return null;
    let best = centers[0];
    let bestD = Infinity;
    centers.forEach((c) => {
      const dx = c.cx - rcx;
      const dy = c.cy - rcy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = c; }
    });
    return best.el;
  };

  const ensureLabelUnderlineLine = () => {
    const host = zoomLayer || svg;
    if (!host) return null;
    if (!labelUnderlineLine) {
      labelUnderlineLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      labelUnderlineLine.setAttribute("class", "label-underline-dots");
      labelUnderlineLine.style.pointerEvents = "none";
      host.appendChild(labelUnderlineLine);
    }
    return labelUnderlineLine;
  };

  const screenToLayerPoint = (x, y) => {
    const ctm = (zoomLayer || svg).getScreenCTM();
    if (!ctm) return { x, y };
    const inv = ctm.inverse();
    const p = new DOMPoint(x, y).matrixTransform(inv);
    return { x: p.x, y: p.y };
  };

  const updateActiveLabel = (regionEl) => {
    if (!isZoomedIn) {
      if (labelUnderlineLine) labelUnderlineLine.setAttribute("opacity", "0");
      return;
    }
    activeLabelEl = null;
    if (!regionEl) {
      if (labelUnderlineLine) labelUnderlineLine.setAttribute("opacity", "0");
      return;
    }
    const labelEl = getClosestLabelForRegion(regionEl);
    if (!labelEl) {
      if (labelUnderlineLine) labelUnderlineLine.setAttribute("opacity", "0");
      return;
    }
    const underline = ensureLabelUnderlineLine();
    if (!underline) return;
    const r = labelEl.getBoundingClientRect();
    if (!r || r.width < 1) return;
    const padX = 1.5;
    const isFriuli = /FRIULI/i.test(labelEl.textContent || "");
    const shrink = isFriuli ? 16 : 0;
    const y = r.bottom + 0.5;
    const p1 = screenToLayerPoint(r.left - padX + shrink, y);
    const p2 = screenToLayerPoint(r.right + padX - shrink, y);
    underline.setAttribute("x1", `${p1.x}`);
    underline.setAttribute("y1", `${p1.y}`);
    underline.setAttribute("x2", `${p2.x}`);
    underline.setAttribute("y2", `${p2.y}`);
    underline.setAttribute("opacity", "1");
    activeLabelEl = labelEl;
  };

  const setActive = (el) => {
    regions.forEach(r => r.classList.toggle(ACTIVE_CLASS, r === el));
    updateActiveLabel(el);
  };

  const handleMapClick = (e) => {
    const labelEl = e.target && e.target.closest ? e.target.closest(".label--region") : null;
    if (labelEl) {
      const href = getRegionHrefFromLabel(labelEl.textContent);
      if (href) window.location.assign(href);
      return;
    }

    const regionEl = e.target && e.target.closest ? e.target.closest(".region") : null;
    if (regionEl) {
      const nearestLabel = getClosestLabelForRegion(regionEl);
      const href = getRegionHrefFromLabel(nearestLabel && nearestLabel.textContent);
      if (href) window.location.assign(href);
    }
  };

  const handleMapKeydown = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const labelEl = e.target && e.target.closest ? e.target.closest(".label--region") : null;
    const regionEl = e.target && e.target.closest ? e.target.closest(".region") : null;
    if (!labelEl && !regionEl) return;
    e.preventDefault();
    if (labelEl) {
      const href = getRegionHrefFromLabel(labelEl.textContent);
      if (href) window.location.assign(href);
      return;
    }
    const nearestLabel = getClosestLabelForRegion(regionEl);
    const href = getRegionHrefFromLabel(nearestLabel && nearestLabel.textContent);
    if (href) window.location.assign(href);
  };

  const isPointInPaddedBBox = (el, pt, pad) => {
    if (!el || !pt) return false;
    let bb;
    try { bb = el.getBBox(); } catch (e) { return false; }
    const padRight = isPuglia(el) ? pad + PUGLIA_HOVER_FORGIVE_RIGHT_PX : pad;
    const padTop = isPuglia(el)
      ? pad + PUGLIA_HOVER_FORGIVE_TOP_PX
      : (isVeneto(el) ? pad + VENETO_HOVER_FORGIVE_TOP_PX : pad);
    return (
      pt.x >= bb.x - pad &&
      pt.x <= bb.x + bb.width + padRight &&
      pt.y >= bb.y - padTop &&
      pt.y <= bb.y + bb.height + pad
    );
  };

  const animateTo = (vars, dur, ease, onCompleteExtra) => {
    if (tween) tween.kill();
    isTweening = true;
    tween = gsap.to(zoomLayer, {
      ...vars,
      duration: dur,
      ease,
      onComplete: () => {
        isTweening = false;
        if (typeof onCompleteExtra === "function") onCompleteExtra();
      }
    });
  };

  const zoomToRegion = (el, anchorPoint) => {
    if (!el || el === activeEl) return;
    stopParallax();
    activeEl = el;
    setActive(el);

    if (lastMoveEvent) {
      lastSwitchAt = performance.now();
      lastSwitchPos = { x: lastMoveEvent.clientX, y: lastMoveEvent.clientY };
    }

    const scale = base.scale * HOVER_SCALE;
    const target = computeTargetForRegion(el, scale, anchorPoint);
    if (!target) return;

    isZoomedIn = false;
    animateTo(
      { x: target.x, y: target.y, scale: target.scale },
      DUR_IN,
      EASE_IN,
      () => {
        isZoomedIn = true;
        updateActiveLabel(activeEl);
      }
    );
  };

  const resetZoom = () => {
    if (!activeEl) return;
    activeEl = null;
    isZoomedIn = false;
    setActive(null);
    stopParallax();
    animateTo({ x: base.x, y: base.y, scale: base.scale }, DUR_OUT, EASE_OUT);
  };

  const scheduleReset = () => {
    if (resetTimer) clearTimeout(resetTimer);
    if (RESET_DELAY_MS <= 0) {
      resetTimer = null;
      resetZoom();
      return;
    }
    resetTimer = setTimeout(() => {
      resetTimer = null;
      resetZoom();
    }, RESET_DELAY_MS);
  };

  const cancelReset = () => {
    if (resetTimer) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }
  };

  // Make regions focusable (optional)
  if (enableInteractions) {
    regions.forEach((el) => {
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
      el.setAttribute("role", "link");
      el.addEventListener("focus", () => { cancelReset(); zoomToRegion(el); });
      el.addEventListener("blur",  () => scheduleReset());
    });
  }

  // ---- KEY CHANGE ----
  // Drive hover from pointer position over the SVG, not enter/leave on the region.
  const handleMove = (e) => {
    lastMoveEvent = e;
    if (rafPending) return;
    rafPending = true;

    requestAnimationFrame(() => {
      rafPending = false;

      const evt = lastMoveEvent;
      if (!evt) return;

      // re-enable parallax only after the pointer actually moves
      if (lastPointerPos) {
        const mdx = evt.clientX - lastPointerPos.x;
        const mdy = evt.clientY - lastPointerPos.y;
        if (Math.hypot(mdx, mdy) >= PARALLAX_WAKE_PX) {
          ignoreParallaxUntilMove = false;
        }
      }
      lastPointerMoveAt = performance.now();
      lastPointerPos = { x: evt.clientX, y: evt.clientY };

      // Convert pointer to SVG coords
      let anchorPoint = null;
      try {
        const pt = svg.createSVGPoint();
        pt.x = evt.clientX;
        pt.y = evt.clientY;
        const ctm = svg.getScreenCTM();
        if (ctm) {
          const p = pt.matrixTransform(ctm.inverse());
          anchorPoint = { x: p.x, y: p.y };
        }
      } catch (e) {}

      // What is currently under pointer?
      const el = evt.target && evt.target.closest ? evt.target.closest(".region") : null;

      if (el) {
        if (isTweening && activeEl && el !== activeEl) return;
        if (activeEl && el !== activeEl) {
          const now = performance.now();
          const dx = evt.clientX - lastSwitchPos.x;
          const dy = evt.clientY - lastSwitchPos.y;
          const dist = Math.hypot(dx, dy);
          if (dist < STICKY_PX || (now - lastSwitchAt) < SWITCH_COOLDOWN_MS) {
            return; // keep current region while animation settles
          }
        }

        cancelReset();
        zoomToRegion(el, anchorPoint);
      } else {
        if (activeEl && anchorPoint && isPointInPaddedBBox(activeEl, anchorPoint, HOVER_FORGIVE_PX)) {
          cancelReset();
          return;
        }
        // Subtle inverse parallax when idle
        if (!activeEl && anchorPoint && !isTweening && !ignoreParallaxUntilMove) {
          const vb = getViewBox();
          const vcx = vb.x + vb.w / 2;
          const vcy = vb.y + vb.h / 2;
          const dx = anchorPoint.x - vcx;
          const dy = anchorPoint.y - vcy;
          const px = Math.max(-PARALLAX_MAX_PX, Math.min(PARALLAX_MAX_PX, -dx * PARALLAX_STRENGTH));
          const py = Math.max(-PARALLAX_MAX_PX, Math.min(PARALLAX_MAX_PX, -dy * PARALLAX_STRENGTH));
          parallaxTarget = { x: px, y: py };
        }
        scheduleReset();
      }
    });
  };

  if (enableInteractions) {
    svg.addEventListener("pointermove", handleMove, { passive: true });

    // If pointer leaves the whole SVG, reset
    svg.addEventListener("pointerleave", () => {
      cancelReset();
      resetZoom();
    });
  }

  // Click/tap navigation for all devices
  svg.addEventListener("click", handleMapClick);
  svg.addEventListener("keydown", handleMapKeydown);

  // Accessibility labels for regions based on nearest label text
  regions.forEach((el) => {
    const labelEl = getClosestLabelForRegion(el);
    const key = getRegionKeyFromLabel(labelEl && labelEl.textContent);
    if (key) {
      el.setAttribute("aria-label", REGION_ARIA_LABELS[key]);
    }
  });

  let resizeRaf = null;
  window.addEventListener("resize", () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      applyBase(true);
    });
  });

  // Cleanup safety if Webflow re-inits
  if (enableInteractions) {
    svg.addEventListener("remove", () => {
      svg.removeEventListener("pointermove", handleMove);
    });
  }
  svg.addEventListener("remove", () => {
    svg.removeEventListener("click", handleMapClick);
  });
  svg.addEventListener("remove", () => {
    svg.removeEventListener("keydown", handleMapKeydown);
  });
}

  // =========================================================
  // Ocean waves
  // =========================================================
  function initOceanWaves(svg) {
    if (!window.gsap) {
      console.warn("GSAP not found (Webflow GSAP enabled?)");
      return;
    }

    const wavesRoot = svg.querySelector("#waves");
    if (!wavesRoot) return;

    const waveGroups = Array.from(wavesRoot.querySelectorAll(".wave"));
    if (!waveGroups.length) return;

    // ====== TUNING ======
    const STAGGER      = 0.10;
    const WIDTH_PAD    = 2;

    const LOOP_SEC_BASE = 7.2;
    const LOOP_SEC_VAR  = 0.8;
    const LOOP_SEC_MIN  = 6.0;
    const LOOP_SEC_MAX  = 8.8;

    const SPEED_MIN = 7;
    const SPEED_MAX = 28;

    const TARGET_TILE_W          = 220;
    const TARGET_TILE_W_LONGEST  = 140;
    const OVERLAP_MIN            = 10;
    const OVERLAP_MAX_RATIO      = 0.80;

    const FADE_PX_DESIRED = 90;
    const DEAD_PX_DESIRED = 22;

    const Y_LANES = [-30, -24, -18, -12, -6, 0, 6, 12, 18, 24, 30, 36, 42];

    const LONGEST_COUNT = 2;
    const LONG_VISIBLE_LEFT_FRAC  = 0.65;
    const LONG_VISIBLE_RIGHT_FRAC = 0.8;
    const LONG_FADE_PX = 45;
    const LONG_DEAD_PX = 10;
    // ====================

    const hash01 = (n) => {
      const x = Math.sin((n + 1) * 999) * 10000;
      return x - Math.floor(x);
    };

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    function makeOpacityForX(tileW, fadePx, deadPx, visibleLeftFrac = 1, visibleRightFrac = 1) {
      const leftEdge  = -tileW * clamp(visibleLeftFrac,  0.05, 1);
      const rightEdge =  tileW * clamp(visibleRightFrac, 0.05, 1);

      return function opacityForX(x) {
        if (x <= leftEdge + deadPx) return 0;
        if (x >= rightEdge - deadPx) return 0;

        const leftFadeEnd = leftEdge + deadPx + fadePx;
        if (x < leftFadeEnd) {
          const t = (x - (leftEdge + deadPx)) / fadePx;
          return clamp(t, 0, 1);
        }

        const rightFadeStart = rightEdge - deadPx - fadePx;
        if (x > rightFadeStart) {
          const t = (rightEdge - deadPx - x) / fadePx;
          return clamp(t, 0, 1);
        }

        return 1;
      };
    }

    const measured = waveGroups.map((el, idx) => {
      let w = 0;
      try { w = el.getBBox().width; } catch (e) { w = 0; }
      return { idx, w };
    });

    measured.sort((a, b) => b.w - a.w);
    const longestIdxSet = new Set(
      measured
        .filter(m => m.w > 0)
        .slice(0, LONGEST_COUNT)
        .map(m => m.idx)
    );

    const currentLaneByWaveIndex = new Map();
    const getUsedLaneIndices = () => new Set(currentLaneByWaveIndex.values());

    const pickLaneIndexGlobal = ({ seedRef, lastLaneIndex, waveIndex }) => {
      const used = getUsedLaneIndices();
      used.delete(lastLaneIndex);
      if (currentLaneByWaveIndex.has(waveIndex)) used.delete(currentLaneByWaveIndex.get(waveIndex));

      for (let tries = 0; tries < 40; tries++) {
        const r = hash01(seedRef.value += 17);
        let idx = Math.floor(r * Y_LANES.length);
        idx = Math.min(idx, Y_LANES.length - 1);

        if (idx === lastLaneIndex) continue;
        if (used.has(idx)) continue;

        return idx;
      }

      for (let tries = 0; tries < 40; tries++) {
        const r = hash01(seedRef.value += 17);
        let idx = Math.floor(r * Y_LANES.length);
        idx = Math.min(idx, Y_LANES.length - 1);
        if (idx !== lastLaneIndex) return idx;
      }

      return 0;
    };

    waveGroups.forEach((waveA, i) => {
      if (waveA.dataset.waveInit === "1") return;
      waveA.dataset.waveInit = "1";

      let bbox;
      try { bbox = waveA.getBBox(); } catch (e) { return; }

      const rawW = Math.max(1, bbox.width + WIDTH_PAD);
      const isLongest = longestIdxSet.has(i);

      const targetTileW = isLongest ? TARGET_TILE_W_LONGEST : TARGET_TILE_W;

      let overlapPx = Math.max(OVERLAP_MIN, rawW - targetTileW);
      overlapPx = Math.min(overlapPx, rawW * OVERLAP_MAX_RATIO);

      const tileW = Math.max(1, rawW - overlapPx);

      let deadPx = Math.min(isLongest ? LONG_DEAD_PX : DEAD_PX_DESIRED, tileW * 0.15);
      let fadePx = Math.min(isLongest ? LONG_FADE_PX : FADE_PX_DESIRED, tileW * 0.35);

      const maxEndSpan = tileW * 0.90;
      if (deadPx + fadePx > maxEndSpan) {
        fadePx = Math.max(6, maxEndSpan - deadPx);
        if (deadPx + fadePx > maxEndSpan) deadPx = Math.max(0, maxEndSpan - fadePx);
      }
      fadePx = Math.max(6, fadePx);

      const opacityForX = makeOpacityForX(
        tileW,
        fadePx,
        deadPx,
        isLongest ? LONG_VISIBLE_LEFT_FRAC : 1,
        isLongest ? LONG_VISIBLE_RIGHT_FRAC : 1
      );

      const waveB = waveA.cloneNode(true);
      waveB.classList.add("wave-clone");
      waveA.parentNode.insertBefore(waveB, waveA.nextSibling);

      gsap.set([waveA, waveB], {
        transformBox: "fill-box",
        transformOrigin: "50% 50%"
      });

      gsap.set(waveA, { x: 0,      opacity: 1 });
      gsap.set(waveB, { x: -tileW, opacity: 0 });

      const vT = hash01(i + 77);
      const loopSec = clamp(
        LOOP_SEC_BASE + (vT - 0.5) * (LOOP_SEC_VAR * 2),
        LOOP_SEC_MIN,
        LOOP_SEC_MAX
      );

      let speed = tileW / loopSec;
      speed = clamp(speed, SPEED_MIN, SPEED_MAX);

      const wrapX = gsap.utils.wrap(-tileW, tileW);

      const seedRef = { value: i * 1000 + 333 };
      let lastLaneIndex = null;

      const setLaneOnB = () => {
        const laneIdx = pickLaneIndexGlobal({ seedRef, lastLaneIndex, waveIndex: i });
        lastLaneIndex = laneIdx;
        currentLaneByWaveIndex.set(i, laneIdx);
        gsap.set(waveB, { y: Y_LANES[laneIdx] });
      };

      lastLaneIndex = (i % Y_LANES.length);
      currentLaneByWaveIndex.set(i, lastLaneIndex);
      gsap.set(waveB, { y: Y_LANES[lastLaneIndex] });
      setLaneOnB();

      let ax = 0;
      let bx = -tileW;

      const setAOpacity = gsap.quickSetter(waveA, "opacity");
      const setBOpacity = gsap.quickSetter(waveB, "opacity");

      const startDelay = i * STAGGER;
      const startTime = gsap.ticker.time + startDelay;

      const tick = () => {
        if (gsap.ticker.time < startTime) return;

        const dt = gsap.ticker.deltaRatio() / 60;
        const dx = speed * dt;

        const prevBx = bx;

        ax = wrapX(ax + dx);
        bx = wrapX(bx + dx);

        const bWrapped = (prevBx > tileW * 0.75 && bx < -tileW * 0.75);
        if (bWrapped) setLaneOnB();

        gsap.set(waveA, { x: ax });
        gsap.set(waveB, { x: bx });

        setAOpacity(opacityForX(ax));
        setBOpacity(opacityForX(bx));
      };

      waveA._wavesTick = tick;
      gsap.ticker.add(tick);
    });
  }

  // =========================================================
  // Region page subregion map interactions
  // =========================================================
})();
