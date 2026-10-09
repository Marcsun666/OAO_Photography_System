(function () {
  "use strict";

  /* ============ 照片墙瀑布流布局 ============ */
  // 每次都实时重查 .shot（兼容 app.js 数据模式下动态渲染的照片墙）
  function layoutGallery() {
    const grid = document.querySelector(".gallery-grid");
    if (!grid) return;
    const styles = getComputedStyle(grid);
    const rowHeight = parseFloat(styles.gridAutoRows);
    const rowGap = parseFloat(styles.rowGap);
    if (!(rowHeight > 0)) return;
    grid.querySelectorAll(".shot").forEach((shot) => {
      const height = shot.getBoundingClientRect().height;
      const span = Math.max(1, Math.ceil((height + rowGap) / (rowHeight + rowGap)));
      shot.style.gridRowEnd = "span " + span;
    });
  }

  let galleryFrame = 0;
  function scheduleGalleryLayout() {
    cancelAnimationFrame(galleryFrame);
    galleryFrame = requestAnimationFrame(layoutGallery);
  }

  // 图片加载完成后重新排版（load 不冒泡，用捕获阶段委托，兼顾动态照片墙）
  document.addEventListener(
    "load",
    (event) => {
      const t = event.target;
      if (t && t.matches && t.matches(".gallery-grid img")) scheduleGalleryLayout();
    },
    true
  );
  window.addEventListener("load", layoutGallery);
  window.addEventListener("resize", scheduleGalleryLayout);

  // 暴露给 app.js（数据模式渲染后调用）
  window.scheduleGalleryLayout = scheduleGalleryLayout;

  /* ============ 灯箱：预览 + 上一张 / 下一张 ============ */
  const lightbox = document.querySelector("#lightbox");
  if (lightbox) {
    const lightboxImage = lightbox.querySelector("img");
    const lightboxCaption = lightbox.querySelector(".lightbox-caption");
    const lightboxCounter = lightbox.querySelector(".lightbox-counter");
    const prevBtn = lightbox.querySelector(".lightbox-prev");
    const nextBtn = lightbox.querySelector(".lightbox-next");
    const closeBtn = lightbox.querySelector(".lightbox-close");

    let items = [];
    let index = 0;

    const getItems = () =>
      Array.prototype.slice.call(document.querySelectorAll(".gallery-grid [data-full]"));

    function render() {
      const target = items[index];
      if (!target) return;
      const img = target.querySelector("img");
      lightboxImage.src = target.dataset.full;
      if (img) {
        lightboxImage.alt = img.alt;
        lightboxCaption.textContent =
          target.dataset.caption || target.querySelector("span")?.textContent || img.alt;
      } else {
        lightboxImage.alt = target.dataset.caption || "";
        lightboxCaption.textContent = target.dataset.caption || "";
      }
      if (lightboxCounter) lightboxCounter.textContent = `${index + 1} / ${items.length}`;
      if (prevBtn) prevBtn.style.visibility = items.length > 1 ? "visible" : "hidden";
      if (nextBtn) nextBtn.style.visibility = items.length > 1 ? "visible" : "hidden";
    }

    function open(target) {
      items = getItems();
      index = Math.max(0, items.indexOf(target));
      if (!items.length) return;
      render();
      lightbox.classList.add("is-open");
      lightbox.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }

    function close() {
      lightbox.classList.remove("is-open");
      lightbox.setAttribute("aria-hidden", "true");
      lightboxImage.src = "";
      document.body.style.overflow = "";
    }

    function step(delta) {
      if (!items.length) return;
      index = (index + delta + items.length) % items.length;
      render();
    }

    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-full]");
      if (target) open(target);
    });

    if (closeBtn) closeBtn.addEventListener("click", close);
    if (prevBtn)
      prevBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        step(-1);
      });
    if (nextBtn)
      nextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        step(1);
      });
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) close();
    });
    document.addEventListener("keydown", (event) => {
      if (!lightbox.classList.contains("is-open")) return;
      if (event.key === "Escape") close();
      else if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "ArrowRight") step(1);
    });
  }

  /* ============ 导航滚动高亮（scrollspy） ============ */
  const navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav-links a[href^='#']"));
  const tabLinks = Array.prototype.slice.call(document.querySelectorAll(".tab-bar a[href^='#']"));
  const spySections = navLinks
    .map((a) => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);

  function updateSpy() {
    if (!navLinks.length) return;
    const pos = (window.scrollY || 0) + 140;
    let current = navLinks[0];
    spySections.forEach((sec, i) => {
      if (sec && sec.offsetTop <= pos) current = navLinks[i];
    });
    navLinks.forEach((a) => a.classList.toggle("active", a === current));
    // v3：手机底部标签栏跟着高亮（首屏 hero 时不高亮任何一项）
    const href = (window.scrollY || 0) > 240 ? current.getAttribute("href") : "";
    tabLinks.forEach((a) => {
      const on = a.getAttribute("href") === href;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
  }
  window.addEventListener("scroll", updateSpy, { passive: true });
  window.addEventListener("resize", updateSpy);
  updateSpy();

  /* ============ 滚动进入视口动画 ============
   * 支持滚动驱动动画时交给 CSS 的推拉效果（位置跟手指走、可反向退回），
   * 这套一次性淡入只作为老浏览器的回退，两者同时开会互相打架。 */
  const hasScrollTimeline =
    window.CSS && CSS.supports && CSS.supports("animation-timeline", "view()");
  if ("IntersectionObserver" in window && !hasScrollTimeline) {
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) {
              en.target.classList.add("in-view");
              io.unobserve(en.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -48px 0px" }
      );
      document.querySelectorAll("main > section").forEach((s) => {
        if (s.classList.contains("hero")) return; // 首屏 hero 不做隐藏动画，避免闪烁
        s.classList.add("reveal");
        io.observe(s);
      });
    }
  }

  /* ============ Liquid Glass 折射 ============ *
   * 全站所有玻璃面共用同一套材质：模糊 + 折射 + 镜面边。
   * 折射靠 feDisplacementMap —— 每个面按自己的尺寸和圆角生成一张位移贴图
   * （R 通道=横向位移、G 通道=纵向、128 中性），所以要一面一个滤镜。
   * 用 ResizeObserver 跟随尺寸变化重建（提示条这类元素出现时才有尺寸）。
   */
  function setupLiquidGlass() {
    var tpl = document.querySelector("#liquid-glass");
    if (!tpl) return;
    if (!(window.CSS && CSS.supports && CSS.supports("backdrop-filter", "url(#liquid-glass)"))) return;
    var defs = tpl.parentNode;

    /* 有向距离场。角部用 p-范数：胶囊/圆形端头是半圆（n=2），
       超椭圆圆角矩形用 n=4 —— 贴图边界必须和视觉边一致，否则折射带错位。 */
    function sdf(px, py, w, h, r, n) {
      var qx = Math.abs(px - w / 2) - (w / 2 - r);
      var qy = Math.abs(py - h / 2) - (h / 2 - r);
      var ax = Math.max(qx, 0), ay = Math.max(qy, 0);
      var corner = Math.pow(Math.pow(ax, n) + Math.pow(ay, n), 1 / n);
      return corner + Math.min(Math.max(qx, qy), 0) - r;
    }

    /* 色散强度：红蓝两个通道相对绿通道的位移偏差。
       Cocos 那篇 dispersionStrength 默认 0.03、上限 0.2。
       0.03 在他们的 shader 里是对整幅 UV 偏移的比例，落到这里几乎看不见，
       实测 0.18 在高对比照片上会出现明显假彩，0.13 是能看见又不脏的档位。 */
    var DISPERSION = 0.13;
    /* 边缘高光强度，对应文中的 highlightStrength（默认 0.1，上限 0.2） */
    var HILITE = 0.42;

    function buildMap(w, h, r, n) {
      var bezel = Math.max(6, Math.min(r, h / 2) * 0.95);
      var cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      var ctx = cv.getContext("2d");
      var img = ctx.createImageData(w, h);
      var d = img.data;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var i = (y * w + x) * 4;
          var dist = sdf(x + 0.5, y + 0.5, w, h, r, n);
          var nx = 128, ny = 128;
          if (dist < 0 && dist > -bezel) {
            var e = 1;
            var gx = sdf(x + 0.5 + e, y + 0.5, w, h, r, n) - sdf(x + 0.5 - e, y + 0.5, w, h, r, n);
            var gy = sdf(x + 0.5, y + 0.5 + e, w, h, r, n) - sdf(x + 0.5, y + 0.5 - e, w, h, r, n);
            var len = Math.sqrt(gx * gx + gy * gy) || 1;
            var t = 1 - (-dist) / bezel;
            /* smoothstep 而非 t²：两端一阶导为 0，斜面接到平面时不留折痕。
               参考 you-want/liquid-glass 的 smoothStep 插值。 */
            var m = t * t * (3 - 2 * t);
            nx = 128 + (gx / len) * m * 127;
            ny = 128 + (gy / len) * m * 127;
          }
          d[i] = nx; d[i + 1] = ny; d[i + 2] = 128; d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);

      /* 边缘高光图。取自 Cocos 那篇的做法：不是画一圈描边，而是让高光
         跟着法线走 —— 贴图 G 通道落在某个窄带里时才亮。
             opacity = clamp(1 - |G - 191| / 50, 0, 1)
         G=191 对应 ny≈0.5，也就是斜面朝上那一圈，等于「光从上方来」。 */
      var rim = document.createElement("canvas");
      rim.width = w; rim.height = h;
      var rctx = rim.getContext("2d");
      var rimg = rctx.createImageData(w, h);
      var rd = rimg.data;
      var LEFT_G = 191, SPAN_G = 50;
      for (var k = 0; k < w * h; k++) {
        var g = d[k * 4 + 1];
        var a = 1 - Math.abs(g - LEFT_G) / SPAN_G;
        a = a < 0 ? 0 : (a > 1 ? 1 : a);
        rd[k * 4] = 255; rd[k * 4 + 1] = 255; rd[k * 4 + 2] = 255;
        rd[k * 4 + 3] = Math.round(a * 255 * HILITE);
      }
      rctx.putImageData(rimg, 0, 0);

      return {
        url: cv.toDataURL(),
        rim: rim.toDataURL(),
        scale: Math.round(bezel * 0.9)
      };
    }

    /* 用户要求「降低透明度」时不能上折射。
       CSS 里的媒体查询压不住这里的内联 !important（内联优先级更高），
       所以必须在 JS 这一侧判断，并且在偏好变化时重建。 */
    var reduceTA = window.matchMedia
      ? window.matchMedia("(prefers-reduced-transparency: reduce)")
      : { matches: false, addEventListener: null };
    var builders = [];

    var seq = 0;
    function attach(el, opts) {
      if (!el) return;
      opts = opts || {};
      var id = "lg-" + (++seq);
      var filter = tpl.cloneNode(true);
      filter.setAttribute("id", id);
      var feImage = filter.querySelector("#glass-map");
      var feRim = filter.querySelector("#glass-rim");
      var feDispR = filter.querySelector("#glass-disp-r");
      var feDispG = filter.querySelector("#glass-disp-g");
      var feDispB = filter.querySelector("#glass-disp-b");
      var feBlur = filter.querySelector("feGaussianBlur");
      [feImage, feRim, feDispR, feDispG, feDispB].forEach(function (n) {
        n.removeAttribute("id");                  // 克隆体里 id 必须清掉
      });
      if (opts.blur != null) feBlur.setAttribute("stdDeviation", opts.blur);
      /* 暗色玻璃要压暗背景（白字），亮色玻璃要提亮（深字） */
      if (opts.slope != null) {
        ["feFuncR", "feFuncG", "feFuncB"].forEach(function (t) {
          var f = filter.querySelector(t);
          if (!f) return;
          f.setAttribute("slope", opts.slope);
          f.setAttribute("intercept", opts.intercept != null ? opts.intercept : 0);
        });
      }
      defs.appendChild(filter);

      var lastKey = "";
      function build() {
        if (reduceTA.matches) {                     // 尊重系统偏好：撤掉折射
          el.style.removeProperty("backdrop-filter");
          el.style.removeProperty("-webkit-backdrop-filter");
          el.classList.remove("glass-refract");
          lastKey = "";                             // 偏好关掉后要能重建
          return;
        }
        var rect = el.getBoundingClientRect();
        var w = Math.round(rect.width), h = Math.round(rect.height);
        if (!w || !h) return;                       // 未显示时跳过
        var cs = getComputedStyle(el);
        /* border-radius:999px 时 computed 就返回 999，浏览器只在绘制时钳制；
           SDF 必须用钳制后的真实半径，否则距离场整个算错。 */
        var r = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, w / 2, h / 2);
        var n = r >= Math.min(w, h) / 2 - 1 ? 2 : 4;
        var key = w + "x" + h + "r" + r + "n" + n;
        if (key === lastKey) return;
        lastKey = key;
        var m = buildMap(w, h, r, n);
        feImage.setAttribute("href", m.url);
        feImage.setAttribute("width", w);
        feImage.setAttribute("height", h);
        feRim.setAttribute("href", m.rim);
        feRim.setAttribute("width", w);
        feRim.setAttribute("height", h);
        /* 三条位移：红偏多、绿基准、蓝偏少 —— 波长越短折射越强，
           所以蓝的位移量要小于绿、红大于绿，跟真实色散方向一致。 */
        var dsp = opts.dispersion != null ? opts.dispersion : DISPERSION;
        feDispR.setAttribute("scale", m.scale * (1 + dsp));
        feDispG.setAttribute("scale", m.scale);
        feDispB.setAttribute("scale", m.scale * (1 - dsp));
        /* 必须带 important：CSS 里那几条 backdrop-filter 也是 !important，
           普通内联样式压不过它们。 */
        /* 参考 you-want/liquid-glass：把 contrast/brightness/saturate 链在
           url() 之后，而不是全塞进 SVG 滤镜链。对比度是让折射边"立起来"
           的关键，之前完全没有。 */
        var v = "url(#" + id + ")" + (opts.css ? " " + opts.css : "");
        el.style.setProperty("backdrop-filter", v, "important");
        el.style.setProperty("-webkit-backdrop-filter", v, "important");
        el.classList.add("glass-refract");
      }
      builders.push(build);
      build();
      if (window.ResizeObserver) new ResizeObserver(build).observe(el);
      return build;
    }

    /* 暗玻璃：压暗背景，承托白色文字 */
    var DARK = {
      blur: 0.6, slope: 0.74, intercept: 0,
      css: "blur(0.25px) contrast(1.18) brightness(0.98) saturate(1.1)"
    };
    /* 亮玻璃：提亮背景，承托深色文字 */
    var LIGHT = {
      blur: 0.8, slope: 1.06, intercept: 0.045,
      css: "blur(0.25px) contrast(1.2) brightness(1.05) saturate(1.1)"
    };

    attach(document.querySelector(".site-header"), LIGHT);
    /* 暗玻璃：压暗背景，承托白色文字 —— 同一套折射，只是明度方向相反 */
    attach(document.querySelector("#back-to-top"), DARK);
    attach(document.querySelector(".toast"), DARK);

    /* 压在活动照片上的两张表单卡 —— 背后有内容，折射才有意义。
       面积大，位移贴图按需重建（ResizeObserver 已在 attach 里挂好）。 */
    attach(document.querySelector("#request .request-form"), LIGHT);
    attach(document.querySelector("#join .join-form"), LIGHT);

    /* 演示角标由 app.js 在数据加载后才插入 DOM，这里等它出现再挂 */
    var badge = document.querySelector(".demo-badge");
    if (badge) {
      attach(badge, DARK);
    } else if (window.MutationObserver) {
      var mo = new MutationObserver(function () {
        var b = document.querySelector(".demo-badge");
        if (!b) return;
        mo.disconnect();
        attach(b, DARK);
      });
      mo.observe(document.body, { childList: true });
    }

    if (reduceTA.addEventListener) {
      reduceTA.addEventListener("change", function () {
        for (var i = 0; i < builders.length; i++) builders[i]();
      });
    }
  }
  setupLiquidGlass();

  /* ============ 回到顶部 ============ */
  const backTop = document.querySelector("#back-to-top");
  if (backTop) {
    const toggleBackTop = () => backTop.classList.toggle("show", (window.scrollY || 0) > 640);
    window.addEventListener("scroll", toggleBackTop, { passive: true });
    toggleBackTop();
    backTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  /* ============ 阅读进度条 ============ */
  const progress = document.querySelector("#scroll-progress");
  if (progress) {
    const updateProgress = () => {
      const max = (document.documentElement.scrollHeight || 0) - (window.innerHeight || 0);
      const pct = max > 0 ? Math.min(100, Math.max(0, ((window.scrollY || 0) / max) * 100)) : 0;
      progress.style.width = pct + "%";
    };
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    updateProgress();
  }

  /* ============ 顶栏滚动状态（滚过顶部后更实） ============ */
  const siteHeader = document.querySelector(".site-header");
  if (siteHeader) {
    const updateHeader = () => siteHeader.classList.toggle("scrolled", (window.scrollY || 0) > 14);
    window.addEventListener("scroll", updateHeader, { passive: true });
    updateHeader();
  }

  /* ============ 移动端汉堡菜单 ============ */
  const navToggle = document.querySelector("#nav-toggle");
  const navMenu = document.querySelector("#site-nav");
  if (navToggle && navMenu) {
    const closeMenu = () => {
      navMenu.classList.remove("open");
      navToggle.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    };
    navToggle.addEventListener("click", () => {
      const open = navMenu.classList.toggle("open");
      navToggle.classList.toggle("open", open);
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    navMenu.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeMenu();
    });
  }

  /* ============ 复制提取码 ============ */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve) => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch (e) {
        /* 忽略 */
      }
      document.body.removeChild(ta);
      resolve();
    });
  }

  document.addEventListener("click", (event) => {
    const btn = event.target.closest(".copy-code");
    if (!btn) return;
    const code = btn.getAttribute("data-code") || "";
    const original = btn.textContent;
    copyText(code).then(() => {
      btn.textContent = "已复制 ✓";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove("copied");
      }, 1500);
    });
  });

  /* ============ 招新表单（本地模拟） ============ */
  const joinForm = document.querySelector("#join-form");
  const formStatus = document.querySelector(".form-status");
  if (joinForm) {
    joinForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(joinForm);
      const name = data.get("name").trim() || "同学";
      const track = data.get("track");
      formStatus.textContent = `${name}，你的「${track}」意向已填好。这里暂不保存，正式报名请留意社团群通知。`;
      joinForm.reset();
    });
  }
})();
