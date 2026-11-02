/* MyriadFlow site motion.
 *
 * Every section loads in once when ~30% of it is visible (CSS transitions keyed on
 * `.sec.in`, staggered in reading order). After it lands, each visual acts out a short
 * story on one shared requestAnimationFrame clock. Stories start and end on the resting
 * design, pause while their section is off screen, and are skipped entirely when the
 * visitor prefers reduced motion.
 */

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- easing + keyframe tracks ---------- */

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t;
  const Y = (t) => ((ay * t + by) * t + cy) * t;
  const dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = X(t) - x;
      if (Math.abs(err) < 1e-5) return Y(t);
      const d = dX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1;
    t = x;
    while (hi - lo > 1e-5) {
      if (X(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return Y(t);
  };
}

const E = bezier(0.16, 1, 0.3, 1);
const E2 = bezier(0.33, 1, 0.68, 1);
const IO = bezier(0.65, 0, 0.35, 1);

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a || 1));
const lerp = (a, b, k) => a + (b - a) * k;

// [[time, value], ...] eased per segment; values may be numbers or arrays
function track(keys, t, ease = IO) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i], [t0, v0] = keys[i - 1];
    if (t <= t1) {
      const k = ease(Math.min(1, (t - t0) / (t1 - t0 || 1)));
      return Array.isArray(v0) ? v0.map((v, j) => v + (v1[j] - v) * k) : v0 + (v1 - v0) * k;
    }
  }
  return keys[keys.length - 1][1];
}

// a quick pulse: 0 → 1 → 0 around `at`
const blip = (t, at, rise = 0.15, fall = 0.8) => track([[at, 0], [at + rise, 1], [at + rise + fall, 0]], t, E2);

const blink = (t) => (t % 1 < 0.5 ? 1 : 0);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

/* ---------- navigation ---------- */

const navToggle = document.getElementById("navToggle");
const navPanel = document.getElementById("navPanel");

function setNav(open) {
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  navPanel.hidden = !open;
}

navToggle?.addEventListener("click", () => setNav(navToggle.getAttribute("aria-expanded") !== "true"));
navPanel?.addEventListener("click", (e) => {
  if (e.target.closest("a")) setNav(false);
});

/* ---------- legal pages: highlight the section being read ---------- */

const toc = document.querySelector(".legal-toc");
if (toc) {
  const links = new Map([...toc.querySelectorAll("a")].map((a) => [a.hash.slice(1), a]));
  const spy = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach((a) => a.removeAttribute("aria-current"));
        links.get(e.target.id)?.setAttribute("aria-current", "true");
      }
    },
    { rootMargin: "-30% 0px -60% 0px" },
  );
  links.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) spy.observe(section);
  });
}

/* ---------- sections: intro choreography ---------- */

const sections = [];
const sectionOf = new Map();

function stagger(sec) {
  let cursor = 0, inner = 0, max = 0;
  for (const el of sec.querySelectorAll("[data-a]")) {
    const card = el.parentElement.closest('[data-a="card"]');
    let d;
    if (el.dataset.a === "card") {
      d = cursor;
      cursor += 0.085;
      inner = d + 0.15;
    } else if (card && sec.contains(card)) {
      d = inner;
      inner += 0.045;
    } else {
      d = cursor;
      cursor += 0.07;
    }
    d = Math.min(d, 1.4);
    max = Math.max(max, d);
    el.style.setProperty("--d", `${d.toFixed(3)}s`);
  }
  return max;
}

for (const el of document.querySelectorAll(".sec")) {
  const maxDelay = stagger(el);
  const s = { el, t: 0, visible: false, started: false, landAt: clamp(maxDelay + 1.05, 0.9, 2.4), stories: [] };
  sections.push(s);
  sectionOf.set(el, s);
}

function start(s) {
  s.started = true;
  s.el.classList.add("in");
  setTimeout(() => s.el.classList.add("landed"), reduce ? 0 : s.landAt * 1000);
}

if (reduce) {
  sections.forEach(start);
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const s = sectionOf.get(e.target);
        s.visible = e.isIntersecting;
        const need = Math.min(e.boundingClientRect.height, window.innerHeight) * 0.3;
        if (!s.started && e.isIntersecting && e.intersectionRect.height >= need) start(s);
      }
    },
    { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
  );
  sections.forEach((s) => io.observe(s.el));
}

