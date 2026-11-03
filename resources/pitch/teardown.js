/* Teardown slides: an interactive 3D model you can orbit, explode, X-ray and take apart
 * part by part, with live panels and a tour that drives itself until someone takes over.
 * Each `.slide[data-model]` gets one; it renders only while its slide is on screen. */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const IDLE_RESUME = 15;

/* ---------- geometry helpers (1 unit = 10 mm) ---------- */

function shapeFrom(points, holes = []) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  s.holes.push(...holes);
  return s;
}

function pathFrom(points) {
  const p = new THREE.Path();
  points.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}

function circlePath(cx, cy, r) {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, true);
  return p;
}

const hexPts = (r) => Array.from({ length: 6 }, (_, i) => [r * Math.cos((i * Math.PI) / 3), r * Math.sin((i * Math.PI) / 3)]);

function rectPts(cx, cy, w, h, deg = 0) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

function extrude(shape, depth, bevel = 0) {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 24,
  });
}

function mesh(geo, mat, pos = [0, 0, 0], rot = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const group = (...children) => {
  const g = new THREE.Group();
  g.add(...children);
  return g;
};

/* ---------- the focus object ---------- */

function buildFocus() {
  const R = 3.6, H = 2.8, WALL = 0.24, BOT = 0.25;
  const RIN = R - WALL / Math.cos(Math.PI / 6);
  const yUp = (geo) => geo.rotateX(-Math.PI / 2);
  const m = {
    shell: new THREE.MeshPhysicalMaterial({ color: 0x2b2545, roughness: 0.46, clearcoat: 0.5, clearcoatRoughness: 0.35 }),
    diffuser: new THREE.MeshPhysicalMaterial({ color: 0xf4f0ff, roughness: 0.25, transmission: 0.6, thickness: 0.25, transparent: true, opacity: 0.92 }),
    pcb: new THREE.MeshStandardMaterial({ color: 0x0e3b30, roughness: 0.55 }),
    chip: new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.35 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc9cbd1, metalness: 1, roughness: 0.28 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc8a03a, metalness: 1, roughness: 0.32 }),
    tpu: new THREE.MeshStandardMaterial({ color: 0xf45ec1, roughness: 0.85 }),
    dial: new THREE.MeshPhysicalMaterial({ color: 0x3b3263, roughness: 0.4, clearcoat: 0.6 }),
    led: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x30d8ff, emissiveIntensity: 2.6, roughness: 0.4 }),
    notch: new THREE.MeshStandardMaterial({ color: 0x30d8ff, emissive: 0x30d8ff, emissiveIntensity: 1.4 }),
  };
  const corners = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((a) => [Math.cos(a) * (RIN - 0.42), -Math.sin(a) * (RIN - 0.42)]);
  const BOSS = 1.2;

  const shell = group(
    mesh(yUp(extrude(shapeFrom(hexPts(R)), BOT, 0.05)), m.shell),
    mesh(yUp(extrude(shapeFrom(hexPts(R), [pathFrom(hexPts(RIN))]), H - BOT, 0.05)), m.shell, [0, BOT, 0]),
    ...corners.map(([x, z]) => mesh(new THREE.CylinderGeometry(0.3, 0.34, BOSS, 24), m.shell, [x, BOT + BOSS / 2, z])),
  );
  const feet = group(...[60, 180, 300].map((d) => mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.12, 24), m.tpu, [Math.cos((d * Math.PI) / 180) * 2.4, -0.06, -Math.sin((d * Math.PI) / 180) * 2.4])));
  const inserts = group(...corners.map(([x, z]) => mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.36, 16), m.brass, [x, BOT + BOSS - 0.17, z])));
  const pcbY = BOT + BOSS;
  const pcb = group(
    mesh(yUp(extrude(shapeFrom(hexPts(2.95)), 0.12)), m.pcb, [0, pcbY, 0]),
    mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), m.chip, [0, pcbY + 0.18, 0]),
    mesh(new THREE.BoxGeometry(0.55, 0.22, 0.35), m.steel, [2.25, pcbY + 0.23, 0]),
    mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 20), m.chip, [-1.25, pcbY + 0.21, 0.85]),
  );
  const screws = group(
    ...corners.flatMap(([x, z]) => [
      mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 12), m.steel, [x, pcbY - 0.1, z]),
      mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 20), m.steel, [x, pcbY + 0.17, z]),
    ]),
  );
  const ring = mesh(new THREE.TorusGeometry(1.42, 0.09, 16, 96), m.led, [0, 2.45, 0], [Math.PI / 2, 0, 0]);
  const glow = new THREE.PointLight(0x30d8ff, 3, 6, 1.6);
  glow.position.set(0, 2.5, 0);
  const led = group(ring, glow);
  const diffuser = group(mesh(yUp(extrude(shapeFrom(hexPts(R)), 0.18, 0.04)), m.diffuser, [0, H, 0]));
  const dialY = H + 0.22 + 0.16;
  const dial = group(mesh(new THREE.CylinderGeometry(0.8, 0.84, 0.32, 48), m.dial, [0, dialY, 0]), mesh(new THREE.BoxGeometry(0.08, 0.04, 0.5), m.notch, [0, dialY + 0.18, -0.35]));

  const v = (y) => new THREE.Vector3(0, y, 0);
  const parts = {
    feet: { group: feet, offset: v(0) },
    shell: { group: shell, offset: v(0.9), xray: true },
    inserts: { group: inserts, offset: v(2.0) },
    pcb: { group: pcb, offset: v(2.6) },
    screws: { group: screws, offset: v(3.4) },
    led: { group: led, offset: v(3.7) },
    diffuser: { group: diffuser, offset: v(4.4), xray: true },
    dial: { group: dial, offset: v(5.2) },
  };
  const root = group(...Object.values(parts).map((p) => p.group));

  const MODES = {
    focus: { label: "FOCUS", hex: "#30D8FF", color: 0x30d8ff },
    break: { label: "BREAK", hex: "#F3F1FA", color: 0xf3f1fa },
    dnd: { label: "DND", hex: "#F45EC1", color: 0xf45ec1 },
  };
  const INFO = {
    null: ["Focus object · v4", "72 mm hex · 28 mm tall · PETG shell with 2.4 mm walls"],
    shell: ["Shell · PETG", "2.4 mm walls (6 × 0.4 mm lines) · three bosses with M2 heat-set inserts · TPU feet"],
    electronics: ["ESP32-C3 board + LED ring", "Button → state machine → addressable ring · USB-C 5 V · M2 screws into the inserts"],
    top: ["Diffuser + dial", "Translucent diffuser turns LED dots into one glow · dial with a lit notch"],
  };

  return {
    root,
    parts,
    liftDir: new THREE.Vector3(0, 1, 0),
    sets: { shell: ["shell", "feet", "inserts"], electronics: ["pcb", "led", "screws"], top: ["diffuser", "dial"] },
    camera: { pos: [9, 12.5, 12], target: [0, 1.8, 0], rise: 2.6, min: 9, max: 30 },
    groundY: -0.12,
    mode: "focus",
    tour: [
      { dur: 3 },
      { dur: 3.5, explode: 1, mode: "break" },
      { dur: 2.8, explode: 1, focus: "electronics", mode: "dnd" },
      { dur: 2.8, explode: 1, focus: "top", mode: "focus" },
      { dur: 2.8, explode: 1, focus: "shell" },
      { dur: 3, xray: true, mode: "break" },
      { dur: 2.2, mode: "focus" },
    ],
    tick(state) {
      const c = MODES[state.mode].color;
      ring.material.emissive.setHex(c);
      glow.color.setHex(c);
    },
    hud(state, camera, controls) {
      const [name, info] = INFO[state.focus] || INFO.null;
      const az = (THREE.MathUtils.radToDeg(controls.getAzimuthalAngle()) + 360) % 360;
      return {
        parts: "14",
        explode: `${Math.round(state.explode * 100)}%`,
        mode: MODES[state.mode].label,
        modeHex: MODES[state.mode].hex,
        accent: MODES[state.mode].hex,
        az: `${Math.round(az)}°`,
        partName: name,
        partInfo: info,
      };
    },
  };
}

