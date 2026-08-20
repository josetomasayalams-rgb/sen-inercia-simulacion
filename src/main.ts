import * as THREE from "three";
import { buildParams, buildSunsetParams, RESOURCE_LABELS } from "./sim/params.js";
import { createSimulation, type Simulation } from "./sim/simulation.js";
import { computeMetrics } from "./sim/metrics.js";
import type { ResourceKind, SimSnapshot } from "./sim/types.js";
import {
  applyLayout,
  applySunset,
  buildDesertScene,
  CMP_LAYOUT,
  freqToBarScale,
  updatePowerFlow,
  type BessYardRefs,
} from "./render/desertScene.js";
import { CameraDirector, type CameraCue, type CameraMode } from "./render/cameraDirector.js";
import { Chart } from "./ui/charts.js";
import { buildHud, type AppMode, type ComparisonRow, type LaneRow } from "./ui/hud.js";

const DT_SIM = 1 / 240;
const ROTOR_VISUAL_REV_S = 2;
const ROTOR_EXAGGERATION = 60;
const EKIN_EXAGGERATION = 25;

interface StoryPhase {
  resource: ResourceKind;
  title: string;
  shortLabel: string;
}

const STORY_PHASES: StoryPhase[] = [
  { resource: "gfl-pq", title: "Grid-following · solo escucha la red", shortLabel: "GFL-PQ" },
  { resource: "thermal", title: "Térmica · máquina síncrona", shortLabel: "Térmica" },
  { resource: "gfm-vsm", title: "Grid-forming · máquina síncrona virtual", shortLabel: "GFM-VSM" },
];
const FLOW_END = new THREE.Vector3(-10, 8.2, 0);

const STORY_CFG = { tTripS: 2.3, tVoltageS: 2.35, tEnd: 14, tripLabel: "ΔP = −160 MW" };
const TECH_CFG = { tTripS: 2.3, tVoltageS: 2.35, tEnd: 12, tripLabel: "ΔP = −200 MW" };
const STORY_THERMAL_P0_MW = (() => {
  const p = buildSunsetParams("thermal");
  return p.governor.p0Pu * p.sBaseMva;
})();

const app = document.getElementById("overlay") as HTMLDivElement;
const canvas = document.getElementById("scene") as HTMLCanvasElement;

const { renderer, refs } = buildDesertScene(canvas);

function el(id: string): HTMLCanvasElement {
  return document.getElementById(id) as HTMLCanvasElement;
}

// --- cues de cámara semánticos (misma secuencia para la única perturbación) ---
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function storyCuesFor(resource: ResourceKind): CameraCue[] {
  const responseLook = resource === "thermal"
    ? CMP_LAYOUT.thermal.clone().add(v(0, 10, 0))
    : resource.startsWith("gfl")
      ? CMP_LAYOUT.gfl.clone().add(v(0, 10, 0))
      : resource === "gfm-vsm"
        ? CMP_LAYOUT.gfm.clone().add(v(0, 10, 0))
        : v(0, 10, 4);
  const responsePos = responseLook.clone().add(v(48, 26, 92));
  return [
  {
    id: "wide", at: 0, duration: 2.0, reason: "stable",
    fromPos: v(155, 72, 235), toPos: v(92, 42, 142),
    fromLook: v(0, 22, -42), toLook: v(0, 12, -8),
  },
  {
    id: "trip", at: 2.0, duration: 1.0, reason: "activePowerTrip",
    fromPos: v(92, 42, 142), toPos: v(24, 29, 72),
    fromLook: v(0, 12, -8), toLook: v(-8, 9.5, -8),
    hold: true,
  },
  {
    id: "voltage", at: 3.0, duration: 1.0, reason: "reactiveEvent",
    fromPos: v(24, 29, 72), toPos: v(24, 29, 72),
    fromLook: v(-8, 9.5, -8), toLook: v(0, 9.5, 10),
    hold: true,
  },
  {
    id: "parallel", at: 4.0, duration: 4.8, reason: "response",
    fromPos: v(24, 29, 72), toPos: responsePos,
    fromLook: v(0, 9.5, 10), toLook: responseLook,
  },
  {
    id: "result", at: 8.8, duration: 5.2, reason: "summary",
    fromPos: responsePos, toPos: responseLook.clone().add(v(72, 48, 150)),
    fromLook: responseLook, toLook: responseLook,
  },
  ];
}

const director = new CameraDirector(canvas, storyCuesFor(STORY_PHASES[0].resource));
let highContrast = true;
let mode: AppMode = "historia";
let cfg = STORY_CFG;

