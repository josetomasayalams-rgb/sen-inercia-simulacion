import * as THREE from "three";

export interface BessYardRefs {
  group: THREE.Group;
  socBars: THREE.Mesh[];
}

export interface FreqBarRefs {
  group: THREE.Group;
  fill: THREE.Mesh;
  fillMat: THREE.MeshStandardMaterial;
}

export interface SceneRefs {
  scene: THREE.Scene;
  rotor: THREE.Object3D;
  eKinSegments: THREE.Mesh[];
  bess: BessYardRefs[];
  freqBars: FreqBarRefs[];
  labels: THREE.Sprite[];
  tripPulse: THREE.Mesh;
  voltPulse: THREE.Mesh;
  waveFront: THREE.Mesh;
  lineCurve: THREE.CurvePath<THREE.Vector3>;
  busGlow: THREE.MeshStandardMaterial;
  resourceGlow: THREE.MeshStandardMaterial;
  thermalGroup: THREE.Group;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  smoke: SmokeSystem;
  breaker: BreakerRefs;
  lineDisconnectors: THREE.Group[];
  gsu: THREE.Mesh;
  powerFlows: PowerFlowVisual[];
  stationPad: THREE.Mesh;
  bessPads: THREE.Mesh[];
}

export interface BreakerRefs {
  group: THREE.Group;
  blade: THREE.Mesh;
  arc: THREE.Mesh;
  label: THREE.Sprite;
}

export interface PowerFlowVisual {
  id: string;
  group: THREE.Group;
  arrows: THREE.Mesh[];
  line: THREE.Mesh;
  label: THREE.Sprite;
  speed: number;
  offset: number;
}

/** Posiciones de los dos recursos en el modo comparación de historia. */
export const CMP_LAYOUT = {
  thermal: new THREE.Vector3(-118, 0, -30),
  // El único patio BESS ocupa la posición cercana originalmente usada por GFL.
  gfm: new THREE.Vector3(78, 0, -30),
  barZ: -74,
  labelY: 21,
};

const TECH_LAYOUT = {
  thermal: new THREE.Vector3(-78, 0, -26),
  bess: new THREE.Vector3(74, 0, -22),
};

export const FREQ_BAR_MIN_HZ = 40;
export const FREQ_BAR_MAX_HZ = 50.5;
export const FREQ_BAR_HEIGHT = 30;
export const FREQ_SAFE_HZ = 48;

const SAND = 0xc9a876;
const GRAVEL = 0x998d78;
const STEEL = 0x8f9aa3;
const COPPER = 0xb87333;
const ALU = 0xcfd6dd;
const INSULATOR = 0x7a4a2b;
const CONCRETE = 0xb5a88f;
const PANEL = 0x14283c;

function noise2(x: number, z: number): number {
  return (
    Math.sin(x * 0.011) * Math.cos(z * 0.013) * 6 +
    Math.sin(x * 0.031 + 1.7) * Math.cos(z * 0.027 + 0.4) * 2.4 +
    Math.sin(x * 0.005 + z * 0.004) * 9
  );
}

function makeSunTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const glow = ctx.createRadialGradient(128, 128, 12, 128, 128, 126);
  glow.addColorStop(0, "rgba(255,255,238,1)");
  glow.addColorStop(0.22, "rgba(255,235,166,.98)");
  glow.addColorStop(0.5, "rgba(255,210,100,.32)");
  glow.addColorStop(1, "rgba(255,210,100,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeCloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 192;
  const ctx = canvas.getContext("2d")!;
  ctx.filter = "blur(10px)";
  const blobs = [[90,112,64],[168,82,76],[250,100,92],[344,82,68],[414,112,62]];
  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x, y, 4, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,.95)");
    g.addColorStop(.58, "rgba(250,253,255,.8)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildRealSky(): THREE.Group {
  const group = new THREE.Group();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2100, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        zenith: { value: new THREE.Color(0x168ee0) },
        horizon: { value: new THREE.Color(0xd7efff) },
      },
      vertexShader: `varying vec3 vWorld; void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; varying vec3 vWorld; void main(){float h=clamp(normalize(vWorld).y*.82+.18,0.0,1.0);h=smoothstep(0.0,1.0,h);gl_FragColor=vec4(mix(horizon,zenith,h),1.0);}`,
    }),
  );
  sky.renderOrder = -10;
  group.add(sky);

  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeSunTexture(), transparent: true, depthWrite: false }));
  sunDisc.position.set(-500, 300, -900);
  sunDisc.scale.set(190, 190, 1);
  group.add(sunDisc);

  const cloudTexture = makeCloudTexture();
  const clouds = [
    [-720, 430, -1100, 430, 150, .72],
    [280, 520, -1250, 520, 180, .58],
    [860, 390, -980, 400, 138, .64],
    [-120, 330, -920, 340, 116, .48],
  ];
  for (const [x, y, z, w, h, opacity] of clouds) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture, transparent: true, opacity, depthWrite: false }));
    sprite.position.set(x, y, z);
    sprite.scale.set(w, h, 1);
    group.add(sprite);
  }
  return group;
}

function makeSandTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const ripple = 10 * Math.sin(y * .18 + Math.sin(x * .035) * 2.2);
      const grain = 7 * Math.sin(x * 12.9898 + y * 78.233);
      const shade = Math.round(ripple + grain);
      const i = (y * 512 + x) * 4;
      image.data[i] = THREE.MathUtils.clamp(202 + shade, 0, 255);
      image.data[i + 1] = THREE.MathUtils.clamp(169 + shade, 0, 255);
      image.data[i + 2] = THREE.MathUtils.clamp(112 + shade, 0, 255);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(52, 52);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildDesertScene(canvas: HTMLCanvasElement): { renderer: THREE.WebGLRenderer; refs: SceneRefs } {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const haze = new THREE.Color(0xcfe9f8);
  scene.background = haze;
  scene.fog = new THREE.Fog(haze, 620, 2500);
  scene.add(buildRealSky());

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0xd8b98a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.set(-380, 300, -220);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const terrainGeo = new THREE.PlaneGeometry(5200, 5200, 140, 140);
  terrainGeo.rotateX(-Math.PI / 2);
  const pos = terrainGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const d = Math.hypot(x, z);
    const flat = THREE.MathUtils.smoothstep(d, 240, 520);
    pos.setY(i, noise2(x, z) * flat);
  }
  terrainGeo.computeVertexNormals();
  const sandTexture = makeSandTexture(renderer);
  const terrain = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshStandardMaterial({ color: SAND, map: sandTexture, bumpMap: sandTexture, bumpScale: 0.72, roughness: 0.96, metalness: 0 }),
  );
  terrain.receiveShadow = true;
  scene.add(terrain);

  const stationPad = new THREE.Mesh(
    new THREE.BoxGeometry(100, 0.5, 96),
    new THREE.MeshStandardMaterial({ color: GRAVEL, roughness: 1 }),
  );
  stationPad.position.set(0, 0.25, 0);
  stationPad.receiveShadow = true;
  scene.add(stationPad);

  const makeBessPad = (position: THREE.Vector3): THREE.Mesh => {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(48, 0.32, 36),
      new THREE.MeshStandardMaterial({ color: 0x9d927d, roughness: 1 }),
    );
    pad.position.set(position.x, 0.16, position.z);
    pad.receiveShadow = true;
    scene.add(pad);
    return pad;
  };
  const bessPads = [makeBessPad(TECH_LAYOUT.bess)];

  const thermalGroup = buildThermalPlant();
  thermalGroup.position.copy(TECH_LAYOUT.thermal);
  scene.add(thermalGroup);

  const bessA = buildBessYard(0x51606e);
  bessA.group.position.copy(TECH_LAYOUT.bess);
  scene.add(bessA.group);

  const sub = buildSubstation();
  scene.add(sub.group);

  scene.add(buildSolarField());
  const line = buildTransmissionLine();
  scene.add(line.group);

  const freqBars: FreqBarRefs[] = [
    buildFreqBar(CMP_LAYOUT.thermal.x),
    buildFreqBar(CMP_LAYOUT.gfm.x),
  ];
  for (const bar of freqBars) {
    bar.group.position.set(bar.group.position.x, 0, CMP_LAYOUT.barZ);
    bar.group.visible = false;
    scene.add(bar.group);
  }

  const labels = [
    makeTextSprite("TÉRMICA", "máquina síncrona", "#e67e22"),
    makeTextSprite("GRID-FORMING", "máquina síncrona virtual", "#2ecc71"),
  ];
  labels[0].position.set(CMP_LAYOUT.thermal.x, CMP_LAYOUT.labelY, CMP_LAYOUT.thermal.z + 4);
  labels[1].position.set(CMP_LAYOUT.gfm.x, CMP_LAYOUT.labelY, CMP_LAYOUT.gfm.z + 4);
  for (const l of labels) {
    l.visible = false;
    scene.add(l);
  }

  // --- topología eléctrica: GSU 21/220 + interruptor con estado ---
  const gsu = new THREE.Mesh(
    new THREE.BoxGeometry(5, 5.5, 4),
    new THREE.MeshStandardMaterial({ color: 0x77808a, roughness: 0.55, metalness: 0.35 }),
  );
  gsu.name = "thermalGSU21to220";
  gsu.position.set(-34, 2.75, -8);
  gsu.castShadow = true;
  scene.add(gsu);
  for (let b = 0; b < 3; b++) {
    const bush = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.32, 3.6, 10),
      new THREE.MeshStandardMaterial({ color: INSULATOR, roughness: 0.7 }),
    );
    bush.position.set(-34 - 1.4 + b * 1.4, 6.8, -8);
    scene.add(bush);
  }
  const breaker = buildBreaker(new THREE.Vector3(-16, 9.5, 0));
  scene.add(breaker.group);

  // --- flujos de potencia agregados (didácticos, escala declarada) ---
  const powerFlows = [
    buildPowerFlow("thermalToBus", 0xe67e22, "APORTE TÉRMICO"),
    buildPowerFlow("gfmToBus", 0x2ecc71, "APORTE GFM"),
  ];
  for (const pf of powerFlows) scene.add(pf.group);

  const refs: SceneRefs = {
    scene,
    rotor: thermalGroup.getObjectByName("rotor") as THREE.Object3D,
    eKinSegments: thermalGroup.getObjectByName("ekinArc")!.children as THREE.Mesh[],
    bess: [bessA],
    freqBars,
    labels,
    tripPulse: sub.group.getObjectByName("tripPulse") as THREE.Mesh,
    voltPulse: sub.group.getObjectByName("voltPulse") as THREE.Mesh,
    waveFront: line.group.getObjectByName("waveFront") as THREE.Mesh,
    lineCurve: line.curve,
    busGlow: sub.busGlow,
    resourceGlow: new THREE.MeshStandardMaterial({ color: 0x223344 }),
    thermalGroup,
    sun,
    hemi,
    smoke: buildSmokeSystem(new THREE.Vector3(-20, 48, -22)),
    breaker,
    lineDisconnectors: sub.lineDisconnectors,
    gsu,
    powerFlows,
    stationPad,
    bessPads,
  };

  scene.add(refs.smoke.group);
  refs.smoke.group.position.add(TECH_LAYOUT.thermal);

  return { renderer, refs };
}

