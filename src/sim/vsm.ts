import type { VsmParams } from "./types.js";
import { OMEGA0 } from "./units.js";

export interface VsmState {
  pFilteredPu: number;
  qFilteredPu: number;
  omegaPu: number;
  deltaRad: number;
  eVsmPu: number;
  eCmdPu?: number;
}

export function initialVsmState(p: VsmParams): VsmState {
  return {
    pFilteredPu: p.pRefPu,
    qFilteredPu: p.qRefPu,
    omegaPu: 1,
    deltaRad: 0,
    eVsmPu: p.e0Pu,
  };
}

export interface VsmInputs {
  pElecPu: number;
  qElecPu: number;
  vMagPu: number;
  vRefPu: number;
  fBusHz: number;
  f0Hz: number;
}

export function stepVsm(
  s: VsmState,
  inp: VsmInputs,
  p: VsmParams,
  dt: number,
): VsmState {
  const responseTau = p.tauPPuS + p.responseDelayS;
  const pFilteredPu = s.pFilteredPu + ((inp.pElecPu - s.pFilteredPu) / responseTau) * dt;
  const qFilteredPu = s.qFilteredPu + ((inp.qElecPu - s.qFilteredPu) / responseTau) * dt;

  const omegaBusPu = inp.fBusHz / inp.f0Hz;
  const dampingPu =
    p.dvPu * (s.omegaPu - 1) + p.dDampPu * (s.omegaPu - omegaBusPu);
  const dOmega = (p.pRefPu - pFilteredPu - dampingPu) / (2 * p.hvS);
  const omegaPu = s.omegaPu + dOmega * dt;

  const dDelta = OMEGA0 * (omegaPu - 1) - 2 * Math.PI * (inp.fBusHz - inp.f0Hz);
  const deltaRad = s.deltaRad + dDelta * dt;

  const eCmdRaw = p.e0Pu + p.kvPu * (inp.vRefPu - inp.vMagPu) + p.kqPu * (p.qRefPu - qFilteredPu);
  const eCmd = Math.min(p.eMaxPu, Math.max(p.eMinPu, eCmdRaw));
  const eVsmPu = s.eVsmPu + ((eCmd - s.eVsmPu) / p.tauEs) * dt;

  return { pFilteredPu, qFilteredPu, omegaPu, deltaRad, eVsmPu, eCmdPu: eCmd };
}
