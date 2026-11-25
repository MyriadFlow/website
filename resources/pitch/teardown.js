/* Teardown slides: each `.slide[data-model]` gets an interactive 3D model, rendered only
 * while its slide is on screen. The model, the panels and the tour live in
 * src/sotreus.js, which the site shares for the hero model, the passport twin and the
 * Builds case study. */

import { MODELS, create } from "../../src/sotreus.js";

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
