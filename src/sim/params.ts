import { cpx, type Cpx } from "./cpx.js";
import { F0_HZ, S_BASE_MVA } from "./units.js";
import type { ResourceKind, SimParams } from "./types.js";

export interface GridScenario {
  id: string;
  label: string;
  description: string;
  zThPu: Cpx;
  scrOn200Mva: number;
  isAnchor: boolean;
}

export const SCL_CRUCERO_MVA = 3930.4;
export const K_IBR_MW = 2536.8;
export const Z_TH_CRUCERO_PU = 0.0508854060655404;
export const SCR_CRUCERO = 19.652;

export const GRID_SCENARIOS: GridScenario[] = [
  {
    id: "crucero-2026",
    label: "Crucero ancla 2026 (SCR ≈ 19,65)",
    description:
      "SCL mínimo esperado 2026 en CRUCERO 220 kV B1: 3930,4 MVA. Red fuerte; impedancia Thevenin derivada (solo para la demo).",
    zThPu: cpx(0, Z_TH_CRUCERO_PU),
    scrOn200Mva: SCR_CRUCERO,
    isAnchor: true,
  },
  {
    id: "scr-3",
    label: "Prueba red débil — SCR 3",
    description: "Estrés comparativo estilo prueba CEN de reducción de SCR para GFM. No es el valor medido de Crucero.",
    zThPu: cpx(0, 1 / 3),
    scrOn200Mva: 3,
    isAnchor: false,
  },
  {
    id: "scr-2",
    label: "Prueba red débil — SCR 2",
    description: "Estrés comparativo; no es el valor medido de Crucero.",
    zThPu: cpx(0, 1 / 2),
    scrOn200Mva: 2,
    isAnchor: false,
  },
  {
    id: "scr-1_5",
    label: "Prueba red débil — SCR 1,5",
    description: "Estrés comparativo; no es el valor medido de Crucero.",
    zThPu: cpx(0, 1 / 1.5),
    scrOn200Mva: 1.5,
    isAnchor: false,
  },
  {
    id: "scr-1_25",
    label: "Prueba red débil — SCR 1,25",
    description: "Estrés comparativo; no es el valor medido de Crucero.",
    zThPu: cpx(0, 1 / 1.25),
    scrOn200Mva: 1.25,
    isAnchor: false,
  },
];

export const RESOURCE_LABELS: Record<ResourceKind, string> = {
  none: "Sin servicio complementario",
  thermal: "Térmica síncrona 200 MW",
  "gfl-pq": "BESS GFL — P/Q fijo",
  "gfl-rpf": "BESS GFL — respuesta primaria (RPF)",
  "gfl-ffr": "BESS GFL — respuesta rápida (FFR)",
  "gfm-vsm": "BESS GFM-VSM",
};

export function buildParams(resource: ResourceKind, scenarioId: string): SimParams {
  const scenario = GRID_SCENARIOS.find((s) => s.id === scenarioId) ?? GRID_SCENARIOS[0];
  return {
    resource,
    resources: [resource],
    scenarioId: scenario.id,
    zThPu: scenario.zThPu,
    eThPu: cpx(1, 0),
    f0Hz: F0_HZ,
    sBaseMva: S_BASE_MVA,
    // E_phys base representa el resto del área. La máquina térmica de
    // comparación agrega H·S solo cuando está físicamente conectada.
    ePhysMWs: 6060 + (resource === "thermal" ? 5 * 250 : 0),
    dFPuPerPu: 0.8,
    loadPPu: 1.0,
    loadQPu: 0.15,
    // Supuesto pedagógico explícito: unidad sincronizada en reserva rodante,
    // 40 MW iniciales y 160 MW de margen hasta Pmax=200 MW.
    governor: {
      p0Pu: 0.2,
      droopR: 0.05,
      tauMeasurementS: 0.12,
      deadbandHz: 0.03,
      tauGovS: 0.3,
      tauTurbS: 0.8,
      pMinPu: 0,
      pMaxPu: 1.0,
    },
    avr: { e0Pu: 1.0, gainKa: 30, tauAs: 0.03, eMinPu: 0.8, eMaxPu: 1.3, xdPrimePu: 0.3 },
    machine: { inertiaHs: 5, ratingMva: 250, syncTauS: 0.08, deltaMaxRad: 1.2 },
    pll: { kp: 20, ki: 200 },
    gfl: {
      pSetPu: 0,
      qSetPu: 0,
      // Respuesta primaria: 5 % de droop (2,5 Hz para 1 pu) y banda
      // muerta de 30 mHz. El PLL y tauMeas introducen la dinámica de medida.
      deadbandHz: 0.03,
      droopRf: 2.5,
      kfPuPerHz: 0.8,
      kRocofPuPerHzS: 0.5,
      reserveUpPu: 1.0,
      reserveDownPu: 0.2,
      tauMeasS: 0.05,
      tauRocofS: 0.1,
    },
    vsm: {
      // Ajuste VSM sobreamortiguado para la señal RMS: respuesta rápida y
      // asentamiento sin una oscilación sostenida artificial. No representa
      // los pulsos PWM, que pertenecen a la escala EMT/de conmutación.
      hvS: 3,
      dvPu: 20,
      dDampPu: 60,
      tauPPuS: 0.05,
      xGfmPu: 0.3,
      kvPu: 3,
      kqPu: 0.3,
      tauEs: 0.05,
      e0Pu: 1.0,
      eMinPu: 0.85,
      eMaxPu: 1.15,
      pRefPu: 0,
      qRefPu: 0,
      responseDelayS: 0.02,
    },
    bess: { eCapMWh: 880, etaDischarge: 0.95, soc0MWh: 0.9 * 880, socMinMWh: 0.05 * 880 },
    limits: { sMaxPu: 1.0, iMaxPu: 1.05 },
    events: { tTripS: 2.3, dTripPu: 1.0, tVoltageS: 2.35, dQLoadPu: 0.3 },
    // El ROCOF físico siempre sigue la ecuación de oscilación. Para la máquina
    // síncrona se muestra una estimación suavizada; en los inversores se deja
    // el cambio instantáneo para hacer visible que no agregan inercia física.
    rocofDisplayTauS: resource === "thermal" ? 0.18 : 0,
    dtS: 1 / 240,
    tEndS: 12,
  };
}

/**
 * Preset de historia — mañana soleada, área equivalente de baja inercia.
 *
 * La luz de mañana es una decisión cinematográfica. E_phys=4200 MW·s y la
 * pérdida remota de 160 MW son supuestos separados del estado del cielo; no se
 * infiere la inercia a partir de la producción solar. El evento deja margen
 * reactivo en los recursos de 200 MW y no representa una falla local.
 */
export function buildSunsetParams(resource: ResourceKind, resources?: ResourceKind[]): SimParams {
  const p = buildParams(resource, "crucero-2026");
  if (resources) p.resources = resources;
  const active = p.resources.length > 0 ? p.resources : [p.resource];
  const machineEnergyMWs = active.includes("thermal") ? p.machine.inertiaHs * p.machine.ratingMva : 0;
  p.ePhysMWs = 4200 + machineEnergyMWs;
  p.loadPPu = 1.0;
  p.loadQPu = 0.15;
  p.events = { tTripS: 2.3, dTripPu: 0.8, tVoltageS: 2.35, dQLoadPu: 0.3 };
  p.tEndS = 14;
  return p;
}
