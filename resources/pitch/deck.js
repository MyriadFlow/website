/* Vibe Manufacturing deck controller.
 * Presenting (wide, landscape windows): one slide at a time on a scaled 1600×900 stage,
 * driven by keyboard, swipe, the HUD, or the slide list. Elsewhere the slides stack and
 * scroll. `.on` marks the slide(s) currently in view; reveals and loops key off it. */

const root = document.documentElement;
const stage = document.getElementById("stage");
const slides = [...stage.querySelectorAll(".slide")];
const total = slides.length;
const presentMQ = window.matchMedia("(min-width: 900px) and (min-aspect-ratio: 1/1)");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const bar = document.getElementById("bar");
const count = document.getElementById("count");
const hud = document.getElementById("hud");
const hint = document.getElementById("hint");
const toc = document.getElementById("toc");
const tocList = document.getElementById("tocList");

let index = 0;
let scrollSpy = null;

/* ---------- build: footers, reveal delays, slide list ---------- */

slides.forEach((slide, n) => {
  const foot = document.createElement("footer");
  foot.className = "s-foot";
  foot.innerHTML = `<span>Vibe Manufacturing · MyriadFlow</span><span>${String(n + 1).padStart(2, "0")} / ${total}</span>`;
  slide.append(foot);
  slide.id = `s${n + 1}`;
  [...slide.querySelectorAll("[data-a]")].forEach((el, k) => el.style.setProperty("--d", `${(0.08 + Math.min(k * 0.07, 1)).toFixed(2)}s`));

  const li = document.createElement("li");
  li.innerHTML = `<a href="#${n + 1}"><span>${String(n + 1).padStart(2, "0")}</span>${slide.dataset.title || "Slide"}</a>`;
  tocList.append(li);
});

/* ---------- typing prompts ---------- */

const IDEAS = [
  "a palm-sized desk object that shows my focus mode",
  "a cane grip shaped to my grandmother's hand",
  "a planter that clips onto my balcony rail",
  "a pedal enclosure for my synth, in translucent PETG",
  "a lamp that dims when my calendar says rest",
];

function startTyping(slide) {
  for (const el of slide.querySelectorAll("[data-type]")) {
    stopTyping(el);
    const lines = el.dataset.type === "ideas" ? IDEAS : [el.dataset.type];
    if (reduce) {
      el.textContent = lines[0];
      continue;
    }
    let line = 0, n = 0, dir = 1;
    const tick = () => {
      const text = lines[line];
      n += dir;
      el.textContent = text.slice(0, n);
      let wait = dir > 0 ? 55 : 22;
      if (dir > 0 && n >= text.length) {
        if (lines.length === 1) return;
        dir = -1;
        wait = 2200;
      } else if (dir < 0 && n <= 0) {
        dir = 1;
        line = (line + 1) % lines.length;
        wait = 350;
      }
      el._typer = setTimeout(tick, wait);
    };
    el.textContent = "";
    el._typer = setTimeout(tick, 600);
  }
}

function stopTyping(el) {
  clearTimeout(el._typer);
}

function setOn(slide, on) {
  if (slide.classList.contains("on") === on) return;
  slide.classList.toggle("on", on);
  if (on) startTyping(slide);
  else slide.querySelectorAll("[data-type]").forEach(stopTyping);
}

/* ---------- presenting ---------- */

function fit() {
  const s = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
  stage.style.setProperty("--s", s.toFixed(4));
}

function go(n, force = false) {
  n = Math.max(0, Math.min(total - 1, n));
  if (n === index && !force) return;
  slides.forEach((s, k) => {
    s.classList.toggle("is-active", k === n);
    setOn(s, k === n);
  });
  index = n;
  bar.style.width = `${((n + 1) / total) * 100}%`;
  count.textContent = `${n + 1} / ${total}`;
  history.replaceState(null, "", `#${n + 1}`);
  tocList.querySelectorAll("a").forEach((a, k) => a.toggleAttribute("aria-current", k === n));
}

const next = () => go(index + 1);
const prev = () => go(index - 1);

/* ---------- scrolling (phones, portrait) ---------- */

function startScroll() {
  slides.forEach((s) => s.classList.remove("is-active"));
  scrollSpy = new IntersectionObserver(
    (entries) => {
      for (const e of entries) setOn(e.target, e.isIntersecting);
    },
    { threshold: 0.2 },
  );
  slides.forEach((s) => scrollSpy.observe(s));
  // jump to a linked slide once fonts and layout have settled, or the browser resets it
  if (index > 0) document.fonts.ready.then(() => requestAnimationFrame(() => slides[index].scrollIntoView()));
}

function setMode() {
  const present = presentMQ.matches;
  root.classList.toggle("present", present);
  scrollSpy?.disconnect();
  scrollSpy = null;
  if (present) {
    fit();
    go(index, true);
  } else {
    startScroll();
  }
}

/* ---------- input ---------- */

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!toc.hidden) {
    if (e.key === "Escape" || e.key === "m") closeToc();
    return;
  }
  if (!root.classList.contains("present")) {
    if (e.key === "m") openToc();
    return;
  }
  const keys = {
    ArrowRight: next, ArrowDown: next, PageDown: next, " ": next, Enter: next,
    ArrowLeft: prev, ArrowUp: prev, PageUp: prev, Backspace: prev,
    Home: () => go(0), End: () => go(total - 1),
    f: toggleFullscreen, m: openToc,
  };
  const fn = keys[e.key];
  if (fn) {
    e.preventDefault();
    fn();
    dismissHint();
  }
});

let touchX = null;
stage.addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
stage.addEventListener("touchend", (e) => {
  if (touchX === null || !root.classList.contains("present")) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
  touchX = null;
});

document.getElementById("prev").addEventListener("click", prev);
document.getElementById("next").addEventListener("click", next);
document.getElementById("menu").addEventListener("click", openToc);
document.getElementById("fs").addEventListener("click", toggleFullscreen);
document.getElementById("tocClose").addEventListener("click", closeToc);

tocList.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (!a) return;
  e.preventDefault();
  const n = Number(a.getAttribute("href").slice(1)) - 1;
  closeToc();
  if (root.classList.contains("present")) go(n);
  else slides[n].scrollIntoView();
});

function openToc() {
  toc.hidden = false;
  toc.querySelector("[aria-current]")?.focus() || toc.querySelector("a")?.focus();
}

function closeToc() {
  toc.hidden = true;
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else root.requestFullscreen?.();
}

let idle;
function wake() {
  hud.classList.remove("idle");
  clearTimeout(idle);
  idle = setTimeout(() => root.classList.contains("present") && hud.classList.add("idle"), 2600);
}
document.addEventListener("mousemove", wake);
wake();

function dismissHint() {
  hint.classList.add("gone");
}
setTimeout(dismissHint, 6000);

window.addEventListener("hashchange", () => {
  const n = parseInt(location.hash.slice(1), 10);
  if (n && root.classList.contains("present")) go(n - 1);
});

window.addEventListener("resize", () => root.classList.contains("present") && fit());
presentMQ.addEventListener("change", setMode);

/* ---------- print: every slide on its own page ---------- */

window.addEventListener("beforeprint", () => {
  root.classList.add("printing", "present");
  slides.forEach((s) => s.classList.add("on"));
});

window.addEventListener("afterprint", () => {
  root.classList.remove("printing");
  setMode();
});

/* ---------- start ---------- */

const start = parseInt(location.hash.slice(1), 10);
index = start ? Math.max(0, Math.min(total - 1, start - 1)) : 0;
setMode();
