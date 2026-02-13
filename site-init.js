(() => {
  const SiteGSAP = (window.SiteGSAP = window.SiteGSAP || {});
  function initSubregionPanelScroll() {
    const mapWrap = document.querySelector(".map__wrap");
    const contentWrap = document.querySelector(".content__wrap");
    if (!mapWrap || !contentWrap) return;
    const isCoarsePointer = window.matchMedia?.("(hover: none), (pointer: coarse)")?.matches;

    const subregionEls = Array.from(mapWrap.querySelectorAll('[class*="map__subregion-"]'));
    if (!subregionEls.length) return;

    const panelByKey = new Map();
    const panels = Array.from(contentWrap.querySelectorAll(".region__panel"));

    panels.forEach((panel) => {
      const id = (panel.id || "").trim().toLowerCase();
      if (id) panelByKey.set(id, panel);

      panel.classList.forEach((cls) => {
        if (cls.startsWith("--")) {
          const key = cls.slice(2).trim().toLowerCase();
          if (key) panelByKey.set(key, panel);
        }
      });
    });

    const keyFromSubregionEl = (el) => {
      for (const cls of el.classList) {
        if (cls.startsWith("map__subregion-")) {
          return cls.slice("map__subregion-".length).toLowerCase();
        }
      }
      return "";
    };

    const getHitTargets = (el) => {
      const shapeSelector = "path, polygon, polyline, rect, circle, ellipse";
      return Array.from(el.querySelectorAll(shapeSelector));
    };

    const subregionByKey = new Map();
    subregionEls.forEach((el) => {
      const key = keyFromSubregionEl(el);
      if (key) subregionByKey.set(key, el);
    });

    let activeKey = "";
    let lastScrollKey = "";
    let lastScrollAt = 0;
    let hasConsumedInitialHover = false;

    const getPanelKey = (panel) => {
      const idKey = (panel.id || "").trim().toLowerCase();
      if (idKey && subregionByKey.has(idKey)) return idKey;
      for (const cls of panel.classList) {
        if (cls.startsWith("--")) {
          const key = cls.slice(2).trim().toLowerCase();
          if (key && subregionByKey.has(key)) return key;
        }
      }
      return "";
    };

    const scrollToPanel = (key) => {
      if (!key) return;
      const panel = panelByKey.get(key);
      if (!panel) return;

      const now = performance.now();
      if (lastScrollKey === key && now - lastScrollAt < 400) return;
      lastScrollKey = key;
      lastScrollAt = now;

      panel.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    };

    const setActiveKey = (key) => {
      if (key === activeKey) return;
      activeKey = key || "";

      subregionByKey.forEach((el, subKey) => {
        el.classList.toggle("is-active", !!activeKey && subKey === activeKey);
      });

      const activePanel = activeKey ? panelByKey.get(activeKey) : null;
      panels.forEach((panel) => {
        panel.classList.toggle("is-active", !!activePanel && panel === activePanel);
      });
    };

    subregionEls.forEach((el) => {
      const key = keyFromSubregionEl(el);
      if (!key) return;

      const hitTargets = getHitTargets(el);
      if (!hitTargets.length) return;

      hitTargets.forEach((target) => {
        const activateFromMap = (event) => {
          if (isCoarsePointer && event?.type !== "click") return;
          setActiveKey(key);

          // Prevent accidental auto-scroll if the cursor lands on a hit area after navigation.
          if (event?.type === "mouseenter" && !hasConsumedInitialHover) {
            hasConsumedInitialHover = true;
            return;
          }

          scrollToPanel(key);
        };

        target.addEventListener("click", activateFromMap);
        if (!isCoarsePointer) {
          target.addEventListener("mouseenter", activateFromMap);
          target.addEventListener("focusin", activateFromMap);
        }
      });
    });

    const panelIntersections = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          panelIntersections.set(entry.target, entry.intersectionRatio);
        });

        let bestPanel = null;
        let bestRatio = 0;
        panels.forEach((panel) => {
          const ratio = panelIntersections.get(panel) || 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestPanel = panel;
          }
        });

        if (bestPanel && bestRatio >= 0.8) {
          const key = getPanelKey(bestPanel);
          if (key) {
            setActiveKey(key);
            return;
          }
        } else {
          setActiveKey("");
        }
      },
      {
        root: null,
        threshold: [0, 0.25, 0.5, 0.75, 0.8, 1]
      }
    );

    panels.forEach((panel) => {
      observer.observe(panel);
    });

  }

  function initMapCloudParallax() {
    const wraps = Array.from(document.querySelectorAll(".map__wrap"));
    if (!wraps.length) return;

    const CLOUD_URLS = [
      "https://cdn.prod.website-files.com/698ddf27e914d2bb98e7cfa2/698e76e580f611baf02185a2_Cloud-A.png",
      "https://cdn.prod.website-files.com/698ddf27e914d2bb98e7cfa2/698e76e5380898f97dee88bf_Cloud-B.png",
      "https://cdn.prod.website-files.com/698ddf27e914d2bb98e7cfa2/698e76e5eeef7097637f2ab7_Cloud-C.png",
      "https://cdn.prod.website-files.com/698ddf27e914d2bb98e7cfa2/698e76e5454c3928f663181d_Cloud-D.png"
    ];

    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    const rand = (min, max) => min + Math.random() * (max - min);
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    };
    const boxesOverlap = (a, b) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const estimateCloudBox = (leftPct, topPct, sizeVw, wrapRect) => {
      const viewportWidth = window.innerWidth || wrapRect.width || 1;
      const sizePx = (sizeVw / 100) * viewportWidth;
      const width = sizePx;
      const height = sizePx * 0.58;
      const cx = (leftPct / 100) * wrapRect.width;
      const cy = (topPct / 100) * wrapRect.height;
      return {
        left: cx - width * 0.5,
        right: cx + width * 0.5,
        top: cy - height * 0.5,
        bottom: cy + height * 0.5
      };
    };
    const pickCloudPosition = (wrapRect, sizeVw, placedBoxes) => {
      const EXCLUDE_X_MIN = 28;
      const EXCLUDE_X_MAX = 72;
      const EXCLUDE_Y_MIN = 28;
      const EXCLUDE_Y_MAX = 72;
      let best = null;
      let bestOverlapCount = Number.POSITIVE_INFINITY;

      for (let i = 0; i < 36; i += 1) {
        const left = rand(2, 98);
        const top = rand(5, 95);
        const inCenterX = left >= EXCLUDE_X_MIN && left <= EXCLUDE_X_MAX;
        const inCenterY = top >= EXCLUDE_Y_MIN && top <= EXCLUDE_Y_MAX;
        if (inCenterX && inCenterY) continue;

        const box = estimateCloudBox(left, top, sizeVw, wrapRect);
        let overlapCount = 0;
        placedBoxes.forEach((other) => {
          if (boxesOverlap(box, other)) overlapCount += 1;
        });

        if (overlapCount <= 1) return { left, top, box };
        if (overlapCount < bestOverlapCount) {
          bestOverlapCount = overlapCount;
          best = { left, top, box };
        }
      }

      if (best) return best;

      // Final fallback: edge-biased, then accept the best attempt.
      const fallbackLeft = Math.random() < 0.5 ? rand(2, 24) : rand(76, 98);
      const fallbackTop = Math.random() < 0.5 ? rand(5, 24) : rand(76, 95);
      return {
        left: fallbackLeft,
        top: fallbackTop,
        box: estimateCloudBox(fallbackLeft, fallbackTop, sizeVw, wrapRect)
      };
    };

    const clouds = [];
    wraps.forEach((wrap) => {
      if (wrap.querySelector(".map__clouds")) return;

      const layer = document.createElement("div");
      layer.className = "map__clouds";
      layer.setAttribute("aria-hidden", "true");
      wrap.prepend(layer);

      const targetCount = Math.floor(rand(5, 11));
      const cloudPool = [...CLOUD_URLS];
      while (cloudPool.length < targetCount) {
        cloudPool.push(CLOUD_URLS[Math.floor(Math.random() * CLOUD_URLS.length)]);
      }
      shuffle(cloudPool);
      const wrapRect = wrap.getBoundingClientRect();
      const placedBoxes = [];

      cloudPool.forEach((url) => {
        const img = document.createElement("img");
        img.className = "map__cloud";
        img.src = url;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";

        const sumRand = Math.random() + Math.random();
        const sizeVw = 9 + sumRand * 5.5;
        const opacity = rand(0.3, 0.7);
        const depth = rand(0.35, 1.2);

        const pos = pickCloudPosition(wrapRect, sizeVw, placedBoxes);
        placedBoxes.push(pos.box);
        img.style.setProperty("--cloud-left", `${pos.left.toFixed(2)}%`);
        img.style.setProperty("--cloud-top", `${pos.top.toFixed(2)}%`);
        img.style.setProperty("--cloud-size", `${sizeVw.toFixed(2)}vw`);
        img.style.setProperty("--cloud-opacity", opacity.toFixed(2));

        layer.appendChild(img);
        clouds.push({
          el: img,
          depth,
          targetX: 0,
          targetY: 0,
          x: 0,
          y: 0,
          floatAmpX: rand(2, 10),
          floatAmpY: rand(1, 7),
          floatSpeed: rand(0.08, 0.22),
          phase: rand(0, Math.PI * 2)
        });
      });
    });

    if (!clouds.length) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const touchLike = window.matchMedia?.("(hover: none), (pointer: coarse)")?.matches;
    if (reduceMotion || touchLike) return;

    const PARALLAX_X = 30;
    const PARALLAX_Y = 22;
    const LERP = 0.08;
    const pointer = { nx: 0, ny: 0 };
    let rafId = 0;

    const setPointer = (clientX, clientY) => {
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      pointer.nx = clamp((clientX / vw - 0.5) * 2, -1, 1);
      pointer.ny = clamp((clientY / vh - 0.5) * 2, -1, 1);
    };

    const onMove = (event) => setPointer(event.clientX, event.clientY);
    const resetPointer = () => {
      pointer.nx = 0;
      pointer.ny = 0;
    };

    const tick = (timeMs) => {
      const t = timeMs * 0.001;
      clouds.forEach((cloud) => {
        cloud.targetX = -pointer.nx * PARALLAX_X * cloud.depth;
        cloud.targetY = -pointer.ny * PARALLAX_Y * cloud.depth;

        const floatX = Math.sin(t * cloud.floatSpeed * Math.PI * 2 + cloud.phase) * cloud.floatAmpX;
        const floatY = Math.cos(t * cloud.floatSpeed * Math.PI * 2 + cloud.phase) * cloud.floatAmpY;
        const desiredX = cloud.targetX + floatX;
        const desiredY = cloud.targetY + floatY;

        cloud.x += (desiredX - cloud.x) * LERP;
        cloud.y += (desiredY - cloud.y) * LERP;
        cloud.el.style.transform = `translate(-50%, -50%) translate3d(${cloud.x.toFixed(2)}px, ${cloud.y.toFixed(2)}px, 0)`;
      });

      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseout", (event) => {
      if (!event.relatedTarget) resetPointer();
    });
    window.addEventListener("blur", resetPointer);

    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function initMapPatternParallax() {
    if (!window.gsap) return;

    const wrap = document.querySelector(".map__wrap");
    const pattern = wrap?.querySelector(".map__pattern");
    if (!wrap || !pattern) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduceMotion) return;
    const touchLike = window.matchMedia?.("(hover: none), (pointer: coarse)")?.matches;
    if (touchLike) return;

    const DESIRED_SHIFT_X = 44;
    const DESIRED_SHIFT_Y = 34;
    const EDGE_GUARD_PX = 6;
    const LERP = 0.08;
    const FLOAT_X = 6;
    const FLOAT_Y = 4;
    const FLOAT_PERIOD_SEC = 11;
    const TAU = Math.PI * 2;

    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    const limits = { x: 0, y: 0 };
    let scale = 1.12;

    const recalc = () => {
      const rect = wrap.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const scaleForX = 1 + ((DESIRED_SHIFT_X + EDGE_GUARD_PX) * 2) / rect.width;
      const scaleForY = 1 + ((DESIRED_SHIFT_Y + EDGE_GUARD_PX) * 2) / rect.height;
      scale = Math.max(1.08, scaleForX, scaleForY);

      const marginX = (rect.width * scale - rect.width) * 0.5;
      const marginY = (rect.height * scale - rect.height) * 0.5;
      limits.x = Math.max(0, Math.min(DESIRED_SHIFT_X, marginX - EDGE_GUARD_PX));
      limits.y = Math.max(0, Math.min(DESIRED_SHIFT_Y, marginY - EDGE_GUARD_PX));

      gsap.set(pattern, {
        left: "50%",
        top: "50%",
        width: "100%",
        height: "100%",
        xPercent: -50,
        yPercent: -50,
        scale,
        transformOrigin: "50% 50%",
        force3D: true
      });
    };

    const updateTarget = (clientX, clientY) => {
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      const nx = (clientX / vw - 0.5) * 2;
      const ny = (clientY / vh - 0.5) * 2;

      target.x = -gsap.utils.clamp(-1, 1, nx) * limits.x;
      target.y = -gsap.utils.clamp(-1, 1, ny) * limits.y;
    };

    const onMove = (event) => updateTarget(event.clientX, event.clientY);
    const resetTarget = () => {
      target.x = 0;
      target.y = 0;
    };

    const tick = () => {
      const t = gsap.ticker.time;
      const floatX = Math.sin((t / FLOAT_PERIOD_SEC) * TAU) * FLOAT_X;
      const floatY = Math.cos((t / FLOAT_PERIOD_SEC) * TAU) * FLOAT_Y;
      const desiredX = target.x + floatX;
      const desiredY = target.y + floatY;

      current.x += (desiredX - current.x) * LERP;
      current.y += (desiredY - current.y) * LERP;
      gsap.set(pattern, { x: current.x, y: current.y });
    };

    recalc();
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseout", (event) => {
      if (!event.relatedTarget) resetTarget();
    });
    window.addEventListener("blur", resetTarget);
    window.addEventListener("resize", recalc, { passive: true });
    gsap.ticker.add(tick);
  }

  // =========================================================
  // Auto-init on pages that contain #map
  // =========================================================
  document.addEventListener("DOMContentLoaded", () => {
    // Add shine overlays for gold logo images without changing layout
    const goldShineState = {
      overlays: [],
      rafId: null,
      targetX: 0,
      currentX: 0,
      ready: false
    };

    const initGoldShine = (img) => {
      if (!img || img._goldShineInit) return;
      img._goldShineInit = true;

      const parent = img.closest(".logo-panel__wrap") || img.parentElement;
      if (!parent) return;

      const overlay = document.createElement("span");
      overlay.className = "logo-panel__gold-shine";
      const sheen = document.createElement("span");
      sheen.className = "logo-panel__gold-shine-sheen";
      const sheen2 = document.createElement("span");
      sheen2.className = "logo-panel__gold-shine-sheen--2";
      overlay.appendChild(sheen);
      overlay.appendChild(sheen2);
      parent.appendChild(overlay);

      const computed = window.getComputedStyle(parent);
      if (computed.position === "static") parent.style.position = "relative";

      const update = () => {
        const src = img.currentSrc || img.src;
        if (src) overlay.style.setProperty("--logo-gold-mask", `url("${src}")`);
        const imgRect = img.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        overlay.style.width = `${parentRect.width}px`;
        overlay.style.height = `${parentRect.height}px`;
        overlay.style.left = "0px";
        overlay.style.top = "0px";
        overlay.style.setProperty("--logo-gold-mask-size", `${imgRect.width}px ${imgRect.height}px`);
        overlay.style.setProperty(
          "--logo-gold-mask-position",
          `${imgRect.left - parentRect.left}px ${imgRect.top - parentRect.top}px`
        );
      };

      if (img.complete) update();
      else img.addEventListener("load", update, { once: true });

      const ro = new ResizeObserver(update);
      ro.observe(img);
      window.addEventListener("resize", update, { passive: true });

      goldShineState.overlays.push(overlay);
    };

    document.querySelectorAll(".logo-panel__gold").forEach(initGoldShine);

    const tickGoldShine = () => {
      if (!goldShineState.ready) return;
      goldShineState.currentX += (goldShineState.targetX - goldShineState.currentX) * 0.02;
      const x = goldShineState.currentX;
      goldShineState.overlays.forEach((overlay) => {
        const sheen = overlay.querySelector(".logo-panel__gold-shine-sheen");
        const sheen2 = overlay.querySelector(".logo-panel__gold-shine-sheen--2");
        if (sheen) sheen.style.transform = `translateX(${x}%)`;
        if (sheen2) sheen2.style.transform = `translateX(${x - 18}%)`;
      });
      goldShineState.rafId = requestAnimationFrame(tickGoldShine);
    };

    const startGoldShine = () => {
      if (goldShineState.rafId) return;
      goldShineState.rafId = requestAnimationFrame(tickGoldShine);
    };

    const onMouseMove = (evt) => {
      const w = window.innerWidth || 1;
      const t = Math.min(1, Math.max(0, evt.clientX / w));
      const range = 50;
      goldShineState.targetX = (0.5 - t) * 2 * range;
      goldShineState.ready = true;
      startGoldShine();
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });

    initMapCloudParallax();
    initMapPatternParallax();
    initSubregionPanelScroll();

    const mapEl = document.querySelector("#map");
    if (!mapEl) return;

    // IMPORTANT:
    // Mount into the new viewport div if you add it in Webflow:
    //   <div id="map"><div class="map-viewport"></div></div>
    const mountSelector = mapEl.querySelector(".map-viewport") ? "#map .map-viewport" : "#map";

    SiteGSAP.initItalyMap({
      mount: mountSelector,
      url: "https://cdn.prod.website-files.com/698afd2204216e1cca686cf9/698aff08357e0836fe433d52_map-14.svg",
      waves: true,
      regionHoverZoom: true
    });
  });
})();