// --- tres corridas comparables (historia) / recurso seleccionable (técnico) ---
let storyPhaseIndex = 0;
let sim: Simulation = createSimulation(buildSunsetParams(STORY_PHASES[0].resource));
let prevSnap: SimSnapshot = sim.snapshot();
let currSnap: SimSnapshot = prevSnap;
let runSamples: SimSnapshot[] = [currSnap];

// técnico
let techResource: ResourceKind = "thermal";
let scenarioId = "crucero-2026";
const history = new Map<string, RunRecord>();
const storyRuns = new Map<ResourceKind, RunRecord>();

let running = true;
let timeScale = 1;
let accumulator = 0;
let stepCounter = 0;
let finished = false;
let overlaysEnabled = true;

interface RunRecord {
  resource: ResourceKind;
  scenarioId: string;
  traceT: number[];
  traceF: number[];
  traceV: number[];
  traceRocof?: number[];
  traceP?: number[];
  rocof0: number;
  nadir: number;
  tNadir: number;
  vMin: number;
  pMax?: number;
}

const hud = buildHud(app, {
  onPlayPause: togglePlay,
  onRestart: () => restart(true),
  onStep: () => {
    if (running) togglePlay();
    advanceOneStep();
  },
  onTimeScale: (v2) => { timeScale = v2; },
  onMode: (m) => { if (m !== mode) setMode(m); },
  onSkip: () => {
    // "Saltar al evento": avanzar hasta justo antes del trip
    if (mode === "historia" && currSnap.t < cfg.tTripS - 0.05) {
      while (currSnap.t < cfg.tTripS - 0.05) advanceOneStep();
    }
  },
  onResource: (r) => {
    if (mode !== "tecnico" || r === techResource) return;
    archiveRun();
    techResource = r;
    restart(false);
  },
  onScenario: (id) => {
    if (mode !== "tecnico" || id === scenarioId) return;
    archiveRun();
    scenarioId = id;
    restart(false);
  },
  onCamera: (m) => director.setMode(m as CameraMode),
  onHighContrast: (v2) => {
    highContrast = v2;
    document.body.classList.toggle("hc", v2);
  },
  onOverlays: (v2) => {
    overlaysEnabled = v2;
    rebuildOverlays();
  },
});
document.body.classList.add("hc");
document.body.classList.add("ui-clean");
const cleanButton = document.getElementById("btn-clean");
if (cleanButton) {
  cleanButton.textContent = "◧ Mostrar información";
  cleanButton.setAttribute("aria-pressed", "true");
}

// Pulsación prolongada en cualquier zona de la aplicación: pausa/reanuda sin
// interferir con botones, selectores o entradas. Un arrastre cancela el gesto.
const LONG_PRESS_MS = 650;
let longPressTimer: number | null = null;
let longPressStartX = 0;
let longPressStartY = 0;
const cancelLongPress = (): void => {
  if (longPressTimer !== null) window.clearTimeout(longPressTimer);
  longPressTimer = null;
};
document.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, select, input, label, a")) return;
  longPressStartX = event.clientX;
  longPressStartY = event.clientY;
  cancelLongPress();
  longPressTimer = window.setTimeout(() => {
    togglePlay();
    hud.flashPlaybackState(running);
    if (navigator.vibrate) navigator.vibrate(35);
  }, LONG_PRESS_MS);
}, true);
window.addEventListener("pointermove", (event) => {
  if (Math.hypot(event.clientX - longPressStartX, event.clientY - longPressStartY) > 12) cancelLongPress();
});
for (const type of ["pointerup", "pointercancel", "pointerleave"] as const) {
  window.addEventListener(type, cancelLongPress);
}
document.addEventListener("contextmenu", (event) => event.preventDefault());

// --- gráficas: 3 sincronizadas en historia (f+ROCOF, V, P/Q), 4 en técnico ---
let chartF: Chart;
let chartRocof: Chart;
let chartV: Chart;
let chartPQ: Chart;

