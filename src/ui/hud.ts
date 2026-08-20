import type { SimSnapshot } from "../sim/types.js";
import { GRID_SCENARIOS, RESOURCE_LABELS } from "../sim/params.js";
import type { ResourceKind } from "../sim/types.js";

export interface HudCallbacks {
  onPlayPause(): void;
  onRestart(): void;
  onStep(): void;
  onTimeScale(v: number): void;
  onResource(r: ResourceKind): void;
  onScenario(id: string): void;
  onCamera(mode: string): void;
  onHighContrast(v: boolean): void;
  onOverlays(v: boolean): void;
  onMode(mode: AppMode): void;
  onSkip(): void;
}

export type AppMode = "historia" | "tecnico";

export interface PhaseInfo {
  index: number;
  total: number;
  title: string;
}

export interface LaneRow {
  name: string;
  fHz: number;
  pMw: number;
  nadirHz: number | null;
  status?: string;
  state?: "ok" | "warn" | "bad" | "idle";
}

export interface HudRefs {
  setRunning(running: boolean): void;
  updateMeters(s: SimSnapshot, extras: MeterExtras): void;
  setCaption(text: string): void;
  setSolverWarning(visible: boolean): void;
  setLimitBadge(active: boolean, reason: string): void;
  setEventBadges(tripped: boolean, voltEvent: boolean, tripLabel?: string): void;
  setComparisonRows(rows: ComparisonRow[]): void;
  setResource(r: ResourceKind): void;
  setScenario(id: string): void;
  setModeUI(mode: AppMode): void;
  updateLanes(rows: LaneRow[], finished: boolean): void;
  setPhase(phase: PhaseInfo | null): void;
  setFinalTable(rows: ComparisonRow[]): void;
  setTimeScale(v: number): void;
  flashPlaybackState(running: boolean): void;
}

export interface MeterExtras {
  eKinExaggeration: number;
  rotorExaggeration: number;
  supportLabel: string;
}

export interface ComparisonRow {
  label: string;
  rocof0: string;
  nadir: string;
  vMin: string;
}

