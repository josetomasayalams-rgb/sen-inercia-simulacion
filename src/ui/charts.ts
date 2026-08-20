export interface SeriesDef {
  label: string;
  color: string;
  unit: string;
}

export interface TraceData {
  t: number[];
  values: number[][];
}

const LEGEND_FONT = "10px ui-monospace, monospace";

export class Chart {
  private ctx: CanvasRenderingContext2D;
  private t: number[] = [];
  private values: number[][];
  private overlays: Array<{ data: TraceData; color: string; label: string }> = [];
  private maxPoints = 900;
  private compact: boolean;
  private comparisonMode = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private title: string,
    private series: SeriesDef[],
    private yMin: number,
    private yMax: number,
    private tMax: number,
    private eventTimes: number[],
    private highContrast: () => boolean,
    opts?: { compact?: boolean },
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.values = series.map(() => []);
    this.compact = opts?.compact ?? false;
  }

  push(t: number, vals: number[]): void {
    this.t.push(t);
    vals.forEach((v, i) => this.values[i]?.push(v));
    if (this.t.length > this.maxPoints) {
      this.t.shift();
      this.values.forEach((arr) => arr.shift());
    }
  }

  addOverlay(data: TraceData, color: string, label: string): void {
    this.overlays.push({ data, color, label });
    if (this.overlays.length > 8) this.overlays.shift();
  }

  clearOverlays(): void {
    this.overlays = [];
  }

  reset(): void {
    this.t = [];
    this.values = this.series.map(() => []);
  }

  traceOf(seriesIndex: number): TraceData {
    return { t: [...this.t], values: [[...this.values[seriesIndex]]] };
  }

  setLimits(yMin: number, yMax: number, tMax: number): void {
    this.yMin = yMin;
    this.yMax = yMax;
    this.tMax = tMax;
  }

  setTitle(title: string): void {
    this.title = title;
  }

  setComparisonMode(active: boolean): void {
    this.comparisonMode = active;
  }

  draw(): void {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (w === 0 || h === 0) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hc = this.highContrast();
    const bg = hc ? "#000000" : "#0d141c";
    const grid = hc ? "#555555" : "#1f2c3a";
    const text = hc ? "#ffffff" : "#a8bacd";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const padL = this.compact ? 34 : 44;
    const padR = 10;
    const headerRows = this.compact ? 4 : this.overlays.length > 1 ? 3 : 2;
    const padT = 14 + headerRows * 13;
    const padB = 15;
    const pw = w - padL - padR;
    const ph = h - padT - padB;
    if (pw <= 10 || ph <= 10) return;
    const xOf = (tt: number) => padL + (Math.min(tt, this.tMax) / this.tMax) * pw;
    const yOf = (v: number) => padT + (1 - (v - this.yMin) / (this.yMax - this.yMin)) * ph;

    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = text;
    const ySteps = 4;
    const yRange = Math.abs(this.yMax - this.yMin);
    const yDecimals = yRange < 0.1 ? 3 : yRange < 4 ? 2 : yRange < 12 ? 1 : 0;
    for (let i = 0; i <= ySteps; i++) {
      const v = this.yMin + ((this.yMax - this.yMin) * i) / ySteps;
      const y = yOf(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(v.toFixed(yDecimals), 3, y + 3);
    }
    const tStep = this.tMax > 20 ? 5 : 2;
    ctx.textAlign = "center";
    for (let tt = 0; tt <= this.tMax + 1e-9; tt += tStep) {
      const x = xOf(tt);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, h - padB);
      ctx.stroke();
      if (this.tMax > 2) ctx.fillText(`${tt}s`, x, h - 4);
    }
    ctx.textAlign = "left";

    for (const et of this.eventTimes) {
      if (et > this.tMax) continue;
      ctx.strokeStyle = "rgba(255,90,60,0.6)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(xOf(et), padT);
      ctx.lineTo(xOf(et), h - padB);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // --- header: título + leyenda en filas que caben ---
    ctx.fillStyle = text;
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(this.title, padL, 11);
    ctx.font = LEGEND_FONT;
    type Leg = { text: string; color: string };
    const legs: Leg[] = [];
    for (const s of this.series) {
      const i = this.series.indexOf(s);
      const last = this.values[i]?.length ? this.values[i][this.values[i].length - 1] : null;
      if (this.comparisonMode && last === null) continue;
      legs.push({ text: `${s.label}${last !== null && Number.isFinite(last) ? ` ${last.toFixed(yRange < 0.1 ? 3 : yRange < 4 ? 2 : 0)} ${s.unit}` : ""}`, color: s.color });
    }
    for (const ov of this.overlays) {
      legs.push({ text: ov.label, color: ov.color });
    }
    let lx = padL;
    let ly = 25;
    for (const leg of legs) {
      const itemW = 13 + ctx.measureText(leg.text).width + 12;
      if (lx + itemW > w - padR) {
        lx = padL;
        ly += 12;
        if (ly > padT - 4) break;
      }
      ctx.fillStyle = leg.color;
      ctx.fillRect(lx, ly - 5, 8, 4);
      ctx.fillStyle = text;
      ctx.fillText(leg.text, lx + 11, ly);
      lx += itemW;
    }

    const drawLine = (ts: number[], vals: number[], color: string, width: number, alpha: number) => {
      if (ts.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < ts.length; i++) {
        const v = vals[i];
        if (!Number.isFinite(v)) continue;
        const x = xOf(ts[i]);
        const y = yOf(Math.min(this.yMax, Math.max(this.yMin, v)));
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    for (const ov of this.overlays) {
      drawLine(ov.data.t, ov.data.values[0], ov.color, this.comparisonMode ? 2.2 : 1.3, this.comparisonMode ? 0.92 : 0.6);
    }
    this.series.forEach((s, i) => {
      drawLine(this.t, this.values[i], s.color, 1.8, 1);
    });
  }
}
