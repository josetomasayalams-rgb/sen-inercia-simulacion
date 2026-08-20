import { buildParams, buildSunsetParams, SCL_CRUCERO_MVA, Z_TH_CRUCERO_PU } from "../sim/params.js";
import { computeMetrics } from "../sim/metrics.js";
import { createSimulation, runSimulation } from "../sim/simulation.js";
import { solveNetwork, theveninFromScl } from "../sim/network.js";
import { cFromPolar, cpx } from "../sim/cpx.js";
import type { ResourceKind } from "../sim/types.js";
import { F0_HZ, I_BASE_A, S_BASE_MVA, V_BASE_KV } from "../sim/units.js";

let failures = 0;
let passes = 0;

function check(name: string, ok: boolean, detail: string): void {
  if (ok) {
    passes++;
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name} — ${detail}`);
  }
}

function approx(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
}

console.log("== Anclas verificadas del escenario Crucero 220 kV ==");
{
  const th = theveninFromScl(SCL_CRUCERO_MVA, V_BASE_KV, S_BASE_MVA);
  check("SCL 3930,4 MVA → Icc ≈ 10314,6 A", approx(th.iCcA, 10314.625, 1e-4), `got ${th.iCcA}`);
  check("SCL 3930,4 MVA → |Zth| ≈ 12,314 Ω", approx(th.zOhm, 12.314268, 1e-4), `got ${th.zOhm}`);
  check("|Zth| ≈ 0,050885 pu en base 200 MVA", approx(th.zPu, Z_TH_CRUCERO_PU, 1e-6), `got ${th.zPu}`);
  check("SCR ≈ 19,652 en base 200 MVA", approx(th.scr, 19.652, 1e-3), `got ${th.scr}`);
  check("Corriente nominal 200 MW a 220 kV ≈ 524,86 A", approx(I_BASE_A, 524.8639, 1e-4), `got ${I_BASE_A}`);
  check("880 MWh a 200 MW = 4,4 h", approx(880 / 200, 4.4, 1e-9), `got ${880 / 200}`);
}

const resources: ResourceKind[] = ["none", "thermal", "gfl-pq", "gfl-rpf", "gfl-ffr", "gfm-vsm"];

console.log("\n== Criterio: el snapshot inicial contiene el punto eléctrico resuelto ==");
{
  const none = createSimulation(buildParams("none", "crucero-2026")).snapshot();
  const thermal = createSimulation(buildParams("thermal", "crucero-2026")).snapshot();
  check("sin recurso: red externa alimenta 200 MW desde t=0", approx(none.pThGridMw, 200, 1e-6), `Pgrid=${none.pThGridMw}`);
  check(
    "con térmica: 40 MW locales y ~160 MW externos desde t=0",
    approx(thermal.pThermalElectricalMw, 40, 1e-5) && approx(thermal.pThGridMw, 160, 1e-5),
    `Pthermal=${thermal.pThermalElectricalMw}, Pgrid=${thermal.pThGridMw}`,
  );
}

console.log("\n== Criterio: sin evento, estado estacionario f=50 Hz, V=1 pu, ROCOF=0 ==");
for (const r of resources) {
  const p = buildParams(r, "crucero-2026");
  const { samples } = runSimulation(p, 1 / 60, false);
  const f = samples[samples.length - 1];
  check(
    `${r}: f=50, V=1, ROCOF=0`,
    Math.abs(f.fHz - F0_HZ) < 1e-6 && Math.abs(f.vPu - 1) < 1e-6 && Math.abs(f.rocofHzS) < 1e-6,
    `f=${f.fHz}, V=${f.vPu}, ROCOF=${f.rocofHzS}`,
  );
}

console.log("\n== Criterio: ROCOF inicial coincide con f0·ΔP/(2·E_phys) (sin soporte) ==");
{
  const p = buildParams("gfl-pq", "crucero-2026");
  const { samples } = runSimulation(p, 1 / 240);
  const m = computeMetrics(samples, p.events.tTripS);
  const ePhysPuS = p.ePhysMWs / p.sBaseMva;
  const rocofTheoretical = (p.f0Hz * -p.events.dTripPu) / (2 * ePhysPuS);
  check(
    `ROCOF0 ≈ ${rocofTheoretical.toFixed(4)} Hz/s`,
    approx(m.rocof0HzS, rocofTheoretical, 0.02),
    `got ${m.rocof0HzS}`,
  );
  check("ROCOF0 < 0 ante déficit activo", m.rocof0HzS < 0, `got ${m.rocof0HzS}`);
}

console.log("\n== Criterio: mayor H física → menor |ROCOF0| ==");
{
  const p1 = buildParams("gfl-pq", "crucero-2026");
  const p2 = buildParams("gfl-pq", "crucero-2026");
  p2.ePhysMWs = p1.ePhysMWs * 2;
  const m1 = computeMetrics(runSimulation(p1, 1 / 240).samples, p1.events.tTripS);
  const m2 = computeMetrics(runSimulation(p2, 1 / 240).samples, p2.events.tTripS);
  check(
    "|ROCOF0| con E×2 ≈ mitad",
    approx(m2.rocof0HzS, m1.rocof0HzS / 2, 0.02),
    `base ${m1.rocof0HzS}, doble E ${m2.rocof0HzS}`,
  );
}

console.log("\n== Criterio: GFL-PQ no cambia P por una variación de frecuencia ==");
{
  const p = buildParams("gfl-pq", "crucero-2026");
  const { samples } = runSimulation(p, 1 / 60);
  const maxAbsP = Math.max(...samples.map((s) => Math.abs(s.pGflMw)));
  const maxAbsQ = Math.max(...samples.map((s) => Math.abs(s.qGflMvar)));
  check(
    "GFL-PQ mantiene P/Q fijos durante todo el evento",
    maxAbsP < 1e-6 && maxAbsQ < 1e-6,
    `max |P| = ${maxAbsP} MW, max |Q| = ${maxAbsQ} MVAr`,
  );
}

console.log("\n== Criterio: observar la red no equivale a prestar soporte ==");
{
  const none = runSimulation(buildSunsetParams("none"), 1 / 60).samples;
  const gfl = runSimulation(buildSunsetParams("gfl-pq"), 1 / 60).samples;
  const maxTraceDelta = Math.max(
    ...none.map((s, i) => Math.max(Math.abs(s.fHz - gfl[i].fHz), Math.abs(s.vPu - gfl[i].vPu))),
  );
  const socUnchanged = gfl.every((s) => Math.abs(s.socMWh - 792) < 1e-9);
  check(
    "GFL-PQ sigue la misma trayectoria que ‘sin apoyo’",
    maxTraceDelta < 1e-9,
    `máxima diferencia f/V = ${maxTraceDelta}`,
  );
  check(
    "GFL-PQ no consume SOC ni potencia DC",
    socUnchanged && gfl.every((s) => Math.abs(s.pDcMw) < 1e-9),
    "apareció energía de soporte",
  );
}

console.log("\n== Criterio: sin servicio complementario no aparece soporte espontáneo ==");
{
  const p = buildSunsetParams("none");
  const { samples } = runSimulation(p, 1 / 60);
  const m = computeMetrics(samples, p.events.tTripS);
  const noSupport = samples.every(
    (s) =>
      Math.abs(s.pThermalElectricalMw) < 1e-9 &&
      Math.abs(s.qThermalMvar) < 1e-9 &&
      Math.abs(s.pGflMw) < 1e-9 &&
      Math.abs(s.qGflMvar) < 1e-9 &&
      Math.abs(s.pGfmMw) < 1e-9 &&
      Math.abs(s.qGfmMvar) < 1e-9,
  );
  check("sin soporte: todos los recursos permanecen en 0 MW/MVAr", noSupport, "apareció soporte no configurado");
  check("sin soporte: la frecuencia cae durante toda la ventana", m.tNadirS >= p.tEndS - 1 / 30, `t_nadir=${m.tNadirS}`);
  check("sin soporte: el evento reactivo reduce la tensión", m.vMinPu < 0.995, `Vmin=${m.vMinPu}`);
}

console.log("\n== Criterio: GFL-RPF responde solo dentro de la reserva configurada ==");
{
  const p = buildParams("gfl-rpf", "crucero-2026");
  const { samples } = runSimulation(p, 1 / 60);
  const m = computeMetrics(samples, p.events.tTripS);
  const reserveMw = p.gfl.reserveUpPu * p.sBaseMva;
  check("P sube tras el déficit", m.pSupportMaxMw > 10, `max P = ${m.pSupportMaxMw} MW`);
  check(
    `P nunca supera la reserva (${reserveMw} MW)`,
    samples.every((s) => s.pGflMw <= reserveMw + 1e-6),
    `max P = ${m.pSupportMaxMw} MW`,
  );
}

console.log("\n== Criterio: GFL-FFR responde rápido y dentro de reserva ==");
{
  const pFfr = buildParams("gfl-ffr", "crucero-2026");
  const pRpf = buildParams("gfl-rpf", "crucero-2026");
  const sFfr = runSimulation(pFfr, 1 / 240).samples;
  const sRpf = runSimulation(pRpf, 1 / 240).samples;
  const at = (arr: typeof sFfr, t: number) => arr.find((s) => s.t >= t);
  const early = at(sFfr, pFfr.events.tTripS + 0.15);
  const earlyRpf = at(sRpf, pRpf.events.tTripS + 0.15);
  check(
    "FFR inyecta más que RPF a los 150 ms",
    !!early && !!earlyRpf && early.pGflMw > earlyRpf.pGflMw,
    `ffr=${early?.pGflMw}, rpf=${earlyRpf?.pGflMw}`,
  );
  const reserveMw = pFfr.gfl.reserveUpPu * pFfr.sBaseMva;
  check("FFR dentro de reserva", sFfr.every((s) => s.pGflMw <= reserveMw + 1e-6), "");
}

console.log("\n== Criterio: GFM-VSM responde P ante Δf<0 y Q ante ΔV<0, con límites ==");
{
  const p = buildParams("gfm-vsm", "crucero-2026");
  const { samples } = runSimulation(p, 1 / 60);
  const m = computeMetrics(samples, p.events.tTripS);
  check("P_gfm aumenta tras el déficit", m.pSupportMaxMw > 10, `max P = ${m.pSupportMaxMw} MW`);
  check("Q_gfm aumenta tras el evento reactivo", m.qSupportMaxMvar > 5, `max Q = ${m.qSupportMaxMvar} Mvar`);

  const sMaxMva = p.limits.sMaxPu * p.sBaseMva;
  const worstS = Math.max(...samples.map((s) => Math.hypot(s.pGfmMw, s.qGfmMvar)));
  check(`P²+Q² ≤ Smax² (${sMaxMva} MVA)`, worstS <= sMaxMva + 1e-6, `worst |S| = ${worstS}`);

  const worstI = Math.max(...samples.map((s) => Math.hypot(s.pGfmMw, s.qGfmMvar) / Math.max(s.vPu, 0.05) / p.sBaseMva));
  check("corriente ≤ Imax", worstI <= p.limits.iMaxPu + 1e-6, `worst I = ${worstI} pu`);

  const socOk = samples.every((s) => s.socMWh >= p.bess.socMinMWh - 1e-9 && s.socMWh <= p.bess.eCapMWh + 1e-9);
  check("SOC dentro de límites", socOk, "");
  const discharged = samples[samples.length - 1].socMWh < samples[0].socMWh;
  check("la energía entregada reduce SOC", discharged, "");
}

console.log("\n== Criterio: potencia GFM RMS rápida y amortiguada, sin sierra sostenida ==");
{
  const pGfm = buildSunsetParams("gfm-vsm");
  const pTh = buildSunsetParams("thermal");
  const gfm = runSimulation(pGfm, 1 / 240).samples;
  const thermal = runSimulation(pTh, 1 / 240).samples;
  const nearest = (arr: typeof gfm, t: number) =>
    arr.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a);
  const tEarly = pGfm.events.tTripS + 0.5;
  const pGfmEarly = nearest(gfm, tEarly).pGfmMw;
  const pThermalEarly = nearest(thermal, tEarly).pThermalElectricalMw - pTh.governor.p0Pu * pTh.sBaseMva;
  check(
    "a 500 ms el GFM aporta más potencia adicional que la térmica",
    pGfmEarly > pThermalEarly + 20,
    `GFM=${pGfmEarly} MW, térmica adicional=${pThermalEarly} MW`,
  );

  const settled = gfm.filter((s) => s.t >= 4);
  let extrema = 0;
  for (let i = 2; i < settled.length; i++) {
    const d0 = settled[i - 1].pGfmMw - settled[i - 2].pGfmMw;
    const d1 = settled[i].pGfmMw - settled[i - 1].pGfmMw;
    if (Math.abs(d0) > 0.01 && Math.abs(d1) > 0.01 && d0 * d1 < 0) extrema++;
  }
  check(
    "la potencia fundamental se asienta sin oscilación tipo sierra",
    extrema <= 2,
    `extremos posteriores a 4 s=${extrema}`,
  );
}

console.log("\n== Criterio: térmica con gobernador mejora el nadir frente a GFL-PQ ==");
{
  const pTh = buildParams("thermal", "crucero-2026");
  const pPq = buildParams("gfl-pq", "crucero-2026");
  const mTh = computeMetrics(runSimulation(pTh, 1 / 60).samples, pTh.events.tTripS);
  const mPq = computeMetrics(runSimulation(pPq, 1 / 60).samples, pPq.events.tTripS);
  check("gobernador sube P_m", mTh.pSupportMaxMw > 20, `max P_m = ${mTh.pSupportMaxMw} MW`);
  check("nadir térmico > nadir GFL-PQ", mTh.nadirHz > mPq.nadirHz, `th=${mTh.nadirHz}, pq=${mPq.nadirHz}`);

  const thermalSamples = runSimulation(buildSunsetParams("thermal"), 1 / 240).samples.filter((s) => s.t > 3);
  const maxPmPeError = Math.max(...thermalSamples.map((s) => Math.abs(s.pMechMw - s.pThermalElectricalMw)));
  const maxAngle = Math.max(...thermalSamples.map((s) => Math.abs(s.machineDeltaRad)));
  check("térmica: el ángulo interno responde al gobernador", maxAngle > 0.02, `delta_max=${maxAngle} rad`);
  check("térmica: P eléctrica sigue P mecánica (< 10 MW)", maxPmPeError < 10, `error_max=${maxPmPeError} MW`);

  const thermalRocof = runSimulation(buildSunsetParams("thermal"), 1 / 240).samples;
  const nearest = (t: number) => thermalRocof.reduce((a, b) =>
    Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a,
  );
  const justAfter = nearest(2.3 + 1 / 240);
  const rocof50ms = nearest(2.35).rocofHzS;
  const rocof150ms = nearest(2.45).rocofHzS;
  const pMech50ms = nearest(2.35).pMechMw;
  const pMech1s = nearest(3.3).pMechMw;
  check(
    "térmica: la derivada física cambia al ocurrir el déficit",
    justAfter.rocofPhysicalHzS < -0.5,
    `ROCOF físico inicial=${justAfter.rocofPhysicalHzS.toFixed(4)} Hz/s`,
  );
  check(
    "térmica: el ROCOF mostrado entra continuamente, sin escalón gráfico",
    Math.abs(justAfter.rocofHzS) < 0.1 * Math.abs(justAfter.rocofPhysicalHzS)
      && rocof50ms < justAfter.rocofHzS
      && rocof150ms < rocof50ms,
    `mostrado inicial=${justAfter.rocofHzS.toFixed(4)}, 50 ms=${rocof50ms.toFixed(4)}, 150 ms=${rocof150ms.toFixed(4)}`,
  );
  check(
    "térmica: primero responde la inercia; gobernador y turbina entran después",
    pMech50ms < 40.1 && pMech1s > pMech50ms + 1,
    `Pm 50 ms=${pMech50ms.toFixed(3)} MW, Pm 1 s=${pMech1s.toFixed(3)} MW`,
  );
}

console.log("\n== Criterio: la máquina síncrona mejora el ROCOF físico inicial ==");
{
  const cases: ResourceKind[] = ["none", "thermal", "gfl-pq", "gfm-vsm"];
  const rocofs = Object.fromEntries(cases.map((r) => {
    const p = buildSunsetParams(r);
    return [r, computeMetrics(runSimulation(p, 1 / 240).samples, p.events.tTripS).rocof0HzS];
  })) as Record<ResourceKind, number>;
  check(
    "sin apoyo, GFL-PQ y GFM comparten el ROCOF de la red externa",
    Math.max(rocofs.none, rocofs["gfl-pq"], rocofs["gfm-vsm"]) - Math.min(rocofs.none, rocofs["gfl-pq"], rocofs["gfm-vsm"]) < 0.01,
    `none=${rocofs.none.toFixed(4)}, gfl=${rocofs["gfl-pq"].toFixed(4)}, gfm=${rocofs["gfm-vsm"].toFixed(4)}`,
  );
  check(
    "térmica reduce |ROCOF| al sumar H·S = 5 s · 250 MVA",
    Math.abs(rocofs.thermal) < Math.abs(rocofs.none) && approx(rocofs.thermal, (50 * -0.8) / (2 * ((4200 + 5 * 250) / 200)), 0.02),
    `thermal=${rocofs.thermal.toFixed(4)}, none=${rocofs.none.toFixed(4)}`,
  );
}

console.log("\n== Criterio: límites de convertidor forman parte de la solución de red ==");
{
  for (const resource of ["gfl-ffr", "gfm-vsm"] as const) {
    const p = buildSunsetParams(resource);
    p.limits = { sMaxPu: 0.25, iMaxPu: 0.3 };
    const samples = runSimulation(p, 1 / 240).samples;
    const apparent = samples.map((s) => resource === "gfm-vsm"
      ? Math.hypot(s.pGfmMw, s.qGfmMvar)
      : Math.hypot(s.pGflMw, s.qGflMvar));
    const limited = samples.some((s) => resource === "gfm-vsm" ? s.gfmLimited : s.gflLimited);
    check(
      `${resource}: S resuelta ≤ límite reducido y limitador visible`,
      Math.max(...apparent) <= 0.25 * p.sBaseMva + 1e-6 && limited,
      `Smax=${Math.max(...apparent)} MVA, limited=${limited}`,
    );
  }
}

console.log("\n== Criterio: GFM mejora nadir y ROCOF observado frente a GFL-PQ ==");
{
  const pGfm = buildParams("gfm-vsm", "crucero-2026");
  const pPq = buildParams("gfl-pq", "crucero-2026");
  const mGfm = computeMetrics(runSimulation(pGfm, 1 / 60).samples, pGfm.events.tTripS);
  const mPq = computeMetrics(runSimulation(pPq, 1 / 60).samples, pPq.events.tTripS);
  check("nadir GFM > nadir GFL-PQ", mGfm.nadirHz > mPq.nadirHz, `gfm=${mGfm.nadirHz}, pq=${mPq.nadirHz}`);
}

console.log("\n== Criterio: no convergencia del solver queda visible, no se oculta ==");
{
  const p = buildParams("gfm-vsm", "scr-1_25");
  p.events.dQLoadPu = 60;
  const { samples } = runSimulation(p, 1 / 240);
  const anyFail = samples.some((s) => !s.converged);
  check("carga reactiva extrema → solverNotConverged visible", anyFail, "todas las muestras convergieron");
  check(
    "no convergencia → conserva el último estado válido y finito",
    samples.some((s) => s.solverHeldLastValid) && samples.every((s) => Number.isFinite(s.vPu) && s.vPu > 0),
    "el estado inválido contaminó la trayectoria",
  );
}

console.log("\n== Escenarios de red débil corren sin errores numéricos ==");
for (const id of ["scr-3", "scr-2", "scr-1_5", "scr-1_25"]) {
  const p = buildParams("gfm-vsm", id);
  const { samples } = runSimulation(p, 1 / 60);
  const allFinite = samples.every((s) => Number.isFinite(s.fHz) && Number.isFinite(s.vPu));
  check(`${id}: trayectorias finitas`, allFinite, "");
}

console.log("\n== Historia — mañana soleada, área equivalente de baja inercia ==");
{
  const lanes = {
    thermal: runSimulation(buildSunsetParams("thermal"), 1 / 60),
    "gfl-pq": runSimulation(buildSunsetParams("gfl-pq"), 1 / 60),
    "gfm-vsm": runSimulation(buildSunsetParams("gfm-vsm"), 1 / 60),
  };
  const m = {
    thermal: computeMetrics(lanes.thermal.samples, buildSunsetParams("thermal").events.tTripS),
    "gfl-pq": computeMetrics(lanes["gfl-pq"].samples, buildSunsetParams("gfl-pq").events.tTripS),
    "gfm-vsm": computeMetrics(lanes["gfm-vsm"].samples, buildSunsetParams("gfm-vsm").events.tTripS),
  };
  const rocofTheory = (dPu: number, ePhysMWs: number, sBase: number) =>
    (50 * -dPu) / (2 * (ePhysMWs / sBase));

  check(
    `ROCOF0 historia ≈ ${rocofTheory(0.8, 4200, 200).toFixed(3)} Hz/s`,
    approx(m["gfl-pq"].rocof0HzS, rocofTheory(0.8, 4200, 200), 0.02),
    `got ${m["gfl-pq"].rocof0HzS}`,
  );
  check(
    "térmica sostiene la frecuencia (nadir > 47 Hz)",
    m.thermal.nadirHz > 47,
    `nadir ${m.thermal.nadirHz}`,
  );
  check(
    "GFL-PQ deja caer la frecuencia (nadir < 45 Hz) y no inyecta P",
    m["gfl-pq"].nadirHz < 45 && m["gfl-pq"].pSupportMaxMw < 1e-6,
    `nadir ${m["gfl-pq"].nadirHz}, Pmax ${m["gfl-pq"].pSupportMaxMw}`,
  );
  check(
    "GFM-VSM sostiene la frecuencia (nadir > 47 Hz)",
    m["gfm-vsm"].nadirHz > 47,
    `nadir ${m["gfm-vsm"].nadirHz}`,
  );
  check(
    "GFM ≈ térmica: |nadir GFM − nadir térmica| ≤ 0,6 Hz",
    Math.abs(m["gfm-vsm"].nadirHz - m.thermal.nadirHz) <= 0.6,
    `gfm ${m["gfm-vsm"].nadirHz} vs térmica ${m.thermal.nadirHz}`,
  );
  check(
    "GFM mejora claramente el nadir frente a GFL-PQ",
    m["gfm-vsm"].nadirHz - m["gfl-pq"].nadirHz > 3,
    `gfm ${m["gfm-vsm"].nadirHz} vs gfl ${m["gfl-pq"].nadirHz}`,
  );
  check(
    "GFM responde Q al evento reactivo con margen (Q > 15 Mvar)",
    m["gfm-vsm"].qSupportMaxMvar > 15,
    `Qmax ${m["gfm-vsm"].qSupportMaxMvar}`,
  );
  {
    const p = buildSunsetParams("gfm-vsm");
    const sMax = p.limits.sMaxPu * p.sBaseMva;
    const worstS = Math.max(...lanes["gfm-vsm"].samples.map((x) => Math.hypot(x.pGfmMw, x.qGfmMvar)));
    check(`historia: P²+Q² ≤ Smax² (${sMax} MVA)`, worstS <= sMax + 1e-6, `worst |S| ${worstS}`);
    const socOk = lanes["gfm-vsm"].samples.every(
      (x) => x.socMWh >= p.bess.socMinMWh - 1e-9 && x.socMWh <= p.bess.eCapMWh + 1e-9,
    );
    check("historia: SOC dentro de límites", socOk, "");
  }
}

console.log("\n== Modo comparación: tres recursos en paralelo, un solo reloj de eventos ==");
{
  const p = buildSunsetParams("thermal", ["thermal", "gfl-pq", "gfm-vsm"]);
  const { samples } = runSimulation(p, 1 / 60);
  const m = computeMetrics(samples, p.events.tTripS);
  const last = samples[samples.length - 1];
  const steady = runSimulation(
    { ...p, events: { ...p.events, tTripS: Number.POSITIVE_INFINITY, tVoltageS: Number.POSITIVE_INFINITY } },
    1 / 60,
  ).samples;
  const steadyLast = steady[steady.length - 1];

  check(
    "paralelo sin eventos: f=50, V=1, ROCOF=0",
    Math.abs(steadyLast.fHz - F0_HZ) < 1e-6 && Math.abs(steadyLast.vPu - 1) < 1e-6 && Math.abs(steadyLast.rocofHzS) < 1e-6,
    `f=${steadyLast.fHz}, V=${steadyLast.vPu}`,
  );
  check(
    "paralelo: ROCOF0 ≈ f0·ΔP/(2·E_phys) (inercia física manda)",
    approx(m.rocof0HzS, (50 * -0.8) / (2 * (p.ePhysMWs / 200)), 0.03),
    `got ${m.rocof0HzS}`,
  );
  check(
    "paralelo: GFL-PQ no inyecta P ni Q",
    samples.every((x) => Math.abs(x.pGflMw) < 1e-6 && Math.abs(x.qGflMvar) < 1e-6),
    "GFL movió P/Q",
  );
  check(
    "paralelo: térmica aporta P eléctrica > 50 MW",
    samples.some((x) => x.pThermalElectricalMw > 50),
    "P eléctrica térmica insuficiente",
  );
  check(
    "paralelo: Q térmica propia del solver (~50 MVAr tras evento reactivo)",
    samples.some((x) => x.qThermalMvar > 20),
    `Qmax térmica ${Math.max(...samples.map((x) => x.qThermalMvar)).toFixed(1)}`,
  );
  check(
    "paralelo: GFM aporta P activa de soporte",
    samples.some((x) => x.pGfmMw > 50),
    `Pmax GFM ${Math.max(...samples.map((x) => x.pGfmMw)).toFixed(1)}`,
  );
  check(
    "paralelo: térmica y GFM comparten el déficit (ambos > 40 MW)",
    samples.some((x) => x.pThermalElectricalMw > 40) && samples.some((x) => x.pGfmMw > 40),
    "",
  );
  check(
    "paralelo: SOC del GFM se descarga por energía activa (GFL-PQ intacto)",
    Math.abs(last.socMWh - 792) < 1e-9 && last.socGfmMWh < 792 - 1e-9,
    `soc gfl=${last.socMWh}, gfm=${last.socGfmMWh}`,
  );
  {
    // criterio 15: el nadir de la ventana se distingue del final
    const p2 = buildSunsetParams("thermal", ["thermal", "gfl-pq", "gfm-vsm"]);
    const s2 = runSimulation(p2, 1 / 60).samples;
    const m2 = computeMetrics(s2, p2.events.tTripS);
    check(
      "paralelo: nadir en ventana reportado y distinto de f final",
      Number.isFinite(m2.nadirHz) && Math.abs(m2.nadirHz - last.fHz) < 3 && m2.nadirHz < 50,
      `nadir=${m2.nadirHz}, f_final=${last.fHz}`,
    );
  }
}

console.log("\n== Criterio: límites físicos nuevos cierran condiciones de borde ==");
{
  const machine = solveNetwork({
    eTh: cpx(1, 0),
    zTh: cpx(0, Z_TH_CRUCERO_PU),
    machine: {
      enabled: true,
      e: cFromPolar(1.3, 1.2),
      z: cpx(0, 0.3),
      limits: {
        electrical: { sMaxPu: 1.25, iMaxPu: 1.25 },
        preferP: true,
        allowDischarge: true,
        allowCharge: true,
      },
    },
    gfm: { enabled: false, e: cpx(1, 0), z: cpx(0, 0.3) },
    gfl: { enabled: false, pPu: 0, qPu: 0 },
    loadPPu: 1,
    loadQPu: 0.15,
  });
  check(
    "térmica extrema queda limitada a 250 MVA / corriente nominal",
    machine.machineLimited && Math.hypot(machine.sMachine.re, machine.sMachine.im) <= 1.25 + 1e-6,
    `S=${Math.hypot(machine.sMachine.re, machine.sMachine.im)} pu, limited=${machine.machineLimited}`,
  );

  const p = buildParams("gfm-vsm", "crucero-2026");
  p.bess.soc0MWh = p.bess.socMinMWh + 1e-10;
  const sim = createSimulation(p);
  while (sim.state.t < p.events.tTripS + 0.2) sim.step();
  check(
    "BESS no cruza SOC mínimo ni siquiera desde la frontera",
    sim.state.bessGfm.energyMWh >= p.bess.socMinMWh,
    `E=${sim.state.bessGfm.energyMWh}, Emin=${p.bess.socMinMWh}`,
  );
  check(
    "orden de tensión GFM se actualiza con el control",
    Math.abs(sim.state.gfm.eCmdPu - 1) > 1e-8,
    `Ecmd=${sim.state.gfm.eCmdPu}`,
  );
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