function buildCharts(): void {
  const evts = [cfg.tTripS, cfg.tVoltageS];
  if (mode === "historia") {
    chartF = new Chart(el("chart-f"), "Frecuencia de la red (Hz) — línea de referencia 50 Hz",
      [{ label: "f", color: "#f1c40f", unit: "Hz" }], 39.5, 50.4, cfg.tEnd, evts, () => highContrast);
    chartRocof = new Chart(el("chart-rocof"), "ROCOF mostrado — velocidad de la caída (Hz/s)",
      [{ label: "ROCOF", color: "#ff5d4d", unit: "Hz/s" }], -2.2, 0.8, cfg.tEnd, evts, () => highContrast);
    chartV = new Chart(el("chart-v"), "Tensión en Crucero 220 kV (pu)",
      [{ label: "V", color: "#39d3ff", unit: "pu" }], 0.95, 1.01, cfg.tEnd, evts, () => highContrast);
    chartPQ = new Chart(el("chart-pq"), "Potencia de apoyo del caso actual",
      [
        { label: "P apoyo", color: "#2ecc71", unit: "MW" },
        { label: "Q apoyo", color: "#b06ab3", unit: "Mvar" },
      ], -20, 220, cfg.tEnd, evts, () => highContrast);
  } else {
    chartF = new Chart(el("chart-f"), "f(t) — frecuencia del bus",
      [{ label: "f", color: "#f1c40f", unit: "Hz" }], 47, 50.6, TECH_CFG.tEnd, evts, () => highContrast);
    chartRocof = new Chart(el("chart-rocof"), "ROCOF mostrado(t)",
      [{ label: "ROCOF", color: "#ff5d4d", unit: "Hz/s" }], -2.5, 1, TECH_CFG.tEnd, evts, () => highContrast);
    chartV = new Chart(el("chart-v"), "V(t) — tensión de barra",
      [{ label: "V", color: "#39d3ff", unit: "pu" }], 0.7, 1.08, TECH_CFG.tEnd, evts, () => highContrast);
    chartPQ = new Chart(el("chart-pq"), "P, Q — recurso de 200 MW",
      [
        { label: "P", color: "#2ecc71", unit: "MW" },
        { label: "Q", color: "#b06ab3", unit: "Mvar" },
      ], -60, 240, TECH_CFG.tEnd, evts, () => highContrast);
  }
}

function cinematicSpeed(t: number): number {
  const slowStart = Math.max(0, cfg.tTripS - 0.15);
  if (t < slowStart) return 1;
  if (t < 4.0) return 0.5;
  return 1;
}

function setMode(m: AppMode): void {
  document.body.classList.remove("story-final");
  mode = m;
  cfg = m === "historia" ? STORY_CFG : TECH_CFG;
  hud.setModeUI(m);
  applyLayout(refs, m === "historia" ? "comparacion" : "tecnico");
  applySunset(refs, m === "historia");
  director.setCues(storyCuesFor(m === "historia" ? STORY_PHASES[0].resource : techResource));
  director.setMode("auto");
  buildCharts();
  restart(true);
}

function togglePlay(): void {
  if (finished) {
    restart(true);
    return;
  }
  running = !running;
  hud.setRunning(running);
}

function restart(keepHistory: boolean): void {
  if (mode === "tecnico" && !keepHistory) archiveRun();
  if (mode === "historia") {
    storyPhaseIndex = 0;
    storyRuns.clear();
    startStoryPhase();
    return;
  }
  accumulator = 0;
  stepCounter = 0;
  finished = false;
  running = true;
  hud.setRunning(true);
  hud.setPhase(null);
  sim = createSimulation(buildParams(techResource, scenarioId));
  hud.setResource(techResource);
  hud.setScenario(scenarioId);
  prevSnap = sim.snapshot();
  currSnap = prevSnap;
  runSamples = [currSnap];
  chartF.reset(); chartRocof.reset(); chartV.reset(); chartPQ.reset();
  pushCharts(currSnap);
  rebuildOverlays();
  refreshComparisonTable();
}

function startStoryPhase(): void {
  document.body.classList.remove("story-final");
  const phase = STORY_PHASES[storyPhaseIndex];
  director.setCues(storyCuesFor(phase.resource));
  accumulator = 0;
  stepCounter = 0;
  finished = false;
  running = true;
  hud.setRunning(true);
  hud.setPhase({ index: storyPhaseIndex + 1, total: STORY_PHASES.length, title: phase.title });
  sim = createSimulation(buildSunsetParams(phase.resource));
  prevSnap = sim.snapshot();
  currSnap = prevSnap;
  runSamples = [currSnap];
  chartF.setComparisonMode(false); chartRocof.setComparisonMode(false);
  chartV.setComparisonMode(false); chartPQ.setComparisonMode(false);
  chartF.setTitle("Frecuencia de la red (Hz) — referencia 50 Hz");
  chartRocof.setTitle(phase.resource === "thermal"
    ? "ROCOF térmico — respuesta suavizada por inercia física"
    : "ROCOF del inversor — cambio instantáneo sin inercia física");
  chartV.setTitle("Tensión en Crucero 220 kV (pu)");
  chartPQ.setTitle("Potencia de apoyo del caso actual");
  chartF.setLimits(39.5, 50.4, cfg.tEnd);
  chartRocof.setLimits(-2.2, 0.8, cfg.tEnd);
  chartV.setLimits(0.95, 1.01, cfg.tEnd);
  chartPQ.setLimits(-20, 220, cfg.tEnd);
  chartF.reset(); chartRocof.reset(); chartV.reset(); chartPQ.reset();
  chartF.clearOverlays(); chartRocof.clearOverlays(); chartV.clearOverlays(); chartPQ.clearOverlays();
  pushCharts(currSnap);
  refreshStoryTable();
}

