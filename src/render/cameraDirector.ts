import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export type CameraMode = "auto" | "libre" | "tecnica" | "comparacion";

export interface CameraCue {
  id: "wide" | "trip" | "voltage" | "parallel" | "result";
  at: number;
  duration: number;
  reason: "stable" | "activePowerTrip" | "reactiveEvent" | "response" | "summary";
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromLook: THREE.Vector3;
  toLook: THREE.Vector3;
  hold?: boolean;
}

const SMOOTH = (x: number): number => x * x * (3 - 2 * x);

/**
 * Director por cues semánticos: wide → trip → voltage → parallel → result.
 * Máximo cinco transiciones automáticas; mismo eje espacial durante la
 * perturbación (los planos trip y voltage comparten posición base).
 */
export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  mode: CameraMode = "auto";

  constructor(dom: HTMLElement, private cues: CameraCue[]) {
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.5, 6000);
    this.camera.position.set(180, 90, 240);
    this.controls = new OrbitControls(this.camera, dom);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 8, 0);
    this.controls.maxDistance = 1600;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.enabled = false;
  }

  setCues(cues: CameraCue[]): void {
    this.cues = cues;
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.controls.enabled = mode === "libre";
    if (mode === "tecnica") {
      this.camera.position.set(0, 420, 60);
      this.controls.target.set(0, 0, -20);
      this.camera.lookAt(0, 0, -20);
    } else if (mode === "comparacion") {
      this.camera.position.set(0, 60, 330);
      this.controls.target.set(0, 12, 0);
      this.camera.lookAt(0, 12, 0);
    } else if (mode === "libre") {
      this.controls.target.set(0, 10, 0);
    }
  }

  update(tSim: number, dtRender: number): void {
    if (this.mode !== "auto") {
      this.controls.update();
      return;
    }
    void dtRender;
    const cue = this.cues.find((c) => tSim >= c.at && tSim < c.at + c.duration) ?? this.cues[this.cues.length - 1];
    const k = SMOOTH(THREE.MathUtils.clamp((tSim - cue.at) / Math.max(1e-6, cue.duration), 0, 1));
    // hold: quedarse quieto en el destino (para leer la etiqueta del evento)
    const kk = cue.hold ? Math.min(1, k * 1.6) : k;
    this.camera.position.lerpVectors(cue.fromPos, cue.toPos, kk);
    const look = new THREE.Vector3().lerpVectors(cue.fromLook, cue.toLook, kk);
    this.camera.lookAt(look);
    this.controls.target.copy(look);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