/* ---------- Sotreus Edge (modelled from the NetSepio build photos) ---------- */

function oledScreen() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  let last = "";
  return {
    tex,
    draw(lines) {
      const key = lines.join("|");
      if (key === last) return;
      last = key;
      g.fillStyle = "#020306";
      g.fillRect(0, 0, 512, 256);
      g.fillStyle = "#5fd6ff";
      g.font = "bold 40px 'JetBrains Mono', ui-monospace, monospace";
      lines.forEach((t, i) => g.fillText(t, 22, 58 + i * 56));
      tex.needsUpdate = true;
    },
  };
}

function silkscreen() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const g = canvas.getContext("2d");
  g.fillStyle = "#f2f2ee";
  g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = "rgba(160,150,120,.45)";
  g.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    g.beginPath();
    g.moveTo(140 + i * 52, 120);
    g.lineTo(140 + i * 52, 200 + (i % 4) * 30);
    g.lineTo(520 + i * 18, 300);
    g.stroke();
  }
  g.fillStyle = "#c9a03a";
  for (let i = 0; i < 18; i++) {
    g.fillRect(48 + i * 52, 18, 26, 26);
    g.fillRect(48 + i * 52, 468, 26, 26);
  }
  g.fillStyle = "#3a3a3a";
  g.font = "bold 54px Barlow, sans-serif";
  g.fillText("HELTEC", 70, 110);
  g.font = "24px 'JetBrains Mono', monospace";
  g.fillText("ESP32 · LoRa · OLED", 70, 150);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildSotreus() {
  const outline = [[-4.3, 3.5], [5, 3.5], [5, -2.2], [3.3, -2.2], [3.3, -3.5], [-5, -3.5], [-5, 2.8]];
  const inset = [[-4.209, 3.28], [4.78, 3.28], [4.78, -1.98], [3.08, -1.98], [3.08, -3.28], [-4.78, -3.28], [-4.78, 2.709]];
  const m = {
    white: new THREE.MeshPhysicalMaterial({ color: 0xf2f0ea, roughness: 0.78, sheen: 0.4, sheenRoughness: 0.8 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1c1c21, roughness: 0.72 }),
    blue: new THREE.MeshPhysicalMaterial({ color: 0x2f86ea, roughness: 0.35, clearcoat: 0.7 }),
    chip: new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.35 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc9cbd1, metalness: 1, roughness: 0.28 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd4a84a, metalness: 1, roughness: 0.3 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 }),
    pouch: new THREE.MeshPhysicalMaterial({ color: 0xb9c0cd, metalness: 0.55, roughness: 0.32, clearcoat: 0.4 }),
    label: new THREE.MeshStandardMaterial({ color: 0x2f5fd0, roughness: 0.6 }),
    red: new THREE.MeshStandardMaterial({ color: 0xd8312f, roughness: 0.5 }),
    wire: new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.5 }),
    jst: new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.6 }),
    ledGreen: new THREE.MeshStandardMaterial({ color: 0x062018, emissive: 0x30ffb0, emissiveIntensity: 1.6 }),
    ledBlue: new THREE.MeshStandardMaterial({ color: 0x061220, emissive: 0x30d8ff, emissiveIntensity: 1.6 }),
    bezel: new THREE.MeshStandardMaterial({ color: 0x0a0a0d, roughness: 0.25 }),
  };
  const screen = oledScreen();
  const oledMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: screen.tex, emissiveIntensity: 1.3, roughness: 0.2 });
  const pcbTop = new THREE.MeshStandardMaterial({ map: silkscreen(), roughness: 0.5 });
  const pcbSide = new THREE.MeshStandardMaterial({ color: 0xe9e8e2, roughness: 0.5 });

  /* enclosure: white front, black back */
  const frontHoles = [
    pathFrom(rectPts(-1.43, 0.4, 2.8, 1.34)),
    pathFrom(rectPts(-4.15, 1.2, 0.8, 0.54)),
    circlePath(-4.15, -0.6, 0.28),
    pathFrom(rectPts(-3.55, -0.48, 0.22, 0.08)),
    pathFrom(rectPts(-3.55, -0.72, 0.22, 0.08)),
    ...[-0.26, 0, 0.26].map((d) => pathFrom(rectPts(2.6 + d * 0.42, 0.1 + d, 0.72, 0.09, -25))),
    circlePath(0.45, -2.85, 0.06),
  ];
  const front = group(
    mesh(extrude(shapeFrom(outline, frontHoles), 0.22, 0.07), m.white, [0, 0, 2.2]),
    mesh(extrude(shapeFrom(outline, [pathFrom(inset)]), 0.9), m.white, [0, 0, 1.3]),
  );
  const bosses = [[-4.3, 2.3], [4.4, 2.9], [4.4, -1.6], [-4.4, -2.9]];
  const back = group(
    mesh(extrude(shapeFrom(outline), 0.2, 0.06), m.black, [0, 0, 0]),
    mesh(extrude(shapeFrom(outline, [pathFrom(inset)]), 1.1), m.black, [0, 0, 0.2]),
    ...bosses.map(([x, y]) => mesh(new THREE.CylinderGeometry(0.28, 0.3, 1.1, 20), m.black, [x, y, 0.75], [Math.PI / 2, 0, 0])),
  );
  const screws = group(
    ...bosses.flatMap(([x, y]) => [
      mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 12), m.steel, [x, y, 0.55], [Math.PI / 2, 0, 0]),
      mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 20), m.steel, [x, y, -0.06], [Math.PI / 2, 0, 0]),
    ]),
  );

  /* the board: white ESP32 + LoRa board with pin headers, chips and USB-C */
  const pins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 0.26), m.gold, 36);
  const tmp = new THREE.Object3D();
  for (let i = 0; i < 36; i++) {
    tmp.position.set(-4.5 + (i % 18) * 0.254, i < 18 ? 1.55 : -0.65, 1.6);
    tmp.updateMatrix();
    pins.setMatrixAt(i, tmp.matrix);
  }
  pins.castShadow = true;
  const board = group(
    mesh(new THREE.BoxGeometry(4.9, 2.5, 0.12), [pcbSide, pcbSide, pcbSide, pcbSide, pcbTop, pcbSide], [-2.3, 0.45, 1.66]),
    pins,
    mesh(new THREE.BoxGeometry(0.75, 0.75, 0.1), m.chip, [-3.55, 0.2, 1.77]),
    mesh(new THREE.BoxGeometry(0.5, 0.5, 0.09), m.chip, [-2.7, -0.25, 1.765]),
    mesh(new THREE.BoxGeometry(0.36, 0.9, 0.32), m.steel, [-4.6, 0.45, 1.87]),
  );
  const oled = group(
    mesh(new THREE.BoxGeometry(2.95, 1.55, 0.05), m.bezel, [-1.43, 0.4, 2.05]),
    mesh(new THREE.BoxGeometry(2.7, 1.3, 0.04), [m.bezel, m.bezel, m.bezel, m.bezel, oledMat, m.bezel], [-1.43, 0.4, 2.09]),
  );

  /* radio: IPEX pigtail → SMA bulkhead → antenna */
  const pigtail = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.2, 1.5, 1.75), new THREE.Vector3(1.4, 1.2, 1.5), new THREE.Vector3(3.2, -0.6, 1.0), new THREE.Vector3(3.9, -1.2, 0.85),
  ]);
  const radio = group(
    mesh(new THREE.TubeGeometry(pigtail, 48, 0.035, 8), m.wire),
    mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 6), m.gold, [3.9, -1.25, 0.85]),
    mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 20), m.gold, [3.9, -1.55, 0.85]),
    mesh(new RoundedBoxGeometry(0.7, 0.42, 0.62, 2, 0.05), m.white, [3.9, -1.75, 0.85]),
    mesh(new THREE.CylinderGeometry(0.21, 0.24, 3.6, 24), m.rubber, [3.9, 0.95, 0.85]),
    mesh(new THREE.SphereGeometry(0.21, 20, 12), m.rubber, [3.9, 2.75, 0.85]),
  );

  /* power: LiPo pouch on a JST lead */
  const lead = (y, mat) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.4, y, 0.55), new THREE.Vector3(-1.2, y + 0.2, 0.7), new THREE.Vector3(-1.9, 0.9, 0.95),
  ]), 24, 0.04, 8), mat);
  const power = group(
    mesh(new RoundedBoxGeometry(3.4, 2.3, 0.55, 3, 0.12), m.pouch, [1.3, -0.35, 0.55]),
    mesh(new THREE.BoxGeometry(3.42, 0.5, 0.56), m.label, [1.3, -0.35, 0.55]),
    lead(-0.15, m.red),
    lead(-0.35, m.wire),
    mesh(new THREE.BoxGeometry(0.45, 0.3, 0.25), m.jst, [-2.0, 0.95, 0.88]),
  );

  /* front panel: two blue buttons, status LEDs, grille ring behind the slots */
  const ui = group(
    mesh(new RoundedBoxGeometry(0.74, 0.48, 0.34, 3, 0.12), m.blue, [-4.15, 1.2, 2.42]),
    mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.34, 32), m.blue, [-4.15, -0.6, 2.42], [Math.PI / 2, 0, 0]),
    mesh(new THREE.BoxGeometry(0.22, 0.08, 0.14), m.ledGreen, [-3.55, -0.48, 2.36]),
    mesh(new THREE.BoxGeometry(0.22, 0.08, 0.14), m.ledBlue, [-3.55, -0.72, 2.36]),
  );
  const speaker = new THREE.Group();
  const ringShape = new THREE.Shape();
  ringShape.absarc(0, 0, 0.62, 0, Math.PI * 2, false);
  ringShape.holes.push(circlePath(0, 0, 0.5));
  speaker.add(
    mesh(extrude(ringShape, 0.55), m.white, [2.6, 0.1, 1.65]),
    // a dark floor under the grille so the vent slots read as openings
    mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.03, 32), m.black, [2.6, 0.1, 2.12], [Math.PI / 2, 0, 0]),
  );

  // plan coordinates: z is up; +y is away from the default camera, so the top half lifts up and back
  const z = (dz, dx = 0, dy = 0) => new THREE.Vector3(dx, dy, dz);
  const parts = {
    back: { group: back, offset: z(0), xray: true },
    screws: { group: screws, offset: z(-0.9) },
    power: { group: power, offset: z(1.0) },
    radio: { group: radio, offset: z(1.6, 1.6) },
    board: { group: board, offset: z(2.6) },
    oled: { group: oled, offset: z(3.4) },
    speaker: { group: speaker, offset: z(3.0, 0, 3.4) },
    front: { group: front, offset: z(3.6, 0, 4.6), xray: true },
    ui: { group: ui, offset: z(4.4, 0, 4.6) },
  };
  const inner = group(...Object.values(parts).map((p) => p.group));
  inner.rotation.x = -Math.PI / 2;
  const root = group(inner);

  const INFO = {
    null: ["Sotreus Edge · in progress", "Two-part printed enclosure · ESP32 + LoRa board with OLED · external antenna · battery leads"],
    shell: ["Enclosure", "3D printed ✓ · white front, black back · OLED window, two buttons, status LEDs, grille · chamfer and notch"],
    board: ["Heltec ESP32 + LoRa board", "Wi-Fi, a LoRa radio and an OLED on one board · USB-C for bench power"],
    radio: ["Antenna path", "IPEX pigtail → SMA bulkhead → external antenna · short-range P2P is in bring-up"],
    power: ["Battery", "LiPo on a JST lead, wired in the back shell"],
    ui: ["Front panel", "Two buttons, two status LEDs and a grille ring behind the slots"],
  };
  const LOG = [
    "[boot] sotreus-edge fw 0.1",
    "[oled] 128×64 ok",
    "[wifi] scan: 7 networks",
    "[wifi] best rssi -74 dBm",
    "[mode] SENSE",
    "[lora] init… ERROR",
    "[lora] retry",
    "[fw] status: loading…",
    "[mode] P2P",
    "[p2p] waiting for a peer…",
  ];
  const rssi = [];
  let sample = 0, logAt = 0, logN = 3, retries = 0;

  return {
    root,
    parts,
    liftDir: new THREE.Vector3(0, 0, 1),
    sets: { shell: ["front", "back", "screws"], board: ["board", "oled"], radio: ["radio"], power: ["power"], ui: ["ui", "speaker"] },
    camera: { pos: [7.5, 13.5, 13], target: [0, 1.2, 0], rise: 3.2, min: 9, max: 34 },
    groundY: -1.05,
    mode: "sense",
    tour: [
      { dur: 3, mode: "sense" },
      { dur: 3.5, explode: 1 },
      { dur: 2.8, explode: 1, focus: "board" },
      { dur: 2.8, explode: 1, focus: "radio", mode: "p2p" },
      { dur: 2.8, explode: 1, focus: "power" },
      { dur: 2.8, explode: 1, focus: "shell" },
      { dur: 3, xray: true, mode: "sense" },
      { dur: 2.2 },
    ],
    tick(state, t, dt) {
      sample += dt;
      if (sample > 0.25) {
        sample = 0;
        rssi.push(-74 + Math.sin(t * 1.3) * 2.4 + Math.sin(t * 4.1) * 1.1);
        if (rssi.length > 40) rssi.shift();
      }
      if (t - logAt > 1.4) {
        logAt = t;
        logN = Math.min(LOG.length, logN + 1);
        if (logN === LOG.length) logN = 3;
        if (state.mode === "p2p") retries = (retries % 5) + 1;
      }
      const blink = Math.floor(t * 2) % 2 === 0;
      const now = Math.round(rssi[rssi.length - 1] ?? -74);
      screen.draw(
        state.mode === "sense"
          ? ["SOTREUS EDGE", "MODE  SENSE", "WIFI  7 APs", `RSSI  ${now} dBm`]
          : ["SOTREUS EDGE", "MODE  P2P", blink ? "LoRa  Error" : "LoRa", `retry ${retries}/5 …`],
      );
    },
    hud(state) {
      const [name, info] = INFO[state.focus] || INFO.null;
      const now = Math.round(rssi[rssi.length - 1] ?? -74);
      return {
        parts: "15",
        explode: `${Math.round(state.explode * 100)}%`,
        rssi: String(now),
        modeNote: state.mode === "sense" ? "Local sensing: Wi-Fi scan + on-device logic" : "Short-range P2P over LoRa — in bring-up",
        partName: name,
        partInfo: info,
        log: LOG.slice(Math.max(0, logN - 5), logN),
        spark: { rssi },
      };
    },
  };
}