function buildBreaker(pos: THREE.Vector3): BreakerRefs {
  const group = new THREE.Group();
  group.position.copy(pos);

  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.05, 3.2, 14),
    new THREE.MeshStandardMaterial({ color: 0x4d5a66, roughness: 0.6, metalness: 0.3 }),
  );
  tank.position.y = -3.2;
  tank.castShadow = true;
  group.add(tank);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 3.4, 8),
    new THREE.MeshStandardMaterial({ color: 0xcfd6dd, roughness: 0.4, metalness: 0.7 }),
  );
  pole.position.y = -1.4;
  group.add(pole);

  const pivot = new THREE.Group();
  pivot.position.set(0, 0.3, 0);
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 2.6, 0.42),
    new THREE.MeshStandardMaterial({ color: 0xcfd6dd, roughness: 0.35, metalness: 0.75 }),
  );
  blade.position.set(0, 1.3, 0);
  pivot.add(blade);
  group.add(pivot);

  const arc = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0 }),
  );
  arc.position.set(0, 1.6, 0);
  group.add(arc);

  const label = makeEventSprite("PERTURBACIÓN SISTÉMICA", "#ff8c42");
  label.position.set(0, 7.2, 0);
  label.scale.set(26, 6.5, 1);
  group.add(label);

  return { group, blade, arc, label };
}

function makeEventSprite(text: string, accent: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(8, 12, 17, 0.85)";
  ctx.beginPath();
  ctx.roundRect(8, 8, 1008, 240, 34);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = accent;
  let fontSize = 92;
  do {
    ctx.font = `800 ${fontSize}px 'Segoe UI', system-ui, sans-serif`;
    fontSize -= 2;
  } while (ctx.measureText(text).width > 900 && fontSize > 42);
  ctx.fillText(text, 512, 132);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
}

function buildPowerFlow(id: string, color: number, labelText: string): PowerFlowVisual {
  const group = new THREE.Group();
  const arrowCount = 6;
  const arrows: THREE.Mesh[] = [];
  const arrowGeo = new THREE.ConeGeometry(0.9, 2.7, 10);
  arrowGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < arrowCount; i++) {
    const arrow = new THREE.Mesh(
      arrowGeo,
      new THREE.MeshStandardMaterial({
        color,
        emissive: new THREE.Color(color),
        emissiveIntensity: 1.5,
        roughness: 0.4,
      }),
    );
    // Se conserva el rótulo de aporte, pero se retiran las flechas animadas
    // porque distraen de la respuesta principal de cada recurso.
    arrow.visible = false;
    group.add(arrow);
    arrows.push(arrow);
  }
  const line = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 1, 8),
    new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 1.1 }),
  );
  // La línea de flujo se oculta junto con las flechas; la rotación térmica,
  // el humo y el resto de la escena permanecen sin cambios.
  line.visible = false;
  group.add(line);

  const label = makeTextSprite(labelText, "hacia la barra", `#${color.toString(16).padStart(6, "0")}`);
  label.scale.set(17, 5.3, 1);
  group.add(label);
  group.visible = false;
  return { id, group, arrows, line, label, speed: 0, offset: 0 };
}

/**
 * Actualiza un flujo de potencia: anima flechas que avanzan de from a to.
 * La velocidad puede depender de |P| pero es una escala didáctica declarada.
 */
export function updatePowerFlow(
  pf: PowerFlowVisual,
  from: THREE.Vector3,
  to: THREE.Vector3,
  pMw: number,
  tRender: number,
  maxMw: number,
  enabled = true,
): void {
  // En esta visualización `from` siempre es el recurso y `to` siempre es la
  // barra. El signo de la telemetría no puede invertir el relato visual: estas
  // flechas aparecen únicamente para representar inyección hacia la red.
  const start = from;
  const end = to;
  const dir = end.clone().sub(start);
  const len = dir.length();
  const norm = dir.clone().normalize();
  // La escena decide cuándo el recurso está aportando. No usar un umbral de
  // potencia evita que el rótulo parpadee al cruzar valores pequeños.
  const active = enabled;
  pf.group.visible = active;
  if (!active) return;
  const intensity = THREE.MathUtils.clamp(Math.abs(pMw) / maxMw, 0, 1);
  pf.group.position.copy(start);
  const spacing = len / pf.arrows.length;
  // Una velocidad base permite leer el sentido apenas comienza el aporte. A
  // medida que aumenta la inyección, las flechas aceleran de forma evidente.
  pf.speed = 4.5 + 27 * Math.sqrt(intensity);
  pf.offset = (tRender * pf.speed) % len;
  pf.arrows.forEach((arrow, i) => {
    // Cada flecha recorre el trayecto completo recurso -> barra. El desfase
    // evita el antiguo reinicio colectivo que se percibía como flujo inverso.
    const d = (pf.offset + spacing * i) % len;
    arrow.position.copy(norm).multiplyScalar(d);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), norm);
    arrow.scale.setScalar(0.9 + 0.85 * intensity);
  });
  pf.line.position.set(0, 0, 0).copy(start).add(end).multiplyScalar(0.5).sub(start);
  pf.line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), norm);
  pf.line.scale.set(1, len, 1);
  pf.label.position.copy(norm).multiplyScalar(len * 0.55);
  pf.label.position.y += 5;
}

