import { cAdd, cDiv, cFromPolar, cMul, cSub, cpx } from "./cpx.js";
import { initialPllState } from "./pll.js";
import { initialVsmState } from "./vsm.js";
import { solveNetwork } from "./network.js";
import { stepSimulation } from "./step.js";
import type { SimParams, SimSnapshot, SimState } from "./types.js";
import { kineticEnergyMWs } from "./swing.js";
import { puToAmps, puToKv, puToMvar, puToMw } from "./units.js";

export function createInitialState(params: SimParams): SimState {
  const iLoad = cpx(params.loadPPu, -params.loadQPu);
  const active = params.resources.length > 0 ? params.resources : [params.resource];
  const thermalP0Pu = active.includes("thermal") ? params.governor.p0Pu : 0;
  const delta0 = Math.asin(Math.max(-0.98, Math.min(0.98,
    (thermalP0Pu * params.avr.xdPrimePu) / Math.max(params.avr.e0Pu, 1e-6),
  )));
  const eMachine0 = cFromPolar(params.avr.e0Pu, delta0);
  const iMachine0 = active.includes("thermal")
    ? cDiv(cSub(eMachine0, cpx(1, 0)), cpx(0, params.avr.xdPrimePu))
    : cpx(0, 0);
  // KCL inicial: la red Thevenin alimenta la carga menos la generación
  // síncrona ya conectada. Así f=50 Hz y V=1 pu también con térmica activa.
  const eTh = cAdd(cpx(1, 0), cMul(params.zThPu, cSub(iLoad, iMachine0)));
  params.eThPu = eTh;

  const eKin0 = kineticEnergyMWs(params.ePhysMWs, params.f0Hz, params.f0Hz);
  const pll = initialPllState(params.f0Hz);
  const vsm = initialVsmState(params.vsm);

  const state: SimState = {
    t: 0,
    fBusHz: params.f0Hz,
    rocofPhysicalHzS: 0,
    rocofHzS: 0,
    thetaAreaRad: 0,
    eKinMWs: eKin0,
    // pFleet es el resto de la flota: resto + Pthermal0 = carga antes del evento.
    pFleetPu: params.loadPPu - thermalP0Pu,
    pTripPu: 0,
    tripped: false,
    voltageEventApplied: false,
    loadPPu: params.loadPPu,
    loadQPu: params.loadQPu,
    machine: {
      pGovPu: thermalP0Pu,
      pValvePu: thermalP0Pu,
      pMechPu: thermalP0Pu,
      fGovernorHz: params.f0Hz,
      ePrimePu: params.avr.e0Pu,
      deltaRad: delta0,
      pElecPu: thermalP0Pu,
      qElecPu: 0,
    },
    gfl: {
      thetaPllRad: pll.thetaPllRad,
      omegaPllRadS: pll.omegaPllRadS,
      xiPll: pll.xiPll,
      fMeasHz: params.f0Hz,
      rocofMeasHzS: 0,
      pCmdPu: 0,
      qCmdPu: 0,
      pPu: 0,
      qPu: 0,
      limited: false,
    },
    gfm: {
      pFilteredPu: params.vsm.pRefPu,
      qFilteredPu: params.vsm.qRefPu,
      omegaPu: 1,
      deltaRad: vsm.deltaRad,
      eCmdPu: params.vsm.e0Pu,
      eVsmPu: params.vsm.e0Pu,
      pPu: 0,
      qPu: 0,
      limited: false,
    },
    bess: {
      energyMWh: params.bess.soc0MWh,
      socPct: (100 * params.bess.soc0MWh) / params.bess.eCapMWh,
      pDcMw: 0,
    },
    bessGfm: {
      energyMWh: params.bess.soc0MWh,
      socPct: (100 * params.bess.soc0MWh) / params.bess.eCapMWh,
      pDcMw: 0,
    },
    solver: {
      v: cpx(1, 0),
      vMagPu: 1,
      vAngRad: 0,
      converged: true,
      heldLastValid: false,
      iterations: 0,
      iThPu: cpx(0, 0),
      pThPu: 0,
      qThPu: 0,
    },
    pImbalancePu: 0,
  };

  // t=0 es un punto eléctrico resuelto. Así la primera muestra incluye los
  // flujos P/Q reales del equivalente y no un marcador artificial en cero.
  const machineRatingPu = params.machine.ratingMva / params.sBaseMva;
  const initialNet = solveNetwork({
    eTh: params.eThPu,
    zTh: params.zThPu,
    machine: {
      enabled: active.includes("thermal"),
      e: eMachine0,
      z: cpx(0, params.avr.xdPrimePu),
      limits: {
        electrical: { sMaxPu: machineRatingPu, iMaxPu: machineRatingPu },
        preferP: true,
        allowDischarge: true,
        allowCharge: true,
      },
    },
    gfm: { enabled: false, e: cpx(1, 0), z: cpx(0, params.vsm.xGfmPu) },
    gfl: { enabled: false, pPu: 0, qPu: 0 },
    loadPPu: params.loadPPu,
    loadQPu: params.loadQPu,
  });
  if (initialNet.converged) {
    state.solver = {
      v: initialNet.v,
      vMagPu: initialNet.vMagPu,
      vAngRad: initialNet.vAngRad,
      converged: true,
      heldLastValid: false,
      iterations: initialNet.iterations,
      iThPu: initialNet.iTh,
      pThPu: initialNet.sTh.re,
      qThPu: initialNet.sTh.im,
    };
    state.machine.pElecPu = initialNet.sMachine.re;
    state.machine.qElecPu = initialNet.sMachine.im;
  }
  return state;
}

