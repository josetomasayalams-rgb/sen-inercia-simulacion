import type { AvrParams, GovernorParams } from "./types.js";

export interface AreaSwingState {
  fHz: number;
  thetaAreaRad: number;
  eKinMWs: number;
}

export function areaFrequencyDerivativeHzS(
  imbalancePu: number,
  f0Hz: number,
  ePhysMWs: number,
  sBaseMva: number,
): number {
  const ePhysPuS = ePhysMWs / sBaseMva;
  return (f0Hz * imbalancePu) / (2 * ePhysPuS);
}

export function kineticEnergyMWs(ePhysMWs: number, fHz: number, f0Hz: number): number {
  return ePhysMWs * (fHz / f0Hz) * (fHz / f0Hz);
}

export interface GovernorState {
  pGovStarPu: number;
  pValvePu: number;
  pMechPu: number;
}

export function stepGovernor(
  g: GovernorState,
  fHz: number,
  f0Hz: number,
  p: GovernorParams,
  dt: number,
): GovernorState {
  const dfPu = (fHz - f0Hz) / f0Hz;
  // El droop actúa alrededor del despacho sincronizado P0. Sin este sesgo,
  // una unidad en reserva rodante se vaciaría antes de cualquier evento.
  const raw = p.p0Pu - dfPu / p.droopR;
  const pGovStarPu = Math.min(p.pMaxPu, Math.max(p.pMinPu, raw));
  const pValvePu = g.pValvePu + ((pGovStarPu - g.pValvePu) / p.tauGovS) * dt;
  const pMechPu = g.pMechPu + ((pValvePu - g.pMechPu) / p.tauTurbS) * dt;
  return { pGovStarPu, pValvePu, pMechPu };
}

export interface AvrState {
  ePrimePu: number;
}

export function stepAvr(
  a: AvrState,
  vMagPu: number,
  vRefPu: number,
  p: AvrParams,
  dt: number,
): AvrState {
  const eCmdRaw = p.e0Pu + p.gainKa * (vRefPu - vMagPu);
  const eCmd = Math.min(p.eMaxPu, Math.max(p.eMinPu, eCmdRaw));
  const ePrimePu = a.ePrimePu + ((eCmd - a.ePrimePu) / p.tauAs) * dt;
  return { ePrimePu };
}