/* ---------- stories ---------- */

// `setup(el)` always runs (it builds static parts and wires clicks) and returns the
// story: { period, offset, draw(t, x) } where t is time within the period and x the
// total time since the story began.
function story(name, setup) {
  for (const el of document.querySelectorAll(`[data-story="${name}"]`)) {
    const def = setup(el);
    const s = sectionOf.get(el.closest(".sec"));
    if (def && s && !reduce) s.stories.push(def);
  }
}

const measures = [];
const onResize = (fn) => (measures.push(fn), fn);
let resizeRaf = 0;
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => measures.forEach((fn) => fn()));
});

/* Hero: the prompt deletes and retypes, the pipeline evaluates step by step, the
   wireframe draws, the object prints layer by layer and its light ring cycles modes. */
story("hero", (el) => {
  const typed = el.querySelector(".typed");
  const caret = el.querySelector(".prompt .caret");
  const full = typed.dataset.full;
  const N = full.length;
  const steps = [...el.querySelectorAll(".pstep")].map((p) => ({ on: p.querySelector(".pstep-on"), tick: p.querySelector(".tick") }));
  const stage = el.querySelector(".obj-stage");
  const solid = el.querySelector(".obj-solid");
  const wire = el.querySelector(".obj-wire");
  const wirePath = wire.querySelector("path");
  const nozzle = el.querySelector(".nozzle");
  const leds = [...el.querySelectorAll(".leds .led")];
  const modeDots = [...el.querySelectorAll(".mode i")];

  let box = { scale: 1, offY: 0 };
  const measure = onResize(() => {
    const W = stage.clientWidth, H = stage.clientHeight;
    const scale = Math.min(W / 320, H / 240);
    box = { scale, offY: (H - 240 * scale) / 2 };
  });
  measure();

  const DEL = 0.028, TYP = 0.055;
  const tDelEnd = N * DEL;
  const tType = tDelEnd + 0.4;
  const tTypeEnd = tType + N * TYP;
  const tStep = (i) => tTypeEnd + 0.25 + i * 0.38;
  const tWire = [tStep(2), tStep(2) + 0.9];
  const tPrint = [tStep(4), tStep(4) + 1.5];
  const tLed = tPrint[1] + 0.15;
  const tB = tLed + 1.1, tD = tB + 1, tF = tD + 1;
  const P = tF + 1;
  const LAYERS = 24;
  const modes = [
    [[0, 1], [0.45, 1], [0.5, 0], [tLed, 0], [tLed + 0.4, 1], [tB, 1], [tB + 0.3, 0], [tF, 0], [tF + 0.3, 1]],
    [[0, 0], [tB, 0], [tB + 0.3, 1], [tD, 1], [tD + 0.3, 0]],
    [[0, 0], [tD, 0], [tD + 0.3, 1], [tF, 1], [tF + 0.3, 0]],
  ];

  return {
    period: P,
    draw(t) {
      let n = N, typing = false;
      if (t < tDelEnd) (n = N - Math.floor(t / DEL)), (typing = true);
      else if (t < tType) n = 0;
      else if (t < tTypeEnd) (n = Math.floor((t - tType) / TYP) + 1), (typing = true);
      setText(typed, full.slice(0, clamp(n, 0, N)));
      caret.style.opacity = typing ? 1 : blink(t);

      steps.forEach(({ on, tick }, i) => {
        const k = t < 0.35 ? 1 - E2(t / 0.35) : seg(t, tStep(i), tStep(i) + 0.25);
        on.style.opacity = k;
        tick.style.opacity = k;
        tick.style.transform = `scale(${0.82 + 0.18 * E(k)})`;
      });

      const pr = seg(t, tPrint[0], tPrint[1]);
      const layer = Math.floor(pr * LAYERS) / LAYERS;
      const yTop = box.offY + (191.6 - layer * (191.6 - 52.4)) * box.scale;
      if (t < 0.5) {
        solid.style.opacity = 1 - E2(t / 0.5);
        solid.style.clipPath = "inset(0 0 0 0)";
      } else if (t < tPrint[0]) {
        solid.style.opacity = 0;
      } else {
        solid.style.opacity = 1;
        solid.style.clipPath = pr < 1 ? `inset(${yTop.toFixed(1)}px 0 0 0)` : "inset(0 0 0 0)";
      }

      wire.style.opacity = track([[tWire[0], 0], [tWire[0] + 0.15, 1], [tPrint[1], 1], [tPrint[1] + 0.4, 0]], t, E2);
      wirePath.style.strokeDashoffset = 1 - IO(seg(t, tWire[0], tWire[1]));
      nozzle.style.opacity = track([[tPrint[0], 0], [tPrint[0] + 0.12, 1], [tPrint[1] - 0.1, 1], [tPrint[1] + 0.1, 0]], t, E2);
      nozzle.style.transform = `translateY(${yTop.toFixed(1)}px)`;

      modes.forEach((keys, i) => {
        const w = track(keys, t, E2);
        leds[i].style.opacity = w;
        modeDots[i].style.opacity = 0.35 + 0.65 * w;
      });
    },
  };
});

