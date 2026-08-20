import type { BessParams, LimitParams } from "./types.js";

export interface LimitOutcome {
  pPu: number;
  qPu: number;
  limited: boolean;
  reason: "none" | "apparent-power" | "current" | "soc-empty" | "soc-full";
}

export function applyElectricalLimits(
  pCmdPu: number,
  qCmdPu: number,
  vMagPu: number,
  limits: LimitParams,
  preferP: boolean,
): LimitOutcome {
  let p = pCmdPu;
  let q = qCmdPu;
  let limited = false;
  let reason: LimitOutcome["reason"] = "none";

  const sMax = limits.sMaxPu;
  if (p * p + q * q > sMax * sMax) {
    limited = true;
    reason = "apparent-power";
    if (preferP) {
      p = Math.sign(p) * Math.min(Math.abs(p), sMax);
      const qRoom = Math.sqrt(Math.max(0, sMax * sMax - p * p));
      q = Math.sign(q) * Math.min(Math.abs(q), qRoom);
    } else {
      q = Math.sign(q) * Math.min(Math.abs(q), sMax);
      const pRoom = Math.sqrt(Math.max(0, sMax * sMax - q * q));
      p = Math.sign(p) * Math.min(Math.abs(p), pRoom);
    }
  }

  const vSafe = Math.max(vMagPu, 0.05);
  const sMag = Math.hypot(p, q);
  const iPu = sMag / vSafe;
  if (iPu > limits.iMaxPu) {
    limited = true;
    if (reason === "none") reason = "current";
    const scale = (limits.iMaxPu * vSafe) / sMag;
    p *= scale;
    q *= scale;
  }

  return { pPu: p, qPu: q, limited, reason };
}

export function applyLimits(
  pCmdPu: number,
  qCmdPu: number,
  vMagPu: number,
  limits: LimitParams,
  bess: BessParams,
  energyMWh: number,
  preferP: boolean,
): LimitOutcome {
  let p = pCmdPu;
  let q = qCmdPu;
  let limited = false;
  let reason: LimitOutcome["reason"] = "none";

  if (p > 0 && energyMWh <= bess.socMinMWh) {
    p = 0;
    limited = true;
    reason = "soc-empty";
  } else if (p < 0 && energyMWh >= bess.eCapMWh) {
    p = 0;
    limited = true;
    reason = "soc-full";
  }

  const electrical = applyElectricalLimits(p, q, vMagPu, limits, preferP);
  p = electrical.pPu;
  q = electrical.qPu;
  if (electrical.limited) {
    limited = true;
    if (reason === "none") reason = electrical.reason;
  }

  return { pPu: p, qPu: q, limited, reason };
}

export function bessDcPowerMw(pAcMw: number, etaDischarge: number): number {
  if (pAcMw >= 0) return pAcMw / etaDischarge;
  return pAcMw * etaDischarge;
}

export function stepBessEnergy(energyMWh: number, pDcMw: number, dtS: number): number {
  return energyMWh - (pDcMw * dtS) / 3600;
}

export function bessStepPowerBoundsPu(
  bess: BessParams,
  energyMWh: number,
  dtS: number,
  sBaseMva: number,
): { dischargePu: number; chargePu: number } {
  const dt = Math.max(dtS, 1e-9);
  const dischargeMw = Math.max(0, energyMWh - bess.socMinMWh) * 3600 * bess.etaDischarge / dt;
  const chargeMw = Math.max(0, bess.eCapMWh - energyMWh) * 3600 / (bess.etaDischarge * dt);
  return { dischargePu: dischargeMw / sBaseMva, chargePu: chargeMw / sBaseMva };
}

export function clampBessEnergy(bess: BessParams, energyMWh: number): number {
  return Math.min(bess.eCapMWh, Math.max(bess.socMinMWh, energyMWh));
}
