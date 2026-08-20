import type { SimSnapshot } from "./types.js";

export interface RunMetrics {
  rocof0HzS: number;
  nadirHz: number;
  tNadirS: number;
  vMinPu: number;
  tVMinS: number;
  pSupportMaxMw: number;
  qSupportMaxMvar: number;
  anyNonConverged: boolean;
}

export function computeMetrics(samples: SimSnapshot[], tEventS: number): RunMetrics {
  let rocof0HzS = 0;
  let foundRocof = false;
  let nadirHz = Number.POSITIVE_INFINITY;
  let tNadirS = 0;
  let vMinPu = Number.POSITIVE_INFINITY;
  let tVMinS = 0;
  let pSupportMaxMw = 0;
  let qSupportMaxMvar = 0;
  let anyNonConverged = false;

  for (const s of samples) {
    if (!s.converged) anyNonConverged = true;
    if (!foundRocof && s.t > tEventS + 1e-3) {
      rocof0HzS = s.rocofPhysicalHzS;
      foundRocof = true;
    }
    if (s.fHz < nadirHz) {
      nadirHz = s.fHz;
      tNadirS = s.t;
    }
    if (s.vPu < vMinPu) {
      vMinPu = s.vPu;
      tVMinS = s.t;
    }
    if (s.t >= tEventS) {
      const pMw = Math.max(s.pGflMw, s.pGfmMw, s.pMechMw);
      if (pMw > pSupportMaxMw) pSupportMaxMw = pMw;
      const qMvar = Math.max(s.qGflMvar, s.qGfmMvar);
      if (qMvar > qSupportMaxMvar) qSupportMaxMvar = qMvar;
    }
  }

  return {
    rocof0HzS,
    nadirHz,
    tNadirS,
    vMinPu,
    tVMinS,
    pSupportMaxMw,
    qSupportMaxMvar,
    anyNonConverged,
  };
}