// Satellites bob gently next to the console.
story("hero", (el) => {
  const sats = [...el.closest(".hero-visual").querySelectorAll(".sat-in")];
  return {
    draw(t, x) {
      sats.forEach((s, i) => {
        const y = 2.6 * Math.sin((x / 2.8) * Math.PI * 2 + i * 1.7) * clamp(x / 0.6);
        s.style.transform = `translateY(${y.toFixed(2)}px)`;
      });
    },
  };
});

/* Marquee: moves exactly one full set per loop, so it repeats seamlessly. */
story("marquee", (el) => {
  const set = el.querySelector(".marquee-set");
  let w = set.offsetWidth;
  onResize(() => (w = set.offsetWidth));
  return {
    draw(t, x) {
      el.style.transform = `translateX(${(-(x * 36) % w).toFixed(2)}px)`;
    },
  };
});

/* Agents got hands: a new serial line lands at the bottom, the others step up. */
story("term", (el) => {
  const lines = [...el.querySelectorAll(".tl")];
  const list = el.querySelector(".term-lines");
  const LH = 28, STEP = 1.3, MOVE = 0.55, N = 6, VISIBLE = 4;
  return {
    period: N * STEP,
    offset: 0.2,
    draw(t) {
      const i = Math.floor(t / STEP);
      const k = i + IO(seg(t - i * STEP, 0, MOVE));
      list.style.transform = `translateY(${(-k * LH).toFixed(2)}px)`;
      lines.forEach((ln, j) => {
        const pos = j - k;
        let o = 1, b = 0;
        if (pos < 0) (o = clamp(1 + pos)), (b = -pos * 4);
        else if (pos > VISIBLE - 1) (o = clamp(VISIBLE - pos)), (b = (pos - VISIBLE + 1) * 6);
        ln.style.opacity = o;
        ln.style.filter = b > 0.05 && o > 0 ? `blur(${b.toFixed(2)}px)` : "none";
      });
    },
  };
});

/* Chips got capable: power runs in, the chip wakes, signals travel to the light ring
   and the antenna, the ring chases and the radio waves pulse. */