/* ---------- engine ---------- */

const MODELS = { focus: buildFocus, sotreus: buildSotreus };

function create(slide, host, build) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block", touchAction: "none" });
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfcac0, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(6, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 45 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  const model = build();
  scene.add(model.root);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.ShadowMaterial({ opacity: 0.13 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = model.groundY;
  ground.receiveShadow = true;
  scene.add(ground);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  camera.position.set(...model.camera.pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...model.camera.target);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: model.camera.min, maxDistance: model.camera.max, autoRotateSpeed: 0.9, maxPolarAngle: Math.PI * 0.49 });
  controls.update();

  const parts = Object.entries(model.parts).map(([key, p]) => {
    const meshes = [], mats = [];
    p.group.traverse((o) => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map((x) => x.clone()) : o.material.clone();
      for (const mt of [].concat(o.material)) {
        mt.userData.baseOpacity = mt.opacity;
        mt.userData.baseTransparent = mt.transparent;
        mats.push(mt);
      }
      meshes.push(o);
    });
    return { key, ...p, base: p.group.position.clone(), meshes, mats, opacity: 1, lift: 0 };
  });

  const state = { explode: 0, explodeT: 0, xray: false, focus: null, mode: model.mode, tour: !reduce, step: 0, stepTime: 0, idle: 0 };

  function applyStep(s) {
    state.explodeT = s.explode ?? 0;
    state.focus = s.focus ?? null;
    state.xray = !!s.xray;
    if (s.mode) state.mode = s.mode;
    sync();
  }

  function interact() {
    state.tour = false;
    state.idle = 0;
  }

  function sync() {
    const on = (sel, test) => slide.querySelectorAll(sel).forEach((b) => b.classList.toggle("is-on", test(b)));
    on("[data-act=assemble]", () => state.explodeT === 0 && !state.focus && !state.xray);
    on("[data-act=explode]", () => state.explodeT === 1 && !state.focus);
    on("[data-act=xray]", () => state.xray);
    on("[data-act=tour]", () => state.tour);
    on("[data-focus]", (b) => b.dataset.focus === state.focus);
    on("[data-mode]", (b) => b.dataset.mode === state.mode);
  }

  slide.querySelectorAll("[data-act]").forEach((b) =>
    b.addEventListener("click", () => {
      const act = b.dataset.act, touring = state.tour;
      interact();
      if (act === "explode") (state.explodeT = 1), (state.focus = null);
      if (act === "assemble") (state.explodeT = 0), (state.focus = null), (state.xray = false);
      if (act === "xray") state.xray = !state.xray;
      if (act === "tour" && !touring) (state.tour = true), (state.step = 0), (state.stepTime = 0), applyStep(model.tour[0]);
      sync();
    }),
  );
  slide.querySelectorAll("[data-focus]").forEach((b) =>
    b.addEventListener("click", () => {
      interact();
      state.focus = state.focus === b.dataset.focus ? null : b.dataset.focus;
      if (state.focus) state.explodeT = 1;
      sync();
    }),
  );
  slide.querySelectorAll("[data-mode]").forEach((b) =>
    b.addEventListener("click", () => {
      interact();
      state.mode = b.dataset.mode;
      sync();
    }),
  );
  controls.addEventListener("start", () => {
    interact();
    sync();
  });

  const hudEls = [...slide.querySelectorAll("[data-hud]")];
  const sparks = [...slide.querySelectorAll("[data-spark]")];
  const logEl = slide.querySelector("[data-log]");
  let hudClock = 0;

  function paintHud() {
    const h = model.hud(state, camera, controls);
    if (h.accent) slide.style.setProperty("--live", h.accent);
    for (const el of hudEls) {
      const v = h[el.dataset.hud];
      if (v !== undefined && el.textContent !== v) el.textContent = v;
    }
    for (const svg of sparks) {
      const s = h.spark?.[svg.dataset.spark];
      if (!s?.length) continue;
      const lo = Math.min(...s) - 1, hi = Math.max(...s) + 1;
      const pts = s.map((v, i) => `${((i / 39) * 200).toFixed(1)},${(40 - ((v - lo) / (hi - lo)) * 36 - 2).toFixed(1)}`).join(" ");
      svg.querySelector("polyline")?.setAttribute("points", pts);
    }
    if (logEl && h.log) {
      const html = h.log.map((l) => `<li${/ERROR|Error/.test(l) ? ' class="err"' : ""}>${l}</li>`).join("");
      if (logEl.innerHTML !== html) logEl.innerHTML = html;
    }
  }

  let time = 0;
  function step(dt) {
    time += dt;
    if (state.tour) {
      state.stepTime += dt;
      if (state.stepTime > model.tour[state.step].dur) {
        state.step = (state.step + 1) % model.tour.length;
        state.stepTime = 0;
        applyStep(model.tour[state.step]);
      }
    } else if (!reduce) {
      state.idle += dt;
      if (state.idle > IDLE_RESUME) {
        state.tour = true;
        state.step = 0;
        state.stepTime = 0;
        applyStep(model.tour[0]);
      }
    }
    controls.autoRotate = state.tour;
    state.explode = dt ? damp(state.explode, state.explodeT, 3.2, dt) : state.explodeT;
    // aim higher as the stack grows, so exploded parts stay in frame
    controls.target.y = model.camera.target[1] + (model.camera.rise || 0) * state.explode;

    const focusSet = state.focus ? new Set(model.sets[state.focus]) : null;
    for (const p of parts) {
      const isFocus = !!focusSet?.has(p.key);
      const target = focusSet ? (isFocus ? 1 : 0.07) : state.xray && p.xray ? 0.14 : 1;
      p.opacity = dt ? damp(p.opacity, target, 7, dt) : target;
      p.lift = dt ? damp(p.lift, isFocus ? 1 : 0, 6, dt) : isFocus ? 1 : 0;
      p.group.position.copy(p.base).addScaledVector(p.offset, state.explode).addScaledVector(model.liftDir, p.lift * 0.5);
      for (const mt of p.mats) {
        const o = mt.userData.baseOpacity * p.opacity;
        const t = o < 0.995 || mt.userData.baseTransparent;
        if (mt.transparent !== t) (mt.transparent = t), (mt.needsUpdate = true);
        mt.opacity = o;
        mt.depthWrite = o > 0.5;
      }
      for (const ms of p.meshes) ms.castShadow = p.opacity > 0.5;
    }
    model.tick(state, time, dt);
    hudClock += dt;
    if (hudClock > 0.15 || !dt) (hudClock = 0), paintHud();
  }

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const scale = host.getBoundingClientRect().width / w || 1;
    renderer.setPixelRatio(Math.min(2.5, (window.devicePixelRatio || 1) * scale));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  window.addEventListener("resize", resize);

  let running = false, raf = 0, last = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    step(dt);
    controls.update();
    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(frame);
  }

  sync();
  if (state.tour) applyStep(model.tour[0]);
  return {
    start() {
      if (running) return;
      running = true;
      resize();
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    still() {
      resize();
      step(0);
      controls.update();
      renderer.render(scene, camera);
    },
  };
}

for (const slide of document.querySelectorAll(".slide[data-model]")) {
  const host = slide.querySelector(".td-canvas");
  const build = MODELS[slide.dataset.model];
  if (!host || !build) continue;
  let app = null;
  const make = () => (app ??= create(slide, host, build));
  slide.addEventListener("slide:on", () => make().start());
  slide.addEventListener("slide:off", () => app?.stop());
  window.addEventListener("beforeprint", () => make().still());
  if (slide.classList.contains("on")) make().start();
}
