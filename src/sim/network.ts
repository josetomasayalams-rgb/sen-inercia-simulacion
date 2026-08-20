import { cAdd, cConj, cDiv, cFromPolar, cMul, cScale, cSub, cpx, type Cpx } from "./cpx.js";
import { applyElectricalLimits } from "./limits.js";
import type { LimitParams } from "./types.js";

export interface InjectionLimits {
  electrical: LimitParams;
  preferP: boolean;
  allowDischarge: boolean;
  allowCharge: boolean;
  /** Límites energéticos del paso actual, expresados en la base del sistema. */
  pDischargeMaxPu?: number;
  pChargeMaxPu?: number;
}

export interface VoltageSource {
  enabled: boolean;
  e: Cpx;
  z: Cpx;
  limits?: InjectionLimits;
}

export interface PowerInjection {
  enabled: boolean;
  pPu: number;
  qPu: number;
  limits?: InjectionLimits;
}

export interface NetworkInputs {
  eTh: Cpx;
  zTh: Cpx;
  machine: VoltageSource;
  gfm: VoltageSource;
  gfl: PowerInjection;
  loadPPu: number;
  loadQPu: number;
}

export interface NetworkSolution {
  v: Cpx;
  vMagPu: number;
  vAngRad: number;
  converged: boolean;
  iterations: number;
  iTh: Cpx;
  sTh: Cpx;
  sMachine: Cpx;
  sGfm: Cpx;
  sGfl: Cpx;
  gfmLimited: boolean;
  gflLimited: boolean;
  machineLimited: boolean;
}

const MAX_ITER = 60;
const TOL = 1e-11;
const DAMP = 0.5;
const V_MIN = 1e-6;

function guardV(v: Cpx): Cpx {
  const m = Math.hypot(v.re, v.im);
  if (m < V_MIN) return cpx(V_MIN, 0);
  return v;
}

function currentFromPQ(p: number, q: number, v: Cpx): Cpx {
  return cConj(cDiv(cpx(p, q), v));
}

function limitedPower(p: number, q: number, v: Cpx, limits?: InjectionLimits): { s: Cpx; limited: boolean } {
  if (!limits) return { s: cpx(p, q), limited: false };
  let pAllowed = p;
  let limited = false;
  if (pAllowed > 0 && !limits.allowDischarge) {
    pAllowed = 0;
    limited = true;
  } else if (pAllowed < 0 && !limits.allowCharge) {
    pAllowed = 0;
    limited = true;
  }
  if (pAllowed > (limits.pDischargeMaxPu ?? Number.POSITIVE_INFINITY)) {
    pAllowed = limits.pDischargeMaxPu ?? pAllowed;
    limited = true;
  }
  if (pAllowed < -(limits.pChargeMaxPu ?? Number.POSITIVE_INFINITY)) {
    pAllowed = -(limits.pChargeMaxPu ?? -pAllowed);
    limited = true;
  }
  const electrical = applyElectricalLimits(
    pAllowed,
    q,
    Math.hypot(v.re, v.im),
    limits.electrical,
    limits.preferP,
  );
  return { s: cpx(electrical.pPu, electrical.qPu), limited: limited || electrical.limited };
}

function limitedVoltageSourceCurrent(source: VoltageSource, v: Cpx): { i: Cpx; s: Cpx; limited: boolean } {
  const rawCurrent = cDiv(cSub(source.e, v), source.z);
  const rawPower = cMul(v, cConj(rawCurrent));
  const outcome = limitedPower(rawPower.re, rawPower.im, v, source.limits);
  return { i: currentFromPQ(outcome.s.re, outcome.s.im, v), s: outcome.s, limited: outcome.limited };
}

export function solveNetwork(inp: NetworkInputs): NetworkSolution {
  let v = cpx(1, 0);

  const currentSources = (vv: Cpx): Cpx => {
    let i = currentFromPQ(inp.loadPPu, inp.loadQPu, vv);
    if (inp.gfl.enabled) {
      const gflPower = limitedPower(inp.gfl.pPu, inp.gfl.qPu, vv, inp.gfl.limits).s;
      i = cSub(i, currentFromPQ(gflPower.re, gflPower.im, vv));
    }
    return i;
  };

  const branchCurrents = (vv: Cpx): Cpx => {
    let i = cpx(0, 0);
    if (inp.machine.enabled) i = cAdd(i, cDiv(cSub(inp.machine.e, vv), inp.machine.z));
    if (inp.gfm.enabled) i = cAdd(i, limitedVoltageSourceCurrent(inp.gfm, vv).i);
    return i;
  };

  let converged = false;
  let iter = 0;
  for (; iter < MAX_ITER; iter++) {
    const gv = guardV(v);
    const iNet = cSub(currentSources(gv), branchCurrents(gv));
    const vNext = cSub(inp.eTh, cMul(inp.zTh, iNet));
    const dv = cSub(vNext, v);
    v = cAdd(v, cScale(dv, DAMP));
    if (Math.hypot(dv.re, dv.im) * DAMP < TOL) {
      converged = true;
      break;
    }
  }

  const gv = guardV(v);
  const iTh = cDiv(cSub(inp.eTh, v), inp.zTh);
  const sTh = cMul(v, cConj(iTh));

  let sMachine = cpx(0, 0);
  let machineLimited = false;
  if (inp.machine.enabled) {
    const machine = limitedVoltageSourceCurrent(inp.machine, gv);
    sMachine = machine.s;
    machineLimited = machine.limited;
  }

  let sGfm = cpx(0, 0);
  let gfmLimited = false;
  if (inp.gfm.enabled) {
    const gfm = limitedVoltageSourceCurrent(inp.gfm, gv);
    sGfm = gfm.s;
    gfmLimited = gfm.limited;
  }

  let sGfl = cpx(0, 0);
  let gflLimited = false;
  if (inp.gfl.enabled) {
    const gfl = limitedPower(inp.gfl.pPu, inp.gfl.qPu, gv, inp.gfl.limits);
    sGfl = gfl.s;
    gflLimited = gfl.limited;
  }

  return {
    v,
    vMagPu: Math.hypot(v.re, v.im),
    vAngRad: Math.atan2(v.im, v.re),
    converged,
    iterations: iter + 1,
    iTh,
    sTh,
    sMachine,
    sGfm,
    sGfl,
    gfmLimited,
    gflLimited,
    machineLimited,
  };
}

export function theveninFromScl(sclMva: number, vKv: number, sBaseMva: number): { zOhm: number; zPu: number; iCcA: number; scr: number } {
  const iCcA = (sclMva * 1e6) / (Math.sqrt(3) * vKv * 1e3);
  const zOhm = (vKv * vKv) / sclMva;
  const zBase = (vKv * vKv) / sBaseMva;
  const zPu = zOhm / zBase;
  return { zOhm, zPu, iCcA, scr: 1 / zPu };
}

export { cFromPolar };