export interface Simulation {
  params: SimParams;
  state: SimState;
  step(): void;
  snapshot(): SimSnapshot;
}

export function createSimulation(params: SimParams): Simulation {
  const state = createInitialState(params);
  const sim: Simulation = {
    params,
    state,
    step: () => stepSimulation(params, state),
    snapshot: () => makeSnapshot(params, state),
  };
  return sim;
}

export function makeSnapshot(params: SimParams, s: SimState): SimSnapshot {
  const eKin0 = kineticEnergyMWs(params.ePhysMWs, params.f0Hz, params.f0Hz);
  return {
    t: s.t,
    fHz: s.fBusHz,
    rocofPhysicalHzS: s.rocofPhysicalHzS,
    rocofHzS: s.rocofHzS,
    vPu: s.solver.vMagPu,
    vAngRad: s.solver.vAngRad,
    vKv: puToKv(s.solver.vMagPu),
    eKinMWs: s.eKinMWs,
    eKinPct: (100 * s.eKinMWs) / eKin0,
    pFleetMw: puToMw(s.pFleetPu),
    pMechMw: puToMw(s.machine.pMechPu),
    pThermalElectricalMw: puToMw(s.machine.pElecPu),
    qThermalMvar: puToMvar(s.machine.qElecPu),
    pGflMw: puToMw(s.gfl.pPu),
    qGflMvar: puToMvar(s.gfl.qPu),
    pGfmMw: puToMw(s.gfm.pPu),
    qGfmMvar: puToMvar(s.gfm.qPu),
    pLoadMw: puToMw(s.loadPPu),
    qLoadMvar: puToMvar(s.loadQPu),
    pThGridMw: puToMw(s.solver.pThPu),
    socMWh: s.bess.energyMWh,
    socPct: s.bess.socPct,
    pDcMw: s.bess.pDcMw,
    socGfmMWh: s.bessGfm.energyMWh,
    socGfmPct: s.bessGfm.socPct,
    machineDeltaRad: s.machine.deltaRad,
    gflThetaPllRad: s.gfl.thetaPllRad,
    gfmDeltaRad: s.gfm.deltaRad,
    gfmOmegaPu: s.gfm.omegaPu,
    gflLimited: s.gfl.limited,
    gfmLimited: s.gfm.limited,
    tripped: s.tripped,
    voltageEventApplied: s.voltageEventApplied,
    converged: s.solver.converged,
    solverHeldLastValid: s.solver.heldLastValid,
    solverIterations: s.solver.iterations,
    resource: params.resource,
    scenarioId: params.scenarioId,
  };
}

export interface RunResult {
  samples: SimSnapshot[];
  final: SimState;
  steps: number;
}

export function runSimulation(
  params: SimParams,
  sampleEveryS = 1 / 60,
  eventsEnabled = true,
): RunResult {
  const p: SimParams = eventsEnabled
    ? params
    : { ...params, events: { ...params.events, tTripS: Number.POSITIVE_INFINITY, tVoltageS: Number.POSITIVE_INFINITY } };
  const sim = createSimulation(p);
  const samples: SimSnapshot[] = [];
  const sampleSteps = Math.max(1, Math.round(sampleEveryS / params.dtS));
  let steps = 0;
  const totalSteps = Math.round(params.tEndS / params.dtS);
  samples.push(sim.snapshot());
  while (steps < totalSteps) {
    sim.step();
    steps++;
    if (steps % sampleSteps === 0) samples.push(sim.snapshot());
  }
  samples.push(sim.snapshot());
  return { samples, final: sim.state, steps };
}

export { puToAmps };
