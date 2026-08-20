import { cFromPolar, cMul, cpx } from "./cpx.js";
import { applyLimits, bessDcPowerMw, bessStepPowerBoundsPu, clampBessEnergy, stepBessEnergy } from "./limits.js";
import { solveNetwork } from "./network.js";
import { gflPowerCommand, stepGflMeasurement, stepPll } from "./pll.js";
import { areaFrequencyDerivativeHzS, kineticEnergyMWs, stepAvr, stepGovernor } from "./swing.js";
import type { SimParams, SimState } from "./types.js";
import { stepVsm } from "./vsm.js";
import { puToMw } from "./units.js";

export function stepSimulation(params: SimParams, s: SimState): void {
  const dt = params.dtS;
  const active = params.resources.length > 0 ? params.resources : [params.resource];
  const isThermal = active.includes("thermal");
  const isGfl = active.some((r) => r.startsWith("gfl"));
  const isGfm = active.includes("gfm-vsm");
  const gflProfile = active.find((r) => r.startsWith("gfl")) ?? params.resource;
  const singleBess = !isGfl || !isGfm;
  const gflEnergyBounds = bessStepPowerBoundsPu(params.bess, s.bess.energyMWh, dt, params.sBaseMva);
  const gfmEnergyBounds = bessStepPowerBoundsPu(params.bess, s.bessGfm.energyMWh, dt, params.sBaseMva);
  const machineRatingPu = params.machine.ratingMva / params.sBaseMva;

  if (!s.tripped && s.t >= params.events.tTripS - 1e-9) {
    s.tripped = true;
    s.pTripPu = params.events.dTripPu;
    s.pFleetPu -= params.events.dTripPu;
  }
  if (!s.voltageEventApplied && s.t >= params.events.tVoltageS - 1e-9) {
    s.voltageEventApplied = true;
    s.loadQPu += params.events.dQLoadPu;
  }

  const vPrev = s.solver.v;
  const vMagPrev = s.solver.vMagPu;
  const previousSolver = s.solver;

  if (isThermal) {
    const gov = stepGovernor(
      { pGovStarPu: s.machine.pGovPu, pValvePu: s.machine.pValvePu, pMechPu: s.machine.pMechPu },
      s.fBusHz,
      params.f0Hz,
      params.governor,
      dt,
    );
    s.machine.pGovPu = gov.pGovStarPu;
    s.machine.pValvePu = gov.pValvePu;
    s.machine.pMechPu = gov.pMechPu;

    const avr = stepAvr({ ePrimePu: s.machine.ePrimePu }, vMagPrev, 1.0, params.avr, dt);
    s.machine.ePrimePu = avr.ePrimePu;

    // Modelo fasorial reducido: Pm fija el ángulo eléctrico requerido y el
    // rotor lo sigue con una constante corta. La inercia física permanece
    // exclusivamente en E_phys del balance de área.
    const transfer = (s.machine.pMechPu * params.avr.xdPrimePu) /
      Math.max(s.machine.ePrimePu * vMagPrev, 1e-6);
    const relativeTarget = Math.asin(Math.max(-0.98, Math.min(0.98, transfer)));
    const target = s.solver.vAngRad + relativeTarget;
    const angleError = Math.atan2(Math.sin(target - s.machine.deltaRad), Math.cos(target - s.machine.deltaRad));
    const deltaStep = (angleError / params.machine.syncTauS) * dt;
    s.machine.deltaRad = Math.max(
      -params.machine.deltaMaxRad,
      Math.min(params.machine.deltaMaxRad, s.machine.deltaRad + deltaStep),
    );
  }

  if (isGfl) {
    const vSync = cMul(vPrev, cFromPolar(1, s.thetaAreaRad));
    const pll = stepPll(
      {
        thetaPllRad: s.gfl.thetaPllRad,
        omegaPllRadS: s.gfl.omegaPllRadS,
        xiPll: s.gfl.xiPll,
        fMeasHz: s.gfl.fMeasHz,
        rocofMeasHzS: s.gfl.rocofMeasHzS,
        prevFMeasHz: s.gfl.fMeasHz,
      },
      vSync,
      params.pll,
      dt,
    );
    const withMeas = stepGflMeasurement(pll, params.gfl, params.f0Hz, dt);
    s.gfl.thetaPllRad = withMeas.thetaPllRad;
    s.gfl.omegaPllRadS = withMeas.omegaPllRadS;
    s.gfl.xiPll = withMeas.xiPll;
    s.gfl.fMeasHz = withMeas.fMeasHz;
    s.gfl.rocofMeasHzS = withMeas.rocofMeasHzS;

    const profile = gflProfile === "gfl-rpf" ? "rpf" : gflProfile === "gfl-ffr" ? "ffr" : "pq";
    const cmd = gflPowerCommand(profile, withMeas, params.gfl, params.f0Hz);
    const limited = applyLimits(
      cmd.pCmdPu,
      cmd.qCmdPu,
      vMagPrev,
      params.limits,
      params.bess,
      s.bess.energyMWh,
      s.fBusHz < params.f0Hz,
    );
    s.gfl.pCmdPu = limited.pPu;
    s.gfl.qCmdPu = limited.qPu;
    s.gfl.limited = limited.limited;
  }

  if (isGfm) {
    const vsm = stepVsm(
      {
        pFilteredPu: s.gfm.pFilteredPu,
        qFilteredPu: s.gfm.qFilteredPu,
        omegaPu: s.gfm.omegaPu,
        deltaRad: s.gfm.deltaRad,
        eVsmPu: s.gfm.eVsmPu,
      },
      {
        pElecPu: s.gfm.pPu,
        qElecPu: s.gfm.qPu,
        vMagPu: vMagPrev,
        vRefPu: 1.0,
        fBusHz: s.fBusHz,
        f0Hz: params.f0Hz,
      },
      params.vsm,
      dt,
    );
    s.gfm.pFilteredPu = vsm.pFilteredPu;
    s.gfm.qFilteredPu = vsm.qFilteredPu;
    s.gfm.omegaPu = vsm.omegaPu;
    s.gfm.deltaRad = vsm.deltaRad;
    s.gfm.eVsmPu = vsm.eVsmPu;
    s.gfm.eCmdPu = vsm.eCmdPu ?? vsm.eVsmPu;
  }

  const net = solveNetwork({
    eTh: params.eThPu,
    zTh: params.zThPu,
    machine: {
      enabled: isThermal,
      e: cFromPolar(s.machine.ePrimePu, s.machine.deltaRad),
      z: cpx(0, params.avr.xdPrimePu),
      limits: {
        electrical: { sMaxPu: machineRatingPu, iMaxPu: machineRatingPu },
        preferP: s.fBusHz < params.f0Hz,
        allowDischarge: true,
        allowCharge: true,
      },
    },
    gfm: {
      enabled: isGfm,
      // deltaRad es el ángulo virtual relativo a la barra. La fuente detrás
      // de impedancia necesita el ángulo absoluto en la referencia fasorial.
      e: cFromPolar(s.gfm.eVsmPu, s.solver.vAngRad + s.gfm.deltaRad),
      z: cpx(0, params.vsm.xGfmPu),
      limits: {
        electrical: params.limits,
        preferP: s.fBusHz < params.f0Hz,
        allowDischarge: s.bessGfm.energyMWh > params.bess.socMinMWh,
        allowCharge: s.bessGfm.energyMWh < params.bess.eCapMWh,
        pDischargeMaxPu: gfmEnergyBounds.dischargePu,
        pChargeMaxPu: gfmEnergyBounds.chargePu,
      },
    },
    gfl: {
      enabled: isGfl,
      pPu: s.gfl.pCmdPu,
      qPu: s.gfl.qCmdPu,
      limits: {
        electrical: params.limits,
        preferP: s.fBusHz < params.f0Hz,
        allowDischarge: s.bess.energyMWh > params.bess.socMinMWh,
        allowCharge: s.bess.energyMWh < params.bess.eCapMWh,
        pDischargeMaxPu: gflEnergyBounds.dischargePu,
        pChargeMaxPu: gflEnergyBounds.chargePu,
      },
    },
    loadPPu: s.loadPPu,
    loadQPu: s.loadQPu,
  });

  s.solver = net.converged
    ? {
        v: net.v,
        vMagPu: net.vMagPu,
        vAngRad: net.vAngRad,
        converged: true,
        heldLastValid: false,
        iterations: net.iterations,
        iThPu: net.iTh,
        pThPu: net.sTh.re,
        qThPu: net.sTh.im,
      }
    : { ...previousSolver, converged: false, heldLastValid: true, iterations: net.iterations };

  if (isThermal && net.converged) {
    s.machine.pElecPu = net.sMachine.re;
    s.machine.qElecPu = net.sMachine.im;
  }
  if (isGfm && net.converged) {
    s.gfm.pPu = net.sGfm.re;
    s.gfm.qPu = net.sGfm.im;
    s.gfm.limited = net.gfmLimited;
  }
  if (isGfl && net.converged) {
    s.gfl.pPu = net.sGfl.re;
    s.gfl.qPu = net.sGfl.im;
    s.gfl.limited = s.gfl.limited || net.gflLimited;
  }

  // Balance del área: suma los aportes de todos los recursos activos.
  const pSupportPu =
    (isThermal ? s.machine.pElecPu : 0) +
    (isGfl ? s.gfl.pPu : 0) +
    (isGfm ? s.gfm.pPu : 0);
  const imbalancePu =
    s.pFleetPu + pSupportPu - s.loadPPu - params.dFPuPerPu * ((s.fBusHz - params.f0Hz) / params.f0Hz);
  s.pImbalancePu = imbalancePu;

  const dfdt = areaFrequencyDerivativeHzS(imbalancePu, params.f0Hz, params.ePhysMWs, params.sBaseMva);
  s.rocofHzS = dfdt;
  s.fBusHz += dfdt * dt;
  s.thetaAreaRad += 2 * Math.PI * (s.fBusHz - params.f0Hz) * dt;
  s.eKinMWs = kineticEnergyMWs(params.ePhysMWs, s.fBusHz, params.f0Hz);

  // Energía del BESS GFL (s.bess) y del BESS GFM (s.bessGfm) por separado.
  if (isGfl) {
    const pAcMw = puToMw(s.gfl.pPu);
    const pDcMw = bessDcPowerMw(pAcMw, params.bess.etaDischarge);
    s.bess.pDcMw = pDcMw;
    s.bess.energyMWh = clampBessEnergy(params.bess, stepBessEnergy(s.bess.energyMWh, pDcMw, dt));
    s.bess.socPct = (100 * s.bess.energyMWh) / params.bess.eCapMWh;
  }
  if (isGfm) {
    const pAcMw = puToMw(s.gfm.pPu);
    const pDcMw = bessDcPowerMw(pAcMw, params.bess.etaDischarge);
    s.bessGfm.pDcMw = pDcMw;
    s.bessGfm.energyMWh = clampBessEnergy(params.bess, stepBessEnergy(s.bessGfm.energyMWh, pDcMw, dt));
    s.bessGfm.socPct = (100 * s.bessGfm.energyMWh) / params.bess.eCapMWh;
  }
  if (singleBess && isGfm && !isGfl) {
    // compat: corridas de un solo recurso GFM siguen usando s.bess
    s.bess.pDcMw = s.bessGfm.pDcMw;
    s.bess.energyMWh = s.bessGfm.energyMWh;
    s.bess.socPct = s.bessGfm.socPct;
  }
  if (singleBess && isGfl && !isGfm) {
    s.bessGfm.energyMWh = s.bess.energyMWh;
    s.bessGfm.socPct = s.bess.socPct;
  }

  s.t += dt;
}