/** Reubica los grupos para cada modo y controla la visibilidad de los extras. */
export function applyLayout(refs: SceneRefs, mode: "tecnico" | "comparacion"): void {
  const cmp = mode === "comparacion";
  refs.thermalGroup.position.copy(cmp ? CMP_LAYOUT.thermal : TECH_LAYOUT.thermal);
  const bessPosition = cmp ? CMP_LAYOUT.gfm : TECH_LAYOUT.bess;
  refs.bess[0].group.position.copy(bessPosition);
  refs.bessPads[0].position.set(bessPosition.x, 0.16, bessPosition.z);
  refs.smoke.group.position.set(
    (cmp ? CMP_LAYOUT.thermal : TECH_LAYOUT.thermal).x - 20,
    48,
    (cmp ? CMP_LAYOUT.thermal : TECH_LAYOUT.thermal).z - 22,
  );
  for (const bar of refs.freqBars) bar.group.visible = cmp;
  for (const l of refs.labels) l.visible = cmp;
}

/** Iluminación de mañana soleada para historia y día técnico neutro. */
export function applySunset(refs: SceneRefs, sunset: boolean): void {
  const scene = refs.scene;
  if (sunset) {
    const morning = new THREE.Color(0xcfe9f8);
    scene.background = morning;
    scene.fog = new THREE.Fog(morning, 620, 2500);
    refs.sun.color.setHex(0xfff4d6);
    refs.sun.intensity = 3.25;
    refs.sun.position.set(-420, 420, 180);
    refs.hemi.color.setHex(0xd8efff);
    refs.hemi.groundColor.setHex(0xe3c894);
    refs.hemi.intensity = 1.15;
  } else {
    const haze = new THREE.Color(0xe8cfa4);
    scene.background = haze;
    scene.fog = new THREE.Fog(haze, 420, 2400);
    refs.sun.color.setHex(0xfff1d6);
    refs.sun.intensity = 2.6;
    refs.sun.position.set(-380, 300, -220);
    refs.hemi.color.setHex(0xbfd9ff);
    refs.hemi.groundColor.setHex(0xd8b98a);
    refs.hemi.intensity = 0.85;
  }
}

export function freqToBarScale(fHz: number): number {
  const k = (fHz - FREQ_BAR_MIN_HZ) / (FREQ_BAR_MAX_HZ - FREQ_BAR_MIN_HZ);
  return THREE.MathUtils.clamp(k, 0.001, 1);
}

function buildFreqBar(x: number): FreqBarRefs {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, FREQ_BAR_HEIGHT + 0.6, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.8 }),
  );
  frame.position.y = (FREQ_BAR_HEIGHT + 0.6) / 2;
  group.add(frame);

  const fillGeo = new THREE.BoxGeometry(1.6, FREQ_BAR_HEIGHT, 0.42);
  fillGeo.translate(0, FREQ_BAR_HEIGHT / 2, 0);
  const fillMat = new THREE.MeshStandardMaterial({
    color: 0x0c2b1e,
    emissive: new THREE.Color(0x2ecc71),
    emissiveIntensity: 1.1,
    roughness: 0.4,
  });
  const fill = new THREE.Mesh(fillGeo, fillMat);
  fill.position.y = 0.05;
  fill.scale.y = 1;
  group.add(fill);

  const safeY = FREQ_BAR_HEIGHT * ((FREQ_SAFE_HZ - FREQ_BAR_MIN_HZ) / (FREQ_BAR_MAX_HZ - FREQ_BAR_MIN_HZ));
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.28, 0.55),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.5 }),
  );
  marker.position.y = safeY;
  group.add(marker);

  group.position.x = x;
  return { group, fill, fillMat };
}