export function buildHud(root: HTMLElement, cb: HudCallbacks): HudRefs {
  root.innerHTML = `
  <div id="hud">
    <header id="topbar">
      <div id="title">
        <h1>SEN — inercia, GFL y GFM-VSM</h1>
        <p class="sub">Crucero 220 kV · Norte Grande · equivalente RMS educativo</p>
      </div>
      <div id="badges">
        <span class="badge" id="badge-scenario"></span>
        <span class="badge" id="badge-resource"></span>
        <span class="badge warn hidden" id="badge-solver">flujo no convergió · último estado válido</span>
        <span class="badge warn hidden" id="badge-limits">limitador activo</span>
        <span class="badge event hidden" id="badge-trip">ΔP = −200 MW</span>
        <span class="badge event hidden" id="badge-volt">evento reactivo</span>
      </div>
    </header>

    <div id="disclaimer">Historia ilustrativa con física simplificada — no es un caso operativo del SEN. <span id="disclaimer-tech" class="hidden">Equivalente RMS educativo.</span></div>

    <aside id="controls">
      <div class="row transport">
        <button id="btn-play" title="Pausa / reproducir (espacio)">⏸ Pausa</button>
        <button id="btn-restart" title="Reiniciar (R)">↺ Reiniciar</button>
        <button id="btn-step" title="Paso (S)">⏭ Paso</button>
      </div>
      <label>Modo
        <select id="sel-mode">
          <option value="historia" selected>Historia (tres casos comparables)</option>
          <option value="tecnico">Modo técnico (Crucero)</option>
        </select>
      </label>
      <label>Velocidad
        <select id="sel-speed">
          <option value="0.1">0,1×</option>
          <option value="0.25">0,25× (cinemática)</option>
          <option value="0.5">0,5× (perturbación)</option>
          <option value="0.75">0,75×</option>
          <option value="1" selected>1×</option>
          <option value="4">4×</option>
        </select>
      </label>
      <label id="row-resource">Recurso intercambiable (200 MW)
        <select id="sel-resource"></select>
      </label>
      <label id="row-scenario">Fortaleza de red
        <select id="sel-scenario"></select>
      </label>
      <label>Cámara
        <select id="sel-camera">
          <option value="auto" selected>Cinemática (auto)</option>
          <option value="libre">Libre (órbita)</option>
          <option value="tecnica">Técnica (cenital)</option>
          <option value="comparacion">Comparación (general)</option>
        </select>
      </label>
      <label class="check"><input type="checkbox" id="chk-hc" checked /> Alto contraste</label>
      <label class="check"><input type="checkbox" id="chk-overlays" checked /> Superponer corridas anteriores</label>
      <div id="comparison">
        <h2>Comparación del mismo evento</h2>
        <table>
          <thead><tr><th>Caso</th><th>ROCOF₀</th><th>f mín.</th><th>V mín.</th></tr></thead>
          <tbody id="comparison-body"></tbody>
        </table>
      </div>
      <div id="scale-note">
        Exageración visual declarada: variación de velocidad del rotor ×60 · anillo E<sub>k</sub> ×25.
        La curva numérica muestra los valores físicos reales.
      </div>
    </aside>

    <section id="meters">
      <div class="meter big"><span class="k">f</span><span class="v" id="m-f">50.000</span><span class="u">Hz</span></div>
      <div class="meter"><span class="k">ROCOF</span><span class="v" id="m-rocof">0.000</span><span class="u">Hz/s</span></div>
      <div class="meter"><span class="k">V</span><span class="v" id="m-v">220.0</span><span class="u">kV</span><span class="u2" id="m-vpu">1.000 pu</span></div>
      <div class="meter"><span class="k" id="m-p-label">P recurso</span><span class="v" id="m-p">0.0</span><span class="u">MW</span></div>
      <div class="meter"><span class="k">Q recurso</span><span class="v" id="m-q">0.0</span><span class="u">Mvar</span></div>
      <div class="meter"><span class="k">P flota</span><span class="v" id="m-fleet">200.0</span><span class="u">MW</span></div>
      <div class="meter"><span class="k">P mec</span><span class="v" id="m-pmech">0.0</span><span class="u">MW</span></div>
      <div class="meter"><span class="k">SOC BESS</span><span class="v" id="m-soc">90.0</span><span class="u">%</span><span class="u2" id="m-socmwh">792 MWh</span></div>
      <div class="meter"><span class="k">E<sub>k</sub> área</span><span class="v" id="m-ekin">100.0</span><span class="u">%</span></div>
    </section>

    <section id="lanes" class="hidden">
      <div class="lane" data-lane="0">
        <span class="dot"></span>
        <span class="lname">GFL-PQ</span>
        <span class="lf">50,00 <small>Hz</small></span>
        <span class="lp">0 MW</span>
        <span class="lst">—</span>
      </div>
      <div class="lane" data-lane="1">
        <span class="dot"></span>
        <span class="lname">Térmica</span>
        <span class="lf">50,00 <small>Hz</small></span>
        <span class="lp">0 MW</span>
        <span class="lst">—</span>
      </div>
      <div class="lane" data-lane="2">
        <span class="dot"></span>
        <span class="lname">GFM-VSM</span>
        <span class="lf">50,00 <small>Hz</small></span>
        <span class="lp">0 MW</span>
        <span class="lst">—</span>
      </div>
    </section>

    <div id="caption"><span id="caption-text"></span></div>
    <div id="phase-banner" class="hidden"><span id="phase-kicker"></span><strong id="phase-title"></strong></div>
    <button id="btn-skip" title="Saltar al evento (N)">⏩ Saltar al evento</button>
    <button id="btn-clean" aria-pressed="false" title="Ocultar o mostrar la información secundaria">◫ Ocultar información</button>
    <div id="playback-toast" role="status" aria-live="polite"></div>

    <footer id="chartbar">
      <canvas id="chart-f"></canvas>
      <canvas id="chart-rocof" aria-label="Comparación del ROCOF entre grid-following, térmica y grid-forming"></canvas>
      <canvas id="chart-v"></canvas>
      <canvas id="chart-pq"></canvas>
    </footer>
  </div>`;

  const $ = <T extends HTMLElement>(id: string): T => root.querySelector(`#${id}`) as T;

  const selResource = $<HTMLSelectElement>("sel-resource");
  for (const [key, label] of Object.entries(RESOURCE_LABELS)) {
    if (key === "none") continue;
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = label;
    selResource.appendChild(opt);
  }
  const selScenario = $<HTMLSelectElement>("sel-scenario");
  for (const s of GRID_SCENARIOS) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.label;
    selScenario.appendChild(opt);
  }

  $("btn-play").addEventListener("click", cb.onPlayPause);
  $("btn-restart").addEventListener("click", cb.onRestart);
  $("btn-step").addEventListener("click", cb.onStep);
  $("sel-speed").addEventListener("change", (e) => cb.onTimeScale(parseFloat((e.target as HTMLSelectElement).value)));
  $("sel-mode").addEventListener("change", (e) => cb.onMode((e.target as HTMLSelectElement).value as AppMode));
  selResource.addEventListener("change", (e) => cb.onResource((e.target as HTMLSelectElement).value as ResourceKind));
  selScenario.addEventListener("change", (e) => cb.onScenario((e.target as HTMLSelectElement).value));
  $("sel-camera").addEventListener("change", (e) => cb.onCamera((e.target as HTMLSelectElement).value));
  $("chk-hc").addEventListener("change", (e) => cb.onHighContrast((e.target as HTMLInputElement).checked));
  $("chk-overlays").addEventListener("change", (e) => cb.onOverlays((e.target as HTMLInputElement).checked));
  $("btn-skip").addEventListener("click", cb.onSkip);
  $("btn-clean").addEventListener("click", () => {
    const clean = !document.body.classList.contains("ui-clean");
    document.body.classList.toggle("ui-clean", clean);
    if (clean) {
      $<HTMLSelectElement>("sel-speed").value = "1";
      cb.onTimeScale(1);
    }
    const button = $("btn-clean");
    button.textContent = clean ? "◧ Mostrar información" : "◫ Ocultar información";
    button.setAttribute("aria-pressed", String(clean));
  });

  const fmt = (v: number, d = 1): string => v.toFixed(d).replace(".", ",");
  const laneEls = Array.from(root.querySelectorAll<HTMLElement>("#lanes .lane"));
  const LANE_DOTS = ["#3498db", "#e67e22", "#2ecc71"];

  function laneState(fHz: number): { label: string; cls: string } {
    if (fHz >= 48) return { label: "SOSTIENE", cls: "ok" };
    if (fHz >= 46) return { label: "FRÁGIL", cls: "warn" };
    return { label: "SE CAE", cls: "bad" };
  }

  return {
    setRunning(running) {
      $("btn-play").textContent = running ? "⏸ Pausa" : "▶ Reproducir";
    },
    setTimeScale(v) {
      const select = $<HTMLSelectElement>("sel-speed");
      select.value = String(v);
    },
    flashPlaybackState(running) {
      const toast = $("playback-toast");
      toast.textContent = running ? "▶ Reproduciendo" : "⏸ Simulación pausada";
      toast.classList.remove("show");
      void toast.offsetWidth;
      toast.classList.add("show");
    },
    updateMeters(s, extras) {
      $("m-f").textContent = s.fHz.toFixed(3);
      $("m-rocof").textContent = s.rocofHzS.toFixed(3);
      $("m-v").textContent = s.vKv.toFixed(1);
      $("m-vpu").textContent = `${s.vPu.toFixed(3)} pu`;
      // Telemetría propia por recurso (spec §8.1/8.2): nunca señales prestadas.
      const p = s.resource === "thermal"
        ? s.pThermalElectricalMw
        : s.resource === "gfm-vsm" ? s.pGfmMw : s.pGflMw;
      const q = s.resource === "thermal"
        ? s.qThermalMvar
        : s.resource === "gfm-vsm" ? s.qGfmMvar : s.qGflMvar;
      $("m-p-label").textContent = extras.supportLabel;
      $("m-p").textContent = fmt(p);
      $("m-q").textContent = fmt(q);
      $("m-fleet").textContent = fmt(s.pFleetMw);
      $("m-pmech").textContent = fmt(s.pMechMw);
      $("m-soc").textContent = fmt(s.socPct);
      $("m-socmwh").textContent = `${fmt(s.socMWh, 0)} MWh`;
      $("m-ekin").textContent = fmt(s.eKinPct);
    },
    setCaption(text) {
      $("caption-text").textContent = text;
    },
    setSolverWarning(visible) {
      $("badge-solver").classList.toggle("hidden", !visible);
    },
    setLimitBadge(active, reason) {
      const el = $("badge-limits");
      el.classList.toggle("hidden", !active);
      el.textContent = active ? `limitador activo (${reason})` : "limitador activo";
    },
    setEventBadges(tripped, voltEvent, tripLabel) {
      const tripEl = $("badge-trip");
      tripEl.textContent = tripLabel ?? "ΔP = −200 MW";
      tripEl.classList.toggle("hidden", !tripped);
      $("badge-volt").classList.toggle("hidden", !voltEvent);
    },
    setComparisonRows(rows) {
      const body = $("comparison-body");
      body.innerHTML = "";
      for (const r of rows) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${r.label}</td><td>${r.rocof0}</td><td>${r.nadir}</td><td>${r.vMin}</td>`;
        body.appendChild(tr);
      }
    },
    setFinalTable(rows) {
      this.setComparisonRows(rows);
    },
    setResource(r) {
      selResource.value = r;
      $("badge-resource").textContent = RESOURCE_LABELS[r];
    },
    setScenario(id) {
      selScenario.value = id;
      const s = GRID_SCENARIOS.find((x) => x.id === id);
      $("badge-scenario").textContent = s ? s.label : id;
    },
  setModeUI(mode) {
    const hist = mode === "historia";
    $("lanes").classList.toggle("hidden", !hist);
    $("meters").classList.toggle("hidden", hist);
    $("row-resource").classList.toggle("hidden", hist);
    $("row-scenario").classList.toggle("hidden", hist);
    $("comparison").classList.toggle("hidden", false);
    $("badge-resource").classList.toggle("hidden", hist);
    $("badge-scenario").classList.toggle("hidden", hist);
    $("chart-rocof").classList.toggle("hidden", false);
    $("chartbar").classList.toggle("cmp", false);
    $("scale-note").classList.toggle("hidden", hist);
    $("btn-skip").classList.toggle("hidden", !hist);
    $("phase-banner").classList.toggle("hidden", true);
    document.title = hist
      ? "¿Quién sostiene la red? — tres casos comparables"
      : "SEN — Inercia, GFL y GFM-VSM · Crucero 220 kV";
    $("title").querySelector("h1")!.textContent = hist
      ? "¿Quién sostiene la red?"
      : "SEN — inercia, GFL y GFM-VSM";
    $("title").querySelector(".sub")!.textContent = hist
      ? "Mismo evento · GFL, térmica y GFM · comparación final"
      : "Crucero 220 kV · Norte Grande · equivalente RMS educativo";
    const cmpH2 = $("comparison").querySelector("h2");
    if (cmpH2) cmpH2.textContent = hist ? "Comparación final del mismo evento" : "Comparación del mismo evento";
  },
    setPhase(phase) {
      const banner = $("phase-banner");
      if (!phase) {
        banner.classList.add("hidden");
        return;
      }
      banner.classList.remove("hidden");
      $("phase-kicker").textContent = `SIMULACIÓN ${phase.index} DE ${phase.total}`;
      $("phase-title").textContent = phase.title;
    },
    updateLanes(rows, finished) {
      rows.forEach((row, i) => {
        const el = laneEls[i];
        if (!el) return;
        const dot = el.querySelector<HTMLElement>(".dot")!;
        const st = row.state ? { label: row.status ?? "—", cls: row.state } : laneState(row.fHz);
        dot.style.background = LANE_DOTS[i];
        el.querySelector<HTMLElement>(".lf")!.innerHTML =
          `${fmt(row.fHz, 2)} <small>Hz</small>`;
        el.querySelector<HTMLElement>(".lp")!.textContent = `${fmt(Math.max(0, row.pMw), 0)} MW`;
        const stEl = el.querySelector<HTMLElement>(".lst")!;
        if (row.status) {
          stEl.textContent = row.status;
        } else if (finished && row.nadirHz !== null) {
          stEl.textContent = `nadir ${fmt(row.nadirHz, 2)} Hz`;
        } else {
          stEl.textContent = st.label;
        }
        el.dataset.state = st.cls;
      });
    },
  };
}
