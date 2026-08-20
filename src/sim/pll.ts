import { cArg, cFromPolar, cMul, type Cpx } from "./cpx.js";
import { OMEGA0 } from "./units.js";
import type { GflProfileParams, PllParams } from "./types.js";

export interface PllState {
  thetaPllRad: number;
  omegaPllRadS: number;
  xiPll: number;
  fMeasHz: number;
  rocofMeasHzS: number;
  prevFMeasHz: number;
}

export function initialPllState(f0Hz: number): PllState {
  return {
    thetaPllRad: 0,
    omegaPllRadS: 2 * Math.PI * f0Hz,
    xiPll: 0,
    fMeasHz: f0Hz,
    rocofMeasHzS: 0,
    prevFMeasHz: f0Hz,
  };
}

export function stepPll(
  s: PllState,
  vSyncFrame: Cpx,
  p: PllParams,
  dt: number,
): PllState {
  const vMag = Math.hypot(vSyncFrame.re, vSyncFrame.im);
  const vDq = cMul(vSyncFrame, cFromPolar(1, -s.thetaPllRad));
  const eq = vMag > 1e-9 ? vDq.im / vMag : 0;
  const xiPll = s.xiPll + p.ki * eq * dt;
  const omegaPllRadS = OMEGA0 + p.kp * eq + xiPll;
  const thetaPllRad = s.thetaPllRad + (omegaPllRadS - OMEGA0) * dt;
  return {
    thetaPllRad,
    omegaPllRadS,
    xiPll,
    fMeasHz: s.fMeasHz,
    rocofMeasHzS: s.rocofMeasHzS,
    prevFMeasHz: s.prevFMeasHz,
  };
}

export function stepGflMeasurement(
  s: PllState,
  g: GflProfileParams,
  f0Hz: number,
  dt: number,
): PllState {
  const fInstHz = s.omegaPllRadS / (2 * Math.PI);
  const fMeasHz = s.fMeasHz + ((fInstHz - s.fMeasHz) / g.tauMeasS) * dt;
  const rocofInstHzS = (fMeasHz - s.prevFMeasHz) / dt;
  const rocofMeasHzS = s.rocofMeasHzS + ((rocofInstHzS - s.rocofMeasHzS) / g.tauRocofS) * dt;
  void f0Hz;
  return { ...s, fMeasHz, rocofMeasHzS, prevFMeasHz: fMeasHz };
}

export function gflPowerCommand(
  profile: "pq" | "rpf" | "ffr",
  s: PllState,
  g: GflProfileParams,
  f0Hz: number,
): { pCmdPu: number; qCmdPu: number } {
  const sat = (x: number): number => Math.min(g.reserveUpPu, Math.max(-g.reserveDownPu, x));
  let pExtra = 0;
  if (profile === "rpf") {
    pExtra = sat(-(s.fMeasHz - f0Hz) / g.droopRf);
  } else if (profile === "ffr") {
    pExtra = sat(g.kfPuPerHz * (f0Hz - s.fMeasHz) + g.kRocofPuPerHzS * -s.rocofMeasHzS);
  }
  return { pCmdPu: g.pSetPu + pExtra, qCmdPu: g.qSetPu };
}

export { cArg };