function makeTextSprite(title: string, subtitle: string, accent: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(8, 12, 17, 0.78)";
  ctx.beginPath();
  ctx.roundRect(6, 6, 500, 148, 26);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  const hasSubtitle = subtitle.trim().length > 0;
  ctx.font = "bold 52px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(title, 256, hasSubtitle ? 70 : 96);
  if (hasSubtitle) {
    ctx.fillStyle = "#d7e3f0";
    ctx.font = "36px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText(subtitle, 256, 122);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(30, 9.4, 1);
  return sprite;
}

function buildThermalPlant(): THREE.Group {
  const g = new THREE.Group();

  const house = new THREE.Mesh(
    new THREE.BoxGeometry(30, 15, 20),
    new THREE.MeshStandardMaterial({ color: CONCRETE, roughness: 0.9 }),
  );
  house.position.set(0, 7.5, -14);
  house.castShadow = true;
  house.receiveShadow = true;
  g.add(house);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(31, 1, 21),
    new THREE.MeshStandardMaterial({ color: 0x8a7f6d, roughness: 1 }),
  );
  roof.position.set(0, 15.4, -14);
  g.add(roof);

  for (let i = 0; i < 4; i++) {
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 2.2, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x2c3a45, roughness: 0.3, metalness: 0.5 }),
    );
    win.position.set(15.1, 9 - i * 2.6, -14 + (i % 2 === 0 ? -5 : 5));
    g.add(win);
  }

  const chimney = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 3, 48, 20),
    new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.8 }),
  );
  chimney.position.set(-20, 24, -22);
  chimney.castShadow = true;
  g.add(chimney);
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(2.45, 2.45, 4, 20),
    new THREE.MeshStandardMaterial({ color: 0xb03a2e, roughness: 0.8 }),
  );
  band.position.set(-20, 44, -22);
  g.add(band);
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 0.8, 20),
    new THREE.MeshStandardMaterial({ color: 0x9b948a, roughness: 0.7, metalness: 0.2 }),
  );
  rim.position.set(-20, 47.8, -22);
  g.add(rim);

  const fuelLabel = makeTextSprite("QUEMANDO $", "más MW = más combustible", "#f4c542");
  fuelLabel.position.set(-6, 35, -16);
  fuelLabel.scale.set(18, 5.6, 1);
  g.add(fuelLabel);

  // --- generador síncrono realista, a la vista sobre su pedestal ---
  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(22, 2.4, 9),
    new THREE.MeshStandardMaterial({ color: CONCRETE, roughness: 1 }),
  );
  pedestal.position.set(2, 1.2, 8);
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  g.add(pedestal);

  for (const fx of [-8.2, 8.2]) {
    for (const fz of [-2.4, 2.4]) {
      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 1.4, 1.8),
        new THREE.MeshStandardMaterial({ color: 0x707a84, roughness: 0.7, metalness: 0.4 }),
      );
      foot.position.set(2 + fx, 3.1, 8 + fz);
      foot.castShadow = true;
      g.add(foot);
    }
  }

  const bedplate = new THREE.Mesh(
    new THREE.BoxGeometry(19.5, 1.1, 5.4),
    new THREE.MeshStandardMaterial({ color: 0x5d6772, roughness: 0.55, metalness: 0.5 }),
  );
  bedplate.position.set(2, 3.8, 8);
  bedplate.castShadow = true;
  g.add(bedplate);

  const stator = new THREE.Mesh(
    new THREE.CylinderGeometry(2.9, 2.9, 9.5, 28),
    new THREE.MeshStandardMaterial({ color: 0x3f6e8c, roughness: 0.5, metalness: 0.4 }),
  );
  stator.rotation.z = Math.PI / 2;
  stator.position.set(1.5, 6.2, 8);
  stator.castShadow = true;
  g.add(stator);

  for (let i = 0; i < 6; i++) {
    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 6.4, 6.4),
      new THREE.MeshStandardMaterial({ color: 0x35596f, roughness: 0.6, metalness: 0.3 }),
    );
    rib.position.set(-2.4 + i * 1.55, 6.2, 8);
    g.add(rib);
  }

  const terminalBox = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.6, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x2f3a44, roughness: 0.6, metalness: 0.4 }),
  );
  terminalBox.position.set(1.5, 9.4, 8);
  terminalBox.castShadow = true;
  g.add(terminalBox);
  for (const bz of [-0.7, 0, 0.7]) {
    const bush = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.2, 0.9, 10),
      new THREE.MeshStandardMaterial({ color: INSULATOR, roughness: 0.7 }),
    );
    bush.position.set(1.5 + (bz === 0 ? 0.55 : -0.55), 10.5, 8 + bz);
    g.add(bush);
  }

  const exciter = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 2.4, 20),
    new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.5, metalness: 0.5 }),
  );
  exciter.rotation.z = Math.PI / 2;
  exciter.position.set(8.6, 6.2, 8);
  exciter.castShadow = true;
  g.add(exciter);
  const exciterCap = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.15, 0.4, 20),
    new THREE.MeshStandardMaterial({ color: 0x2f3a44, roughness: 0.4, metalness: 0.6 }),
  );
  exciterCap.rotation.z = Math.PI / 2;
  exciterCap.position.set(9.9, 6.2, 8);
  g.add(exciterCap);

  const rotorAssembly = new THREE.Group();
  rotorAssembly.name = "rotor";
  rotorAssembly.position.set(2.2, 6.2, 8);
  g.add(rotorAssembly);

  const rotor = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.15, 13.5, 24),
    new THREE.MeshStandardMaterial({ color: COPPER, roughness: 0.35, metalness: 0.7 }),
  );
  rotor.rotation.z = Math.PI / 2;
  rotor.castShadow = true;
  rotor.name = "rotorCore";
  rotorAssembly.add(rotor);

  for (let i = 0; i < 3; i++) {
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 2.42, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6 }),
    );
    marker.position.set(-3.2 + i * 5.4, 0, 0);
    rotor.add(marker);
  }

  // Volante exterior con marca asimétrica para hacer legible la rotación y
  // representar visualmente la energía cinética del conjunto síncrono.
  const flywheel = new THREE.Mesh(
    new THREE.CylinderGeometry(2.35, 2.35, 0.75, 28),
    new THREE.MeshStandardMaterial({ color: 0x6f7b86, roughness: 0.35, metalness: 0.72 }),
  );
  flywheel.rotation.z = Math.PI / 2;
  flywheel.position.x = -5.25;
  flywheel.castShadow = true;
  rotorAssembly.add(flywheel);
  const inertiaMarker = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.55, 1.05),
    new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: new THREE.Color(0xff7a00), emissiveIntensity: 1.2 }),
  );
  inertiaMarker.position.set(-5.7, 0, 2.15);
  rotorAssembly.add(inertiaMarker);

  for (const bx of [-5.6, 5.6]) {
    const bearing = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 2.4, 2.4),
      new THREE.MeshStandardMaterial({ color: 0x8a939e, roughness: 0.35, metalness: 0.7 }),
    );
    bearing.position.set(2 + bx, 6.2, 8);
    bearing.castShadow = true;
    g.add(bearing);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.5, 14),
      new THREE.MeshStandardMaterial({ color: 0x6f7883, roughness: 0.4, metalness: 0.6 }),
    );
    cap.rotation.z = Math.PI / 2;
    cap.position.set(2 + bx, 6.2, 8);
    g.add(cap);
  }

  const coupling = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 0.8, 20),
    new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.4, metalness: 0.6 }),
  );
  coupling.rotation.z = Math.PI / 2;
  coupling.position.set(6.4, 6.2, 8);
  g.add(coupling);

  const ekinArc = new THREE.Group();
  ekinArc.name = "ekinArc";
  const segCount = 28;
  for (let i = 0; i < segCount; i++) {
    const a0 = (i / segCount) * Math.PI * 2;
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.55, 0.55),
      new THREE.MeshStandardMaterial({
        color: 0x274,
        emissive: new THREE.Color(0x2ecc71),
        emissiveIntensity: 0.9,
        roughness: 0.4,
      }),
    );
    seg.position.set(1.5 + Math.cos(a0) * 4.6, 6.2 + Math.sin(a0) * 4.6, 8);
    ekinArc.add(seg);
  }
  g.add(ekinArc);

  return g;
}

