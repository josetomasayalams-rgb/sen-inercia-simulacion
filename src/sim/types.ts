import type { Cpx } from "./cpx.js";

export type ResourceKind = "none" | "thermal" | "gfl-pq" | "gfl-rpf" | "gfl-ffr" | "gfm-vsm";

export interface GovernorParams {
  /** Despacho inicial de la unidad sincronizada; no es soporte adicional. */
  p0Pu: number;
  droopR: number;
  /** Filtro de medición de velocidad/frecuencia del gobernador. */
  tauMeasurementS: number;
  /** Banda muerta simétrica antes de ordenar apertura de válvula. */
  deadbandHz: number;
  tauGovS: number;
  tauTurbS: number;
  pMinPu: number;
  pMaxPu: number;
}

export interface AvrParams {
  e0Pu: number;
  gainKa: number;
  tauAs: number;
  eMinPu: number;
  eMaxPu: number;
  xdPrimePu: number;
}

export interface SynchronousMachineParams {
  /** Constante de inercia ilustrativa de la máquina física. */
  inertiaHs: number;
  /** Potencia nominal usada para E_machine = H·S. */
  ratingMva: number;
  /** Seguimiento cuasiestacionario del ángulo rotor–barra en el modelo fasorial reducido. */
  syncTauS: number;
  /** Límite educativo del ángulo rotor–barra durante la simulación fasorial. */
  deltaMaxRad: number;
}

export interface PllParams {
  kp: number;
  ki: number;
}

export interface GflProfileParams {
  pSetPu: number;
  qSetPu: number;
  /** Banda muerta de frecuencia para la respuesta primaria. */
  deadbandHz: number;
  droopRf: number;
  kfPuPerHz: number;
  kRocofPuPerHzS: number;
  reserveUpPu: number;
  reserveDownPu: number;
  tauMeasS: number;
  tauRocofS: number;
}

export interface VsmParams {
  hvS: number;
  dvPu: number;
  dDampPu: number;
  tauPPuS: number;
  xGfmPu: number;
  kvPu: number;
  kqPu: number;
  tauEs: number;
  e0Pu: number;
  eMinPu: number;
  eMaxPu: number;
  pRefPu: number;
  qRefPu: number;
  /** Retardo ilustrativo del control; el paso numérico no es una latencia física. */
  responseDelayS: number;
}

export interface BessParams {
  eCapMWh: number;
  etaDischarge: number;
  soc0MWh: number;
  socMinMWh: number;
}

export interface LimitParams {
  sMaxPu: number;
  iMaxPu: number;
}

export interface EventParams {
  tTripS: number;
  dTripPu: number;
  tVoltageS: number;
  dQLoadPu: number;
}

export interface SimParams {
  resource: ResourceKind;
  /** Recursos activos simultáneamente en la barra (modo comparación). */
  resources: ResourceKind[];
  scenarioId: string;
  zThPu: Cpx;
  eThPu: Cpx;
  f0Hz: number;
  sBaseMva: number;
  ePhysMWs: number;
  dFPuPerPu: number;
  loadPPu: number;
  loadQPu: number;
  governor: GovernorParams;
  avr: AvrParams;
  machine: SynchronousMachineParams;
  pll: PllParams;
  gfl: GflProfileParams;
  vsm: VsmParams;
  bess: BessParams;
  limits: LimitParams;
  events: EventParams;
  /** Constante de tiempo del estimador de ROCOF mostrado al público. */
  rocofDisplayTauS: number;
  dtS: number;
  tEndS: number;
}

export interface MachineState {
  pGovPu: number;
  pValvePu: number;
  pMechPu: number;
  fGovernorHz: number;
  ePrimePu: number;
  deltaRad: number;
  pElecPu: number;
  qElecPu: number;
}

export interface GflState {
  thetaPllRad: number;
  omegaPllRadS: number;
  xiPll: number;
  fMeasHz: number;
  rocofMeasHzS: number;
  pCmdPu: number;
  qCmdPu: number;
  pPu: number;
  qPu: number;
  limited: boolean;
}

export interface GfmState {
  pFilteredPu: number;
  qFilteredPu: number;
  omegaPu: number;
  deltaRad: number;
  eCmdPu: number;
  eVsmPu: number;
  pPu: number;
  qPu: number;
  limited: boolean;
}

export interface BessState {
  energyMWh: number;
  socPct: number;
  pDcMw: number;
}

export interface SolverResult {
  v: Cpx;
  vMagPu: number;
  vAngRad: number;
  converged: boolean;
  heldLastValid: boolean;
  iterations: number;
  iThPu: Cpx;
  pThPu: number;
  qThPu: number;
}

export interface SimState {
  t: number;
  fBusHz: number;
  /** Derivada física instantánea usada para integrar la frecuencia. */
  rocofPhysicalHzS: number;
  /** ROCOF estimado/filtrado mostrado en HUD y gráficas. */
  rocofHzS: number;
  thetaAreaRad: number;
  eKinMWs: number;
  pFleetPu: number;
  pTripPu: number;
  tripped: boolean;
  voltageEventApplied: boolean;
  loadPPu: number;
  loadQPu: number;
  machine: MachineState;
  gfl: GflState;
  gfm: GfmState;
  bess: BessState;
  bessGfm: BessState;
  solver: SolverResult;
  pImbalancePu: number;
}

export interface SimSnapshot {
  t: number;
  fHz: number;
  rocofPhysicalHzS: number;
  rocofHzS: number;
  vPu: number;
  vAngRad: number;
  vKv: number;
  eKinMWs: number;
  eKinPct: number;
  pFleetMw: number;
  pMechMw: number;
  pThermalElectricalMw: number;
  qThermalMvar: number;
  pGflMw: number;
  qGflMvar: number;
  pGfmMw: number;
  qGfmMvar: number;
  pLoadMw: number;
  qLoadMvar: number;
  pThGridMw: number;
  socMWh: number;
  socPct: number;
  pDcMw: number;
  socGfmMWh: number;
  socGfmPct: number;
  machineDeltaRad: number;
  gflThetaPllRad: number;
  gfmDeltaRad: number;
  gfmOmegaPu: number;
  gflLimited: boolean;
  gfmLimited: boolean;
  tripped: boolean;
  voltageEventApplied: boolean;
  converged: boolean;
  solverHeldLastValid: boolean;
  solverIterations: number;
  resource: ResourceKind;
  scenarioId: string;
}