function supportPQ(s: SimSnapshot, resource: ResourceKind): { p: number; q: number } {
  if (resource === "thermal") {
    return { p: s.pThermalElectricalMw - STORY_THERMAL_P0_MW, q: s.qThermalMvar };
  }
  if (resource === "gfm-vsm") return { p: s.pGfmMw, q: s.qGfmMvar };
  if (resource.startsWith("gfl")) return { p: s.pGflMw, q: s.qGflMvar };
  return { p: 0, q: 0 };
}

function pushCharts(s: SimSnapshot): void {
  chartF.push(s.t, [s.fHz]);
  chartRocof.push(s.t, [s.rocofHzS]);
  chartV.push(s.t, [s.vPu]);
  if (mode === "historia") {
    const pq = supportPQ(s, STORY_PHASES[storyPhaseIndex].resource);
    chartPQ.push(s.t, [pq.p, pq.q]);
  } else {
    chartPQ.push(s.t, [
      s.resource === "thermal" ? s.pThermalElectricalMw : s.resource === "gfm-vsm" ? s.pGfmMw : s.pGflMw,
      s.resource === "gfm-vsm" ? s.qGfmMvar : s.resource === "thermal" ? s.qThermalMvar : s.qGflMvar,
    ]);
  }
}

function advanceOneStep(): void {
  prevSnap = currSnap;
  sim.step();
  currSnap = sim.snapshot();
  stepCounter++;
  if (stepCounter % 4 === 0) {
    runSamples.push(currSnap);
    pushCharts(currSnap);
  }
  if (currSnap.t >= cfg.tEnd - 1e-9) {
    if (mode === "historia") {
      archiveStoryRun();
      if (storyPhaseIndex < STORY_PHASES.length - 1) {
        storyPhaseIndex++;
        startStoryPhase();
      } else {
        finished = true;
        running = false;
        hud.setRunning(false);
        showStoryComparison();
      }
    } else {
      finished = true;
      running = false;
      hud.setRunning(false);
      archiveRun();
      rebuildOverlays();
      refreshComparisonTable();
    }
  }
}

function archiveStoryRun(): void {
  const phase = STORY_PHASES[storyPhaseIndex];
  const metrics = computeMetrics(runSamples, STORY_CFG.tTripS);
  storyRuns.set(phase.resource, {
    resource: phase.resource,
    scenarioId: "story-sunset",
    traceT: runSamples.map((s) => s.t),
    traceF: runSamples.map((s) => s.fHz),
    traceV: runSamples.map((s) => s.vPu),
    traceRocof: runSamples.map((s) => s.rocofHzS),
    traceP: runSamples.map((s) => supportPQ(s, phase.resource).p),
    rocof0: metrics.rocof0HzS,
    nadir: metrics.nadirHz,
    tNadir: metrics.tNadirS,
    vMin: metrics.vMinPu,
    pMax: Math.max(...runSamples.map((s) => supportPQ(s, phase.resource).p)),
  });
}

function showStoryComparison(): void {
  document.body.classList.add("story-final");
  chartF.reset(); chartRocof.reset(); chartV.reset(); chartPQ.reset();
  chartF.clearOverlays(); chartRocof.clearOverlays(); chartV.clearOverlays(); chartPQ.clearOverlays();
  chartF.setComparisonMode(true); chartRocof.setComparisonMode(true);
  chartV.setComparisonMode(true); chartPQ.setComparisonMode(true);
  chartF.setTitle("Comparación final · frecuencia");
  chartRocof.setTitle("ROCOF · GFL vs. térmica vs. GFM");
  chartV.setTitle("Comparación final · tensión en Crucero 220 kV");
  chartPQ.setTitle("Potencia activa de apoyo · térmica vs. GFM");
  chartF.setLimits(39.5, 50.4, cfg.tEnd);
  chartRocof.setLimits(-1.2, 0.25, cfg.tEnd);
  chartV.setLimits(0.98, 1.002, cfg.tEnd);
  chartPQ.setLimits(-5, 175, cfg.tEnd);
  for (const phase of STORY_PHASES) {
    const rec = storyRuns.get(phase.resource);
    if (!rec) continue;
    const color = resourceColor(phase.resource);
    chartF.addOverlay({ t: rec.traceT, values: [rec.traceF] }, color, phase.shortLabel);
    if (rec.traceRocof) {
      chartRocof.addOverlay({ t: rec.traceT, values: [rec.traceRocof] }, color, phase.shortLabel);
    }
    chartV.addOverlay({ t: rec.traceT, values: [rec.traceV] }, color, phase.shortLabel);
    if ((phase.resource === "thermal" || phase.resource === "gfm-vsm") && rec.traceP) {
      chartPQ.addOverlay({ t: rec.traceT, values: [rec.traceP] }, color, phase.shortLabel);
    }
  }
  hud.setPhase({ index: STORY_PHASES.length, total: STORY_PHASES.length, title: "Comparación final de las tres respuestas" });
  refreshStoryTable();
}