export interface SmokeSystem {
  group: THREE.Group;
  update(dt: number, intensity: number): void;
}

interface Puff {
  sprite: THREE.Sprite;
  life: number;
  maxLife: number;
  vy: number;
  drift: number;
  size0: number;
  size1: number;
}

function makeSmokeTexture(withDollar: boolean): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, "rgba(12, 13, 14, 0.98)");
  grad.addColorStop(0.55, "rgba(18, 18, 19, 0.72)");
  grad.addColorStop(1, "rgba(20, 20, 21, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  if (withDollar) {
    ctx.font = "bold 56px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(120, 180, 120, 0.9)";
    ctx.strokeStyle = "rgba(20, 60, 25, 0.9)";
    ctx.lineWidth = 3;
    ctx.strokeText("$", 64, 64);
    ctx.fillText("$", 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildSmokeSystem(origin: THREE.Vector3): SmokeSystem {
  const group = new THREE.Group();
  group.position.copy(origin);
  const texSmoke = makeSmokeTexture(false);
  const texDollar = makeSmokeTexture(true);
  const puffs: Puff[] = [];
  const MAX_PUFFS = 160;
  let spawnTimer = 0;

  function spawn(intensity: number): void {
    const boost = THREE.MathUtils.clamp((intensity - 0.2) / 7, 0, 1);
    const isDollar = Math.random() < 0.62 + 0.12 * boost;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: isDollar ? texDollar : texSmoke,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    const maxLife = 5.5 + Math.random() * 2.5;
    const a = Math.random() * Math.PI * 2;
    const r0 = Math.random() * 1.1;
    sprite.position.set(Math.cos(a) * r0, 0, Math.sin(a) * r0);
    group.add(sprite);
    puffs.push({
      sprite,
      life: 0,
      maxLife,
      vy: 3.6 + 2.4 * boost + Math.random() * 1.8,
      drift: (Math.random() - 0.5) * 0.9,
      size0: (isDollar ? 3.4 : 2.5) + 1.8 * boost + Math.random() * 1.4,
      size1: (isDollar ? 10 : 8.5) + 7 * boost + Math.random() * 4,
    });
    if (puffs.length > MAX_PUFFS) {
      const old = puffs.shift()!;
      group.remove(old.sprite);
      (old.sprite.material as THREE.SpriteMaterial).dispose();
    }
  }

  return {
    group,
    update(dt, intensity) {
      if (intensity > 0.02) {
        spawnTimer += dt * intensity;
        while (spawnTimer > 0.12) {
          spawn(intensity);
          spawnTimer -= 0.16;
        }
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.life += dt;
        const k = p.life / p.maxLife;
        if (k >= 1) {
          group.remove(p.sprite);
          (p.sprite.material as THREE.SpriteMaterial).dispose();
          puffs.splice(i, 1);
          continue;
        }
        p.sprite.position.y += p.vy * dt;
        p.sprite.position.x += p.drift * dt + Math.sin(p.life * 1.3) * 0.35 * dt;
        p.sprite.position.z += p.drift * 0.6 * dt;
        const s = p.size0 + (p.size1 - p.size0) * k;
        p.sprite.scale.set(s, s, 1);
        const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
        (p.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, fade * 0.94 * intensity);
      }
    },
  };
}

function buildBessYard(pcsColor: number): BessYardRefs {
  const g = new THREE.Group();

  const contGeo = new THREE.BoxGeometry(6.1, 2.9, 2.5);
  const contMat = new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.55, metalness: 0.15 });
  const containers = new THREE.InstancedMesh(contGeo, contMat, 8);
  containers.castShadow = true;
  containers.receiveShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < 8; i++) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    m.makeTranslation(col * 7.4 - 11.1, 1.7, row * 5.4 - 2.7);
    containers.setMatrixAt(i, m);
  }
  g.add(containers);

  const socBars = new THREE.Group();
  socBars.name = "socBars";
  for (let i = 0; i < 8; i++) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 0.5),
      new THREE.MeshStandardMaterial({
        color: 0x0c2b1e,
        emissive: new THREE.Color(0x2ecc71),
        emissiveIntensity: 1.2,
        side: THREE.DoubleSide,
      }),
    );
    bar.position.set(col * 7.4 - 11.1, 3.5, row * 5.4 - 2.7 + 1.26);
    socBars.add(bar);
  }
  g.add(socBars);

  const pcs = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 3),
    new THREE.MeshStandardMaterial({ color: pcsColor, roughness: 0.6, metalness: 0.3 }),
  );
  pcs.position.set(0, 1.5, 8);
  pcs.castShadow = true;
  g.add(pcs);

  return {
    group: g,
    socBars: socBars.children as THREE.Mesh[],
  };
}

