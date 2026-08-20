export const F0_HZ = 50;
export const OMEGA0 = 2 * Math.PI * F0_HZ;
export const S_BASE_MVA = 200;
export const V_BASE_KV = 220;

export const Z_BASE_OHM = (V_BASE_KV * V_BASE_KV) / S_BASE_MVA;
export const I_BASE_A = (S_BASE_MVA * 1e6) / (Math.sqrt(3) * V_BASE_KV * 1e3);

export const mwToPu = (mw: number): number => mw / S_BASE_MVA;
export const puToMw = (pu: number): number => pu * S_BASE_MVA;
export const mvarToPu = (mvar: number): number => mvar / S_BASE_MVA;
export const puToMvar = (pu: number): number => pu * S_BASE_MVA;
export const puToKv = (pu: number): number => pu * V_BASE_KV;
export const puToAmps = (puCurrent: number): number => puCurrent * I_BASE_A;
export const mwhsToPuEnergy = (mws: number): number => mwToPu(mws);