story("board", (el) => {
  const NS = "http://www.w3.org/2000/svg";
  const svg = el.querySelector("svg");
  const ledG = svg.querySelector(".b-leds");
  const leds = [];
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    for (const cls of ["b-led-base", "b-led-on"]) {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", (Math.cos(a) * 13).toFixed(2));
      c.setAttribute("cy", (Math.sin(a) * 13).toFixed(2));
      c.setAttribute("r", "3.2");
      c.setAttribute("class", cls);
      ledG.append(c);
      if (cls === "b-led-on") leds.push(c);
    }
  }
  const paths = ["#tr-usb", "#tr-led", "#tr-ant"].map((id) => svg.querySelector(id));
  const lens = paths.map((p) => p.getTotalLength());
  const pulses = [...svg.querySelectorAll(".pulse")];
  const chipOn = svg.querySelector(".b-chip-on");
  const waves = [...svg.querySelectorAll(".b-waves path")];
  const runs = [
    [0, 0.0, 0.7],
    [1, 0.85, 1.45],
    [2, 0.85, 1.55],
  ];

  return {
    period: 4.4,
    offset: 0.5,
    draw(t) {
      runs.forEach(([p, a, b]) => {
        const k = IO(seg(t, a, b));
        const pt = paths[p].getPointAtLength(lens[p] * k);
        pulses[p].setAttribute("transform", `translate(${pt.x.toFixed(2)} ${pt.y.toFixed(2)})`);
        pulses[p].style.opacity = track([[a - 0.05, 0], [a + 0.08, 1], [b - 0.08, 1], [b + 0.1, 0]], t, E2);
      });
      chipOn.style.opacity = track([[0.6, 0], [0.8, 1], [2.9, 1], [3.4, 0]], t, E2);
      leds.forEach((led, i) => {
        led.style.opacity = track([[1.5 + i * 0.11, 0], [1.65 + i * 0.11, 1], [3.3, 1], [3.8, 0]], t, E2);
      });
      waves.forEach((w, j) => {
        w.style.opacity = Math.max(blip(t, 1.6 + j * 0.22, 0.15, 0.6), blip(t, 2.5 + j * 0.22, 0.15, 0.6));
      });
    },
  };
});

/* Factories got upload buttons: the file uploads like a progress bar, quotes come back
   one by one, then the parts ship. */
story("fab", (el) => {
  const fill = el.querySelector(".bar-fill");
  const pct = el.querySelector(".file-pct");
  const rows = [...el.querySelectorAll(".quotes li")].map((li) => ({ hl: li.querySelector(".q-hl"), tick: li.querySelector(".q-tick") }));
  const status = el.querySelector(".fab-status");
  return {
    period: 6.6,
    offset: 1.1,
    draw(t) {
      const p = t < 0.3 ? 1 - E2(t / 0.3) : IO(seg(t, 0.5, 1.6));
      fill.style.clipPath = `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0 round 99px)`;
      setText(pct, `${Math.round(p * 100)}%`);
      rows.forEach(({ hl, tick }, i) => {
        const at = 1.8 + i * 0.35;
        const k = t < 0.3 ? 1 - t / 0.3 : seg(t, at, at + 0.25);
        tick.style.opacity = k;
        tick.style.transform = `scale(${0.82 + 0.18 * E(k)})`;
        hl.style.opacity = blip(t, at - 0.1);
      });
      const s = t < 0.3 ? 1 - t / 0.3 : seg(t, 2.95, 3.3);
      status.style.opacity = s;
      status.style.transform = `scale(${0.88 + 0.12 * E(s)})`;
    },
  };
});

/* Vibe manufacturing stages: a pulse walks the seven stages, lighting each in turn. */
story("stages", (el) => {
  const dots = [...el.querySelectorAll(".stage-dot")];
  const lit = dots.map((d) => d.querySelector("i"));
  const rail = el.querySelector(".stages-rail");
  const pulse = el.querySelector(".stages-pulse");
  let pts = null;
  const measure = onResize(() => {
    const r = rail.getBoundingClientRect();
    pts = dots.map((d) => {
      const b = d.getBoundingClientRect();
      return [b.left + b.width / 2 - r.left, b.top + b.height / 2 - r.top];
    });
  });
  const HOP = 0.8, GLIDE = 0.62, T0 = 0.25, n = dots.length;
  return {
    period: T0 + (n - 1) * HOP + 1.6,
    draw(t) {
      if (!pts) measure();
      let u = 0;
      for (let i = 0; i < n - 1; i++) u += IO(seg(t, T0 + i * HOP, T0 + i * HOP + GLIDE));
      const i0 = Math.min(n - 2, Math.floor(u));
      const f = u - i0;
      const x = lerp(pts[i0][0], pts[i0 + 1][0], f);
      const y = lerp(pts[i0][1], pts[i0 + 1][1], f);
      const end = T0 + (n - 1) * HOP;
      pulse.style.opacity = track([[0, 0], [T0, 1], [end, 1], [end + 0.45, 0]], t, E2);
      pulse.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      dots.forEach((d, i) => {
        const l = clamp(1 - Math.abs(u - i) / 0.75) * clamp(1 - seg(t, end, end + 0.6));
        lit[i].style.opacity = l;
        d.style.transform = `scale(${(1 + 0.1 * E2(l)).toFixed(3)})`;
      });
    },
  };
});