function refreshStoryTable(): void {
  const rows: ComparisonRow[] = [];
  for (const phase of STORY_PHASES) {
    const rec = storyRuns.get(phase.resource);
    if (!rec) continue;
    rows.push({
      label: phase.shortLabel,
      rocof0: `${rec.rocof0.toFixed(3)} Hz/s`,
      nadir: `${rec.nadir.toFixed(2)} Hz`,
      vMin: `${rec.vMin.toFixed(3)} pu`,
    });
  }
  hud.setFinalTable(rows);
}

function archiveRun(): void {
  if (mode !== "tecnico") return;
  if (currSnap.t < TECH_CFG.tTripS + 0.3 || runSamples.length < 10) return;
  const key = `${techResource}@${scenarioId}`;
  let rocof0 = 0;
  let nadir = Number.POSITIVE_INFINITY;
  let tNadir = 0;
  let vMin = Number.POSITIVE_INFINITY;
  for (const s of runSamples) {
    if (rocof0 === 0 && s.t > TECH_CFG.tTripS + 1e-3) rocof0 = s.rocofPhysicalHzS;
    if (s.fHz < nadir) { nadir = s.fHz; tNadir = s.t; }
    if (s.vPu < vMin) vMin = s.vPu;
  }  history.set(key, {
    resource: techResource,
    scenarioId,
    traceT: runSamples.map((s) => s.t),
    traceF: runSamples.map((s) => s.fHz),
    traceV: runSamples.map((s) => s.vPu),
    rocof0,
    nadir,
    tNadir,
    vMin,
  });
}

function rebuildOverlays(): void {
  if (mode !== "tecnico") return;
  chartF.clearOverlays();
  chartV.clearOverlays();
  if (!overlaysEnabled) return;
  for (const rec of history.values()) {
    if (rec.resource === techResource && rec.scenarioId === scenarioId) continue;
    chartF.addOverlay({ t: rec.traceT, values: [rec.traceF] }, resourceColor(rec.resource), RESOURCE_LABELS[rec.resource]);
    chartV.addOverlay({ t: rec.traceT, values: [rec.traceV] }, resourceColor(rec.resource), RESOURCE_LABELS[rec.resource]);
  }
}

function resourceColor(r: ResourceKind): string {
  return r === "none" ? "#ff5d4d" : r === "thermal" ? "#e67e22" : r === "gfm-vsm" ? "#2ecc71" : r === "gfl-rpf" ? "#3498db" : r === "gfl-ffr" ? "#9b59b6" : "#95a5a6";
}

function refreshComparisonTable(): void {
  if (mode !== "tecnico") return;
  const rows: ComparisonRow[] = [];
  for (const rec of history.values()) {
    if (rec.scenarioId !== scenarioId) continue;
    rows.push({
      label: RESOURCE_LABELS[rec.resource],
      rocof0: `${rec.rocof0.toFixed(3)} Hz/s`,
      nadir: `${rec.nadir.toFixed(3)} Hz`,
      vMin: `${rec.vMin.toFixed(3)} pu`,
    });
  }
  hud.setComparisonRows(rows);
}

const timer = new THREE.Timer();
const discPos = new THREE.Vector3();
const discQuat = new THREE.Quaternion();
const tmpDir = new THREE.Vector3();
let tRender = 0;