function buildSubstation(): {
  group: THREE.Group;
  busGlow: THREE.MeshStandardMaterial;
  lineDisconnectors: THREE.Group[];
} {
  const g = new THREE.Group();
  g.name = "CRUCERO-220kV-B1";
  const porcelain = new THREE.MeshStandardMaterial({ color: INSULATOR, roughness: 0.72 });
  const galvanized = new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.45, metalness: 0.62 });
  const busGlow = new THREE.MeshStandardMaterial({
    color: ALU,
    roughness: 0.3,
    metalness: 0.85,
    emissive: new THREE.Color(0x000000),
  });

  const yard = new THREE.Mesh(
    new THREE.BoxGeometry(62, 0.22, 78),
    new THREE.MeshStandardMaterial({ color: 0x8e8b82, roughness: 1 }),
  );
  yard.position.set(0, 0.12, 8);
  yard.receiveShadow = true;
  g.add(yard);

  const addInsulator = (x: number, z: number, height = 8): THREE.Group => {
    const stack = new THREE.Group();
    const discs = 7;
    for (let k = 0; k < discs; k++) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.66, 0.34, 14), porcelain);
      disc.position.y = 0.8 + (k * height) / discs;
      stack.add(disc);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, height, 8), galvanized);
    cap.position.y = height / 2;
    stack.add(cap);
    stack.position.set(x, 0, z);
    g.add(stack);
    return stack;
  };

  const addConductor = (a: THREE.Vector3, b: THREE.Vector3, radius = 0.11, material = busGlow): THREE.Mesh => {
    const d = b.clone().sub(a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, d.length(), 8), material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    g.add(mesh);
    return mesh;
  };

  // Pórtico de llegada de la línea 220 kV: las tres fases terminan aquí.
  for (const x of [-11, 11]) {
    addConductor(new THREE.Vector3(x, 0, -26), new THREE.Vector3(x, 19, -26), 0.22, galvanized);
  }
  addConductor(new THREE.Vector3(-11, 19, -26), new THREE.Vector3(11, 19, -26), 0.24, galvanized);
  const stationLabel = makeTextSprite("CRUCERO 220 kV", "", "#39d3ff");
  stationLabel.position.set(0, 24, -20);
  stationLabel.scale.set(18, 5.6, 1);
  g.add(stationLabel);

  // Tres barras rígidas, una por fase, sobre aisladores de pedestal.
  const busZ = [6, 10, 14];
  busZ.forEach((z, phase) => {
    const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 48, 14), busGlow);
    bus.rotation.z = Math.PI / 2;
    bus.position.set(0, 10.5, z);
    bus.castShadow = true;
    bus.name = `bus-${"ABC"[phase]}`;
    g.add(bus);
    for (const x of [-19, 0, 19]) addInsulator(x, z, 9.8);
  });

  const lineDisconnectors: THREE.Group[] = [];
  [-6, 0, 6].forEach((x, phase) => {
    const phaseName = "ABC"[phase];
    const gantryPoint = new THREE.Vector3(x, 18.6, -26);
    const entryPoint = new THREE.Vector3(x, 9.3, -15);
    const sag = gantryPoint.clone().lerp(entryPoint, 0.5);
    sag.y -= 2.2;
    const cable = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(gantryPoint, sag, entryPoint), 18, 0.105, 7, false),
      busGlow,
    );
    cable.name = `line-conductor-${phaseName}`;
    g.add(cable);

    addInsulator(x, -15, 8.6);
    addInsulator(x, -9, 8.6);
    const pivot = new THREE.Group();
    pivot.position.set(x, 9.3, -15);
    pivot.name = `line-disconnector-${phaseName}`;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 6), busGlow);
    blade.position.z = 3;
    blade.name = `line-disconnector-blade-${phaseName}`;
    pivot.add(blade);
    g.add(pivot);
    lineDisconnectors.push(pivot);

    addConductor(new THREE.Vector3(x, 9.3, -9), new THREE.Vector3(x, 7.4, -5.5));
    const breakerTank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.98, 3.8, 16),
      new THREE.MeshStandardMaterial({ color: 0x45525e, roughness: 0.5, metalness: 0.4 }),
    );
    breakerTank.position.set(x, 2.1, -5.5);
    breakerTank.castShadow = true;
    breakerTank.name = `line-breaker-${phaseName}`;
    g.add(breakerTank);
    const breakerColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 5.1, 12), porcelain);
    breakerColumn.position.set(x, 6.3, -5.5);
    g.add(breakerColumn);

    // Transformador de corriente y conexión ascendente a la barra de su fase.
    addInsulator(x, 0.5, 7.8);
    addConductor(new THREE.Vector3(x, 8.2, -5.5), new THREE.Vector3(x, 8.2, 0.5));
    addConductor(new THREE.Vector3(x, 8.2, 0.5), new THREE.Vector3(x, 10.5, busZ[phase]));
  });

  // Dos transformadores de potencia con radiadores y bushings visibles.
  for (let i = 0; i < 2; i++) {
    const xfmr = new THREE.Group();
    xfmr.name = `power-transformer-T${i + 1}`;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(9, 6.5, 6.5),
      new THREE.MeshStandardMaterial({ color: 0x6f7d87, roughness: 0.52, metalness: 0.3 }),
    );
    body.position.y = 3.4;
    body.castShadow = true;
    xfmr.add(body);
    for (const side of [-1, 1]) {
      for (let r = -3; r <= 3; r++) {
        const radiator = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.8, 0.48), galvanized);
        radiator.position.set(side * 4.9, 3.3, r * 0.72);
        xfmr.add(radiator);
      }
    }
    for (let b = 0; b < 3; b++) {
      const bushing = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 4.1, 12), porcelain);
      bushing.position.set(-2.4 + b * 2.4, 8.2, 0);
      xfmr.add(bushing);
    }
    xfmr.position.set(-15 + i * 30, 0, 26);
    g.add(xfmr);
  }

  const loadArrow = new THREE.Mesh(
    new THREE.ConeGeometry(1.4, 4, 12),
    new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 }),
  );
  loadArrow.position.set(0, 2.4, 34);
  loadArrow.rotation.x = Math.PI;
  loadArrow.name = "loadArrow";
  g.add(loadArrow);
  const loadBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 30, 8),
    new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.6 }),
  );
  loadBase.rotation.x = Math.PI / 2;
  loadBase.position.set(0, 6, 20);
  g.add(loadBase);

  const tripPulse = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.18, 10, 48),
    new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0 }),
  );
  tripPulse.name = "tripPulse";
  tripPulse.rotation.x = Math.PI / 2;
  tripPulse.position.set(0, 9.5, 0);
  g.add(tripPulse);

  const voltPulse = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.18, 10, 48),
    new THREE.MeshBasicMaterial({ color: 0xff2fd6, transparent: true, opacity: 0 }),
  );
  voltPulse.name = "voltPulse";
  voltPulse.rotation.x = Math.PI / 2;
  voltPulse.position.set(0, 2, 34);
  g.add(voltPulse);

  return { group: g, busGlow, lineDisconnectors };
}