/* Creator journey: the highlight steps through the six stages; a click jumps to one. */
story("journey", (el) => {
  const tabs = [...el.querySelectorAll(".j-tab")];
  const panels = [...el.querySelectorAll(".j-panel")];
  const progs = tabs.map((tab) => tab.querySelector(".j-prog"));
  const DWELL = 3.8, N = tabs.length, P = DWELL * N;
  let active = 0, shift = 0, last = 0;

  function show(i, focus = false) {
    if (i === active && !focus) return;
    tabs.forEach((tab, j) => {
      tab.setAttribute("aria-selected", String(j === i));
      tab.tabIndex = j === i ? 0 : -1;
      panels[j].hidden = j !== i;
      panels[j].classList.toggle("is-on", j === i);
    });
    active = i;
    if (focus) tabs[i].focus();
  }

  const pick = (i, focus) => {
    shift = (((i * DWELL - last) % P) + P) % P;
    show(i, focus);
  };
  tabs.forEach((tab, i) => tab.addEventListener("click", () => pick(i)));
  el.querySelector(".j-tabs").addEventListener("keydown", (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (d) {
      e.preventDefault();
      pick((active + d + N) % N, true);
    }
  });

  return {
    draw(t, x) {
      last = x;
      const u = (x + shift) % P;
      const i = Math.floor(u / DWELL);
      show(i);
      const f = (u - i * DWELL) / DWELL;
      progs.forEach((p, j) => (p.style.clipPath = j === i ? `inset(0 ${((1 - f) * 100).toFixed(2)}% 0 0)` : "inset(0 100% 0 0)"));
    },
  };
});