renderer.setAnimationLoop((timestamp: number) => {
  timer.update(timestamp);
  const dtRender = Math.min(timer.getDelta(), 0.05);
  tRender += dtRender;

  if (running && !finished) {
    const scheduledScale = cinematicSpeed(currSnap.t);
    if (timeScale !== scheduledScale) {
      timeScale = scheduledScale;
      hud.setTimeScale(scheduledScale);
    }
    accumulator += dtRender * timeScale;
    let guard = 0;
    while (accumulator >= DT_SIM && guard < 400) {
      advanceOneStep();
      accumulator -= DT_SIM;
      guard++;
    }
  }

  const alpha = running || finished ? accumulator / DT_SIM : 0;
  const fHz = THREE.MathUtils.lerp(prevSnap.fHz, currSnap.fHz, alpha);
  const vPu = THREE.MathUtils.lerp(prevSnap.vPu, currSnap.vPu, alpha);
  const tSim = THREE.MathUtils.lerp(prevSnap.t, currSnap.t, alpha);

  // --- telemetría exacta por recurso (mismo snapshot que el HUD) ---
  if (mode === "historia") {
    const storyResource = STORY_PHASES[storyPhaseIndex].resource;
    const thermalLoad = storyResource === "thermal"
      ? 0.55 + 1.45 * Math.min(1, Math.max(0, currSnap.pMechMw / 160))
      : 0.01;
    refs.smoke.update(dtRender, thermalLoad);
    updateYardPhasors(refs.bess[0], currSnap, storyResource.startsWith("gfl") ? storyResource : "gfl-pq");
    updateYardPhasors(refs.bess[1], currSnap, "gfm-vsm");
    updateFreqBars([currSnap.fHz, currSnap.fHz, currSnap.fHz]);
    updateLanes();
    updateFlows(currSnap);
    updateBreaker(tSim);
    hud.setSolverWarning(!currSnap.converged);
    const limited = currSnap.gflLimited || currSnap.gfmLimited;
    hud.setLimitBadge(limited, limited ? "S/I/SOC" : "");
  } else {
    refs.smoke.update(dtRender, 0.35 + (techResource === "thermal" ? 0.4 * Math.min(1, Math.max(0, currSnap.pMechMw / 160)) : 0));
    updateYardPhasors(refs.bess[0], currSnap, techResource);
    hud.updateMeters(currSnap, {
      eKinExaggeration: EKIN_EXAGGERATION,
      rotorExaggeration: ROTOR_EXAGGERATION,
      supportLabel: techResource === "thermal" ? "P eléctrica" : "P recurso",
    });
    hud.setSolverWarning(!currSnap.converged);
    const limited = currSnap.gflLimited || currSnap.gfmLimited;
    hud.setLimitBadge(limited, limited ? "S/I/SOC" : "");
  }
  hud.setEventBadges(currSnap.tripped, currSnap.voltageEventApplied, cfg.tripLabel);
  hud.setCaption(mode === "historia" ? captionStory(tSim) : captionTech(tSim));

  updateRotor(fHz, dtRender);
  updateEKin(currSnap.eKinPct);
  updateEffects(tSim, vPu);
  director.update(mode === "historia" ? tSim : tSim, dtRender);

  chartF.draw();
  chartRocof.draw();
  chartV.draw();
  chartPQ.draw();

  renderer.render(refs.scene, director.camera);
});

function updateRotor(fHz: number, dtRender: number): void {
  if (!running && !finished) return;
  const deviation = fHz / 50 - 1;
  const rate = ROTOR_VISUAL_REV_S * Math.max(0, 1 + ROTOR_EXAGGERATION * deviation);
  refs.rotor.rotateY(2 * Math.PI * rate * dtRender);
}

function updateEKin(eKinPct: number): void {
  const fill = THREE.MathUtils.clamp(1 - (1 - eKinPct / 100) * EKIN_EXAGGERATION, 0, 1);
  const lit = Math.round(refs.eKinSegments.length * fill);
  refs.eKinSegments.forEach((seg, i) => {
    const mat = seg.material as THREE.MeshStandardMaterial;
    if (i < lit) {
      mat.emissive.setHex(0x2ecc71);
      mat.emissiveIntensity = 0.9;
      mat.color.setHex(0x143824);
    } else {
      mat.emissive.setHex(0x000000);
      mat.color.setHex(0x3a4148);
    }
  });
}

function updateYardPhasors(yard: BessYardRefs, s: SimSnapshot, kind: ResourceKind): void {
  yard.phasorDisc.getWorldPosition(discPos);
  yard.phasorDisc.getWorldQuaternion(discQuat);

  yard.gridPhasor.position.copy(discPos);
  tmpDir.set(1, 0, 0).applyQuaternion(discQuat);
  yard.gridPhasor.setDirection(tmpDir);
  yard.gridPhasor.setLength(6 * Math.max(0.2, s.vPu), 1.3, 0.7);

  let angle = 0;
  let len = 0.5;
  if (kind === "gfm-vsm") {
    angle = s.gfmDeltaRad;
    len = 6 * Math.max(0.2, s.vPu);
  } else {
    angle = s.vAngRad;
    const iMag = Math.hypot(s.pGflMw, s.qGflMvar) / 200;
    len = 1 + 5 * Math.min(1.2, iMag);
  }
  yard.resourcePhasor.position.copy(discPos);
  tmpDir.set(Math.cos(angle), Math.sin(angle), 0).applyQuaternion(discQuat);
  yard.resourcePhasor.setDirection(tmpDir);
  yard.resourcePhasor.setLength(len, 1.1, 0.6);

  for (const bar of yard.socBars) {
    const soc = kind === "gfm-vsm" ? s.socGfmPct : s.socPct;
    bar.scale.x = Math.max(0.02, soc / 100);
  }
}

