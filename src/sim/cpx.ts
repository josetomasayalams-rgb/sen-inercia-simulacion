export interface Cpx {
  re: number;
  im: number;
}

export const cpx = (re: number, im: number): Cpx => ({ re, im });
export const cAdd = (a: Cpx, b: Cpx): Cpx => cpx(a.re + b.re, a.im + b.im);
export const cSub = (a: Cpx, b: Cpx): Cpx => cpx(a.re - b.re, a.im - b.im);
export const cMul = (a: Cpx, b: Cpx): Cpx =>
  cpx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const cDiv = (a: Cpx, b: Cpx): Cpx => {
  const d = b.re * b.re + b.im * b.im;
  return cpx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
export const cScale = (a: Cpx, k: number): Cpx => cpx(a.re * k, a.im * k);
export const cConj = (a: Cpx): Cpx => cpx(a.re, -a.im);
export const cAbs = (a: Cpx): number => Math.hypot(a.re, a.im);
export const cArg = (a: Cpx): number => Math.atan2(a.im, a.re);
export const cFromPolar = (mag: number, ang: number): Cpx =>
  cpx(mag * Math.cos(ang), mag * Math.sin(ang));