function buildSolarField(): THREE.Group {
  const g = new THREE.Group();
  const cols = 26;
  const rows = 13;
  const panelGeo = new THREE.BoxGeometry(4.6, 0.14, 2.8);
  const panelMat = new THREE.MeshStandardMaterial({ color: PANEL, roughness: 0.25, metalness: 0.6 });
  const panels = new THREE.InstancedMesh(panelGeo, panelMat, cols * rows);
  panels.castShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.42, 0, 0));
  const s = new THREE.Vector3(1, 1, 1);
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 150 + c * 13;
      const z = -430 + r * 24;
      m.compose(new THREE.Vector3(x, 1.7, z), q, s);
      panels.setMatrixAt(idx++, m);
    }
  }
  g.add(panels);
  return g;
}

function buildTransmissionLine(): { group: THREE.Group; curve: THREE.CurvePath<THREE.Vector3> } {
  const g = new THREE.Group();
  const towerCount = 14;
  const spacing = 105;
  const z0 = -70;

  const legGeo = new THREE.CylinderGeometry(0.16, 0.42, 24, 8);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x6f7d8a, roughness: 0.6, metalness: 0.5 });
  const legs = new THREE.InstancedMesh(legGeo, legMat, towerCount * 4);
  legs.castShadow = true;

  const armGeo = new THREE.BoxGeometry(13, 0.5, 0.5);
  const arms = new THREE.InstancedMesh(armGeo, legMat, towerCount * 2);

  const m = new THREE.Matrix4();
  let li = 0;
  let ai = 0;
  for (let t = 0; t < towerCount; t++) {
    const z = z0 - t * spacing;
    for (const [dx, dz] of [
      [-2.6, -2.6],
      [2.6, -2.6],
      [-2.6, 2.6],
      [2.6, 2.6],
    ]) {
      m.makeTranslation(dx, 12, z + dz);
      legs.setMatrixAt(li++, m);
    }
    m.makeTranslation(0, 21, z);
    arms.setMatrixAt(ai++, m);
    m.makeTranslation(0, 24.5, z);
    arms.setMatrixAt(ai++, m);
  }
  g.add(legs);
  g.add(arms);

  const phaseOffsets: Array<[number, number]> = [
    [-6, 21],
    [0, 24.8],
    [6, 21],
  ];
  const curve = new THREE.CurvePath<THREE.Vector3>();
  const linePositions: number[] = [];
  for (const [ox, oy] of phaseOffsets) {
    const phaseCurve = new THREE.CurvePath<THREE.Vector3>();
    // Terminal real en el pórtico de la subestación; desde aquí continúa la
    // catenaria hacia la primera torre y luego al equivalente de red.
    let prev = new THREE.Vector3(ox, 18.6, -26);
    for (let t = 0; t < towerCount; t++) {
      const z = z0 - t * spacing;
      const next = new THREE.Vector3(ox, oy, z);
      const mid = prev.clone().lerp(next, 0.5);
      mid.y -= 4.2;
      const bez = new THREE.QuadraticBezierCurve3(prev, mid, next);
      phaseCurve.add(bez);
      const pts = bez.getPoints(14);
      for (let i = 0; i < pts.length - 1; i++) {
        linePositions.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
      }
      prev = next;
    }
    if (ox === 0) {
      for (const c of phaseCurve.curves) curve.add(c);
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
  const lines = new THREE.LineSegments(
    lineGeo,
    new THREE.LineBasicMaterial({ color: 0x2c3e50, transparent: true, opacity: 0.85 }),
  );
  g.add(lines);

  const waveFront = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0 }),
  );
  waveFront.name = "waveFront";
  g.add(waveFront);

  return { group: g, curve };
}