function updateFreqBars(fArr: number[]): void {
  fArr.forEach((f, i) => {
    const bar = refs.freqBars[i];
    bar.fill.scale.y = freqToBarScale(f);
    const c = f >= 48 ? 0x2ecc71 : f >= 46 ? 0xf1c40f : 0xff5d4d;
    bar.fillMat.emissive.setHex(c);
  });
}

function updateFlows(s: SimSnapshot): void {
  const thermalFrom = new THREE.Vector3(-30, 8.2, -8);
  const gflFrom = new THREE.Vector3(64, 6.2, -14);
  const gfmFrom = new THREE.Vector3(154, 6.2, -14);
  updatePowerFlow(refs.powerFlows[0], thermalFrom, FLOW_END, s.pThermalElectricalMw, tRender, 160);
  updatePowerFlow(refs.powerFlows[1], gflFrom, FLOW_END, s.pGflMw, tRender, 200);
  updatePowerFlow(refs.powerFlows[2], gfmFrom, FLOW_END, s.pGfmMw, tRender, 200);
}

function updateBreaker(tSim: number): void {
  const tripAge = tSim - cfg.tTripS;
  // La perturbación es un cambio equivalente de balance, no una falla que
  // dispare protección. La topología AC permanece conectada durante todo el
  // experimento; el pulso solo marca cuándo se aplicó ΔP.
  refs.breaker.group.rotation.y = 0;
  refs.breaker.blade.rotation.z = 0;
  const arcMat = refs.breaker.arc.material as THREE.MeshBasicMaterial;
  refs.breaker.arc.visible = false;
  arcMat.opacity = 0;
  refs.breaker.label.visible = tripAge >= 0 && tripAge < 3.2;
  for (const disconnector of refs.lineDisconnectors) {
    disconnector.rotation.x = 0;
  }
}

function updateLanes(): void {
  const rows: LaneRow[] = STORY_PHASES.map((phase, index) => {
    const rec = storyRuns.get(phase.resource);
    if (rec) {
      const state = rec.nadir >= 48 ? "ok" : rec.nadir >= 46 ? "warn" : "bad";
      return {
        name: phase.shortLabel,
        fHz: rec.nadir,
        pMw: rec.pMax ?? 0,
        nadirHz: rec.nadir,
        status: `f mín. ${rec.nadir.toFixed(2).replace(".", ",")} Hz`,
        state,
      };
    }
    if (index === storyPhaseIndex && !finished) {
      const pq = supportPQ(currSnap, phase.resource);
      return {
        name: phase.shortLabel,
        fHz: currSnap.fHz,
        pMw: pq.p,
        nadirHz: null,
        status: "EN CURSO",
        state: currSnap.fHz >= 48 ? "ok" : currSnap.fHz >= 46 ? "warn" : "bad",
      };
    }
    return { name: phase.shortLabel, fHz: 50, pMw: 0, nadirHz: null, status: "SIGUE", state: "idle" };
  });
  hud.updateLanes(rows, finished);
}

function updateEffects(tSim: number, vPu: number): void {
  const tripAge = tSim - cfg.tTripS;
  const tripMat = refs.tripPulse.material as THREE.MeshBasicMaterial;
  if (tripAge >= 0 && tripAge < 1.4) {
    refs.tripPulse.visible = true;
    const k = 1 + tripAge * 26;
    refs.tripPulse.scale.set(k, k, k);
    tripMat.opacity = 0.85 * (1 - tripAge / 1.4);
  } else {
    refs.tripPulse.visible = false;
  }

  const waveMat = refs.waveFront.material as THREE.MeshBasicMaterial;
  const waveLeadS = 1.2;
  const waveAge = tSim - (cfg.tTripS - waveLeadS);
  if (waveAge >= 0 && waveAge < waveLeadS) {
    const u = THREE.MathUtils.clamp(waveAge / waveLeadS, 0, 1);
    const p = refs.lineCurve.getPoint(1 - u);
    refs.waveFront.position.copy(p);
    refs.waveFront.visible = true;
    refs.waveFront.scale.setScalar(1 + 3.5 * u);
    waveMat.opacity = 0.35 + 0.65 * u;
  } else {
    refs.waveFront.visible = false;
  }

  const voltAge = tSim - cfg.tVoltageS;
  const voltMat = refs.voltPulse.material as THREE.MeshBasicMaterial;
  if (voltAge >= 0 && voltAge < 1.4) {
    refs.voltPulse.visible = true;
    const k = 1 + voltAge * 14;
    refs.voltPulse.scale.set(k, k, k);
    voltMat.opacity = 0.8 * (1 - voltAge / 1.4);
  } else {
    refs.voltPulse.visible = false;
  }

  const dip = THREE.MathUtils.clamp((1 - vPu) * 10, 0, 1.2);
  refs.busGlow.emissive.setHex(0xff6a3d);
  refs.busGlow.emissiveIntensity = dip;
}