/* TVASTR prototype loop: a pulse runs the ring; each stage lights as it passes. */
story("loop", (el) => {
  const NS = "http://www.w3.org/2000/svg";
  const svg = el.querySelector("svg");
  const g = svg.querySelector(".loop-nodes");
  const labels = ["brief", "PartSpec", "CAD", "DFM", "plan", "slice", "print", "PrintReport", "revision"];
  const C = 260, R = 128, n = labels.length;
  const nodes = labels.map((label, i) => {
    const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
    const x = C + Math.cos(a) * R, y = 200 + Math.sin(a) * R;
    const node = document.createElementNS(NS, "g");
    node.setAttribute("class", "loop-node");
    node.innerHTML = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"/><circle class="on" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"/>`;
    const text = document.createElementNS(NS, "text");
    const cos = Math.cos(a), sin = Math.sin(a);
    text.setAttribute("x", (C + cos * (R + 20)).toFixed(1));
    text.setAttribute("y", (200 + sin * (R + 20) + (sin > 0.6 ? 12 : sin < -0.6 ? -2 : 5)).toFixed(1));
    text.setAttribute("text-anchor", cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle");
    text.textContent = label;
    node.append(text);
    g.append(node);
    return { on: node.querySelector(".on"), text, deg: -90 + (i * 360) / n };
  });
  const tail = svg.querySelector(".loop-tail");
  const pulse = svg.querySelector(".loop-pulse");
  const P = 9;
  return {
    period: P,
    draw(t, x) {
      const p = t / P;
      const deg = -90 + p * 360;
      const a = (deg * Math.PI) / 180;
      const fade = clamp(x / 0.6);
      pulse.setAttribute("transform", `translate(${(C + Math.cos(a) * R).toFixed(2)} ${(200 + Math.sin(a) * R).toFixed(2)})`);
      pulse.style.opacity = fade;
      tail.style.opacity = fade * 0.85;
      tail.style.strokeDashoffset = (0.12 - p).toFixed(4);
      nodes.forEach((nd) => {
        const d = Math.abs((((deg - nd.deg) % 360) + 540) % 360 - 180);
        const l = clamp(1 - d / 34) * fade;
        nd.on.style.opacity = l;
        nd.text.style.opacity = 0.6 + 0.4 * l;
      });
    },
  };
});

/* CAD as code: WALL is retyped 2.4 → 2.0, the section regenerates, DFM re-checks;
   then it goes back to 2.4 so the design rests where it started. */
story("cad", (el) => {
  const sel = el.querySelector(".c-sel");
  const val = el.querySelector(".c-val");
  const caret = el.querySelector(".c-wall .caret");
  const inner = el.querySelector(".sv-inner-g");
  const dim = el.querySelector(".sv-dim");
  const view = el.querySelector(".section-view");
  const sweep = el.querySelector(".sv-sweep");
  const labA = el.querySelector(".sv-a");
  const labB = el.querySelector(".sv-b");
  const badge = el.querySelector(".sv-badge");
  const S = { "2.4": 66 / 90, "2.0": 70 / 90 };
  const DIM = { "2.4": 1, "2.0": 20 / 24 };
  const HALF = 4.8;

  function edit(t, from, to) {
    sel.style.opacity = track([[0, 0], [0.25, 1], [0.55, 1], [0.6, 0]], t, E2);
    const typedN = Math.floor((t - 0.6) / 0.065);
    setText(val, t < 0.6 ? from : to.slice(0, clamp(typedN, 0, to.length)));
    caret.style.opacity = t >= 0.55 && t < 1.3 ? 1 : 0;
    const w = view.clientWidth;
    sweep.style.opacity = track([[1.0, 0], [1.1, 1], [1.7, 1], [1.85, 0]], t, E2);
    sweep.style.transform = `translateX(${lerp(-60, w, IO(seg(t, 1.0, 1.8))).toFixed(1)}px)`;
    const k = IO(seg(t, 1.2, 1.8));
    inner.style.transform = `scale(${lerp(S[from], S[to], k).toFixed(4)})`;
    dim.style.transform = `scaleX(${lerp(DIM[from], DIM[to], k).toFixed(4)})`;
    const lab = E2(seg(t, 1.3, 1.7));
    labA.style.opacity = to === "2.0" ? 1 - lab : lab;
    labB.style.opacity = to === "2.0" ? lab : 1 - lab;
    badge.style.transform = `scale(${track([[1.8, 1], [1.95, 1.08], [2.3, 1]], t, E2).toFixed(3)})`;
  }

  return {
    period: HALF * 2,
    offset: 0.6,
    draw(t) {
      if (t < HALF) edit(t, "2.4", "2.0");
      else edit(t - HALF, "2.0", "2.4");
    },
  };
});

/* Launchpad project page: the stage rail advances to Campaign, the pilot-run bar fills
   while backers count up, and milestones tick off. */
story("proj", (el) => {
  const railFill = el.querySelector(".rail-fill");
  const railLit = [...el.querySelectorAll(".rail-dot > i")];
  const fill = el.querySelector(".fund .bar-fill");
  const pct = el.querySelector(".fund-pct");
  const backers = el.querySelector(".backers");
  const ticks = [...el.querySelectorAll(".miles li:not(.todo) .m-tick")];
  const GOAL = 0.72, BACKERS = 318;
  return {
    period: 8.4,
    offset: 0.4,
    draw(t) {
      const r = t < 0.4 ? track([[0, 0.5], [0.3, 0]], t, E2) : IO(seg(t, 0.5, 1.8)) * 0.5;
      railFill.style.clipPath = `inset(0 ${((1 - r) * 100).toFixed(2)}% 0 0)`;
      railLit.forEach((d, i) => (d.style.opacity = i > 2 ? 0 : clamp((r - i * 0.25) * 20 + 1)));
      const p = t < 0.4 ? track([[0, GOAL], [0.3, 0]], t, E2) : IO(seg(t, 1.6, 3.0)) * GOAL;
      fill.style.clipPath = `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)`;
      setText(pct, `${Math.round(p * 100)}%`);
      setText(backers, String(Math.round((BACKERS * p) / GOAL)));
      ticks.forEach((tk, i) => {
        const k = t < 0.3 ? 1 - t / 0.3 : seg(t, 3.2 + i * 0.3, 3.45 + i * 0.3);
        tk.style.opacity = k;
        tk.style.transform = `scale(${0.82 + 0.18 * E(k)})`;
      });
    },
  };
});

/* One record: a material change lands on Design and traces forward through every layer. */
story("layers", (el) => {
  const rows = [...el.querySelectorAll(".layer")].map((row) => ({ row, on: row.querySelector(".layer-on"), note: row.querySelector(".layer-note") }));
  const pulse = el.querySelector(".layers-pulse");
  let ys = null;
  const measure = onResize(() => (ys = rows.map(({ row }) => row.offsetTop + row.offsetHeight / 2)));
  const HOP = 0.7, START = 1.0, OUT = 5.6;
  return {
    period: 8.4,
    offset: 0.3,
    draw(t) {
      if (!ys) measure();
      let u = 1;
      for (let i = 1; i < rows.length - 1; i++) u += IO(seg(t, START + (i - 1) * HOP, START + (i - 1) * HOP + 0.5));
      const i0 = Math.min(rows.length - 2, Math.floor(u));
      const y = lerp(ys[i0], ys[i0 + 1], u - i0);
      const end = START + (rows.length - 2) * HOP;
      pulse.style.opacity = track([[START - 0.2, 0], [START, 1], [end, 1], [end + 0.4, 0]], t, E2);
      pulse.style.transform = `translateY(${y.toFixed(1)}px)`;
      const out = 1 - E2(seg(t, OUT, OUT + 0.6));
      rows.forEach(({ on, note }, i) => {
        if (i === 0) return;
        const at = i === 1 ? 0.3 : START + (i - 2) * HOP + 0.5;
        const k = E2(seg(t, at, at + 0.3)) * out;
        on.style.opacity = k;
        note.style.opacity = k;
        note.style.transform = `translateY(${((1 - k) * 6).toFixed(2)}px)`;
        note.style.filter = k < 0.99 ? `blur(${((1 - k) * 4).toFixed(2)}px)` : "none";
      });
    },
  };
});

/* Made to your taste: the same object cycles through materials; a click picks one. */
story("config", (el) => {
  const mats = [...el.querySelectorAll(".mat")];
  const buttons = [...el.querySelectorAll(".seg button")];
  const thumb = el.querySelector(".seg-thumb");
  const notes = [...el.querySelectorAll(".cfg-note")];
  const SLOT = 2.6, N = mats.length, P = SLOT * N;
  let shift = 0, last = 0;

  function paint(from, k) {
    const to = (from + 1) % N;
    const x = to === 0 ? from * (1 - k) : from + k;
    thumb.style.transform = `translateX(${(x * 100).toFixed(2)}%)`;
    mats.forEach((m, i) => (m.style.opacity = i === from ? 1 - k : i === to ? k : 0));
    notes.forEach((nt, i) => (nt.style.opacity = i === from ? 1 - k : i === to ? k : 0));
    const on = k > 0.5 ? to : from;
    buttons.forEach((b, i) => b.setAttribute("aria-checked", String(i === on)));
  }

  buttons.forEach((b, i) =>
    b.addEventListener("click", () => {
      shift = (((i * SLOT - last) % P) + P) % P;
      paint(i, 0);
    }),
  );

  return {
    draw(t, x) {
      last = x;
      const u = (x + shift) % P;
      const i = Math.floor(u / SLOT);
      paint(i, IO(seg(u - i * SLOT, SLOT - 0.55, SLOT)));
    },
  };
});

/* Music: playback advances while the equalizer breathes, then scrubs back. */
story("player", (el) => {
  const bars = [...el.querySelectorAll(".eq i")];
  const base = [0.42, 0.7, 0.55, 0.88, 0.62, 0.95, 0.74, 0.5, 0.82, 0.6, 0.9, 0.48, 0.66, 0.38];
  bars.forEach((b, i) => (b.style.transform = `scaleY(${base[i % base.length]})`));
  const bar = el.querySelector(".p-bar");
  const fill = el.querySelector(".p-fill");
  const handle = el.querySelector(".p-handle");
  const cur = el.querySelector(".p-cur");
  const LEN = 228, P0 = 72 / LEN, P1 = 112 / LEN;
  let w = bar.clientWidth;
  onResize(() => (w = bar.clientWidth));
  handle.style.transform = `translateX(${(P0 * w).toFixed(1)}px)`;
  return {
    period: 8.6,
    offset: 0.3,
    draw(t) {
      const p = t < 6.6 ? lerp(P0, P1, t / 6.6) : lerp(P1, P0, IO(seg(t, 6.9, 7.8)));
      fill.style.clipPath = `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)`;
      handle.style.transform = `translateX(${(p * w).toFixed(1)}px)`;
      setText(cur, fmtTime(p * LEN));
      const env = track([[0, 0], [0.6, 1], [6.6, 1], [7.3, 0]], t, E2);
      bars.forEach((b, i) => {
        const h = base[i % base.length] + env * 0.34 * Math.sin(t * (5 + (i % 4) * 1.3) + i * 1.9);
        b.style.transform = `scaleY(${clamp(h, 0.12, 1).toFixed(3)})`;
      });
    },
  };
});

/* Phygital art: the piece is scanned, its corners lock, and the companion record lights. */
story("art", (el) => {
  const scan = el.querySelector(".scan");
  const corners = [...el.querySelectorAll(".corner")];
  const hls = [...el.querySelectorAll(".twin-hl")];
  return {
    period: 7.2,
    offset: 1.2,
    draw(t) {
      scan.style.opacity = track([[0.3, 0], [0.45, 1], [1.8, 1], [2.0, 0]], t, E2);
      scan.style.transform = `translateY(${lerp(-100, 250, IO(seg(t, 0.3, 2.0))).toFixed(1)}%)`;
      const c = track([[1.9, 0], [2.15, 1], [5.4, 1], [5.9, 0]], t, E2);
      corners.forEach((k) => {
        k.style.opacity = c;
        k.style.transform = `scale(${(0.8 + 0.2 * c).toFixed(3)})`;
      });
      hls.forEach((h, j) => (h.style.opacity = blip(t, 2.3 + j * 0.35, 0.15, 0.9)));
    },
  };
});

/* What will you make: ideas are typed, held, deleted and replaced. */
story("ideas", (el) => {
  const typed = el.querySelector(".typed");
  const caret = el.querySelector(".caret");
  const ideas = [
    "a palm-sized desk object that shows my focus mode",
    "a cane grip shaped to my grandmother's hand",
    "a planter that clips onto my balcony rail",
    "a pedal enclosure for my synth, in translucent PETG",
    "a lamp that dims when my calendar says rest",
  ];
  const HOLD = 2.2, DEL = 0.024, GAP = 0.35, TYP = 0.055;
  let at = 0;
  const parts = ideas.map((idea, i) => {
    const next = ideas[(i + 1) % ideas.length];
    const p = { at, idea, next, del: at + HOLD, gap: at + HOLD + idea.length * DEL };
    p.type = p.gap + GAP;
    p.end = p.type + next.length * TYP;
    at = p.end;
    return p;
  });
  return {
    period: at,
    offset: 0.4,
    draw(t) {
      const p = parts.find((q) => t < q.end) || parts[parts.length - 1];
      let text = p.idea, busy = false;
      if (t >= p.type) (text = p.next.slice(0, Math.floor((t - p.type) / TYP) + 1)), (busy = true);
      else if (t >= p.gap) text = "";
      else if (t >= p.del) (text = p.idea.slice(0, p.idea.length - Math.floor((t - p.del) / DEL))), (busy = true);
      setText(typed, text);
      caret.style.opacity = busy ? 1 : blink(t);
    },
  };
});

/* ---------- the clock ---------- */

function step(dt) {
  for (const s of sections) {
    if (!s.started || !s.visible || !s.stories.length) continue;
    s.t += dt;
    const lt = s.t - s.landAt;
    if (lt < 0) continue;
    for (const st of s.stories) {
      const x = lt - (st.offset || 0);
      if (x < 0) continue;
      st.draw(st.period ? x % st.period : x, x);
    }
  }
}

if (!reduce) {
  let prev = performance.now();
  const frame = (now) => {
    // clamp so a backgrounded tab resumes where it left off instead of jumping
    step(Math.min(0.1, (now - prev) / 1000));
    prev = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// dev only: advance the clock by hand when the preview is throttled
if (import.meta.env.DEV) {
  window.__mfStep = (seconds, dt = 1 / 60) => {
    for (let i = 0; i < seconds / dt; i++) step(dt);
  };
  // jump every running section to `seconds` into its stories
  window.__mfSeek = (seconds) => {
    for (const s of sections) if (s.started) s.t = s.landAt + seconds;
    step(0);
  };
}