function captionStory(t: number): string {
  if (finished) {
    return "Comparación final ampliada: frecuencia, ROCOF y tensión de los tres casos; abajo se compara la potencia activa adicional de la térmica y del GFM.";
  }
  const phase = STORY_PHASES[storyPhaseIndex];
  if (t < 2.0) {
    return `Caso ${storyPhaseIndex + 1} de ${STORY_PHASES.length}: ${phase.title}. La barra parte equilibrada a 50 Hz y 1 pu antes de repetir la misma perturbación.`;
  }
  if (t < cfg.tTripS) {
    return "La perturbación se acerca a la barra: cambia el balance de potencia, pero la subestación permanece conectada.";
  }
  if (t < cfg.tVoltageS) {
    return "Se retiran 160 MW del balance equivalente. Falta potencia activa: el ROCOF se vuelve negativo y la frecuencia comienza a caer.";
  }
  if (t < 4.0) {
    return "Y ahora, causa distinta: sube la demanda reactiva (+60 MVAr) y la tensión se despega de 1 pu. Frecuencia y tensión son estados separados.";
  }
  if (t < 8.8) {
    switch (phase.resource) {
      case "thermal":
        return "La inercia física ya está en el rotor antes del evento: reduce el ROCOF desde el primer instante y la curva se muestra suavizada. Después entran el gobernador y la turbina.";
      case "gfl-pq":
        return "El GFL no aporta inercia física: el ROCOF cambia de forma instantánea. Mide la red con PLL, pero aquí P/Q están fijos y no hay FFR.";
      case "gfm-vsm":
        return "El GFM tampoco tiene rotor: primero se ve el cambio instantáneo del ROCOF y, milisegundos después, su control virtual inyecta potencia activa para contrarrestarlo.";
      default:
        return "La respuesta depende del servicio configurado y de los límites físicos del recurso.";
    }
  }
  return "Fin del caso. El resultado queda registrado en las gráficas y en la fila del recurso. A continuación se repite la misma perturbación.";
}

function captionTech(t: number): string {
  if (t < TECH_CFG.tTripS) {
    return "ACTO 1 — La red viva. Norte Grande, 50 Hz: el rotor ya está girando y el área almacena energía cinética.";
  }
  if (t < TECH_CFG.tVoltageS) {
    return "ACTO 2 — Perturbación activa: se retiran 200 MW del balance equivalente. El déficit frena los rotores y la frecuencia cae (ROCOF).";
  }
  if (t < 3.2) {
    return "Evento reactivo separado (otra causa): la tensión cae en la carga. Frecuencia y tensión son estados distintos.";
  }
  if (t < 7.5) {
    switch (techResource) {
      case "thermal":
        return "ACTO 3 — Térmica síncrona: la energía cinética se libera de inmediato, sin medir la frecuencia; luego el gobernador abre la válvula.";
      case "gfl-pq":
        return "ACTO 3 — GFL en P/Q fijo: el PLL sigue la red y la potencia no cambia. El soporte debe configurarse y reservarse.";
      case "gfl-rpf":
        return "ACTO 3 — GFL con respuesta primaria: P crece según el droop de frecuencia, siempre dentro de la reserva.";
      case "gfl-ffr":
        return "ACTO 3 — GFL con respuesta rápida: P reacciona a frecuencia y ROCOF con filtros, reserva y límites.";
      case "gfm-vsm":
        return "ACTO 3 — GFM-VSM: el fasor interno sostiene la tensión; P se opone al déficit y Q responde a la caída de tensión, hasta los límites.";
    }
  }
  if (finished) {
    return "Fin de la corrida. Compara recursos, cambia la fortaleza de red (SCR) o reinicia.";
  }
  return "ACTO 4 — Comparación: el ROCOF inicial lo fija la inercia física; el nadir depende del soporte y de sus límites.";
}

window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement)?.tagName === "SELECT" || (e.target as HTMLElement)?.tagName === "INPUT") return;
  if (e.code === "Space") {
    e.preventDefault();
    togglePlay();
  } else if (e.key === "r" || e.key === "R") {
    restart(true);
  } else if (e.key === "s" || e.key === "S") {
    if (running) togglePlay();
    advanceOneStep();
  } else if (e.key === "n" || e.key === "N") {
    hudSkip();
  }
});

function hudSkip(): void {
  if (mode === "historia" && currSnap.t < cfg.tTripS - 0.05) {
    while (currSnap.t < cfg.tTripS - 0.05) advanceOneStep();
  }
}

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  director.resize(window.innerWidth / window.innerHeight);
});

renderer.setSize(window.innerWidth, window.innerHeight);
director.resize(window.innerWidth / window.innerHeight);
setMode("historia");
