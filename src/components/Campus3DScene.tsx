import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Compass, Layers } from 'lucide-react';

export interface CampusBuildingSelection {
  building: string;
  subtitle: string;
  sampleRoomId: string;
}

interface Campus3DSceneProps {
  compact?: boolean;
  openCountsByBuilding?: Record<string, number>;
  onSelectBuilding?: (selection: CampusBuildingSelection) => void;
}

interface CameraPreset {
  id: string;
  label: string;
  pos: [number, number, number];
  target: [number, number, number];
}

const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'overview', label: 'Overview', pos: [34, 26, 36], target: [0, 1.5, 0] },
  { id: 'main', label: 'Institute Building', pos: [14, 14, 22], target: [0, 2, 2] },
  { id: 'workshop', label: 'Workshop Block', pos: [-16, 13, -18], target: [-6, 1.5, -15] },
  { id: 'library', label: 'Library', pos: [26, 12, -10], target: [16, 2, -6] },
  { id: 'mba', label: 'MBA Block', pos: [-28, 12, 12], target: [-18, 2, 4] },
];

const _vec3 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

function createCourtTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0F2A38';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, 464, 464);
  ctx.beginPath();
  ctx.moveTo(24, 256);
  ctx.lineTo(488, 256);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(256, 256, 56, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createGroundGridTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#070B14';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  return tex;
}

export function Campus3DScene({
  compact = false,
  openCountsByBuilding = {},
  onSelectBuilding,
}: Campus3DSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const presetTargetRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; active: boolean }>({
    pos: new THREE.Vector3(34, 26, 36),
    target: new THREE.Vector3(0, 1.5, 0),
    active: false,
  });
  const requestRenderRef = useRef<(() => void) | null>(null);
  const onSelectRef = useRef(onSelectBuilding);
  onSelectRef.current = onSelectBuilding;

  const [activePreset, setActivePreset] = useState('overview');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  const selectPreset = (preset: CameraPreset) => {
    setActivePreset(preset.id);
    presetTargetRef.current.pos.set(...preset.pos);
    presetTargetRef.current.target.set(...preset.target);
    presetTargetRef.current.active = true;
    requestRenderRef.current?.();
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 420;
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070d);
    scene.fog = new THREE.FogExp2(0x05070d, 0.011);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 220);
    camera.position.set(34, 26, 36);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl && !reducedMotion;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.minDistance = 14;
    controls.maxDistance = 68;
    controls.target.set(0, 1.5, 0);

    // Lighting: warm directional sun + cool hemisphere fill + subtle rim
    const hemi = new THREE.HemisphereLight(0x7dd3fc, 0x0f172a, 0.75);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.65);
    keyLight.position.set(24, 34, 22);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -32;
    keyLight.shadow.camera.right = 32;
    keyLight.shadow.camera.top = 32;
    keyLight.shadow.camera.bottom = -32;
    keyLight.shadow.camera.near = 4;
    keyLight.shadow.camera.far = 90;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x8b5cf6, 0.55);
    rimLight.position.set(-28, 16, -24);
    scene.add(rimLight);

    // Shared materials (varied roughness/metalness per part)
    const groundTex = createGroundGridTexture();
    groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.92,
      metalness: 0.08,
    });
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.78,
      metalness: 0.12,
    });
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85,
      metalness: 0.18,
    });
    const roofTrimMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.42,
      metalness: 0.72,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0ea5e9,
      roughness: 0.12,
      metalness: 0.1,
      transmission: isSoftwareGl ? 0 : 0.45,
      transparent: true,
      opacity: isSoftwareGl ? 0.55 : 0.85,
      ior: 1.5,
      clearcoat: 1.0,
    });
    const accentCyanMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.65,
    });
    const accentAmberMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.55,
      roughness: 0.3,
      metalness: 0.5,
    });

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const clickableMeshes: THREE.Object3D[] = [];

    const registerBuilding = (
      group: THREE.Group,
      building: string,
      subtitle: string,
      sampleRoomId: string,
    ) => {
      group.userData = { building, subtitle, sampleRoomId };
      group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.userData = { building, subtitle, sampleRoomId };
          clickableMeshes.push(child);
        }
      });
      scene.add(group);
    };

    // 1) Institute Building (Main) — composite multi-wing 2-story academic group (9 parts)
    const mainGroup = new THREE.Group();
    const mainPlinth = new THREE.Mesh(new THREE.BoxGeometry(20, 0.6, 14), plinthMat);
    mainPlinth.position.y = 0.3;
    const centerBlock = new THREE.Mesh(new THREE.BoxGeometry(14, 4.2, 6), wallMat);
    centerBlock.position.set(0, 2.7, 0);
    const leftWing = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.8, 12), wallMat);
    leftWing.position.set(-7.5, 2.5, 1.5);
    const rightWing = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.8, 12), wallMat);
    rightWing.position.set(7.5, 2.5, 1.5);
    const gfGlassBand = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.9, 6.18), glassMat);
    gfGlassBand.position.set(0, 1.8, 0);
    const ffGlassBand = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.9, 6.18), glassMat);
    ffGlassBand.position.set(0, 3.6, 0);
    const foyerDome = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.6, 1.1, 16),
      glassMat,
    );
    foyerDome.position.set(0, 5.2, 0);
    const portico = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.4, 3.0), roofTrimMat);
    portico.position.set(0, 2.2, 4.1);
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.35, 6.4), roofTrimMat);
    parapet.position.set(0, 4.95, 0);
    mainGroup.add(
      mainPlinth,
      centerBlock,
      leftWing,
      rightWing,
      gfGlassBand,
      ffGlassBand,
      foyerDome,
      portico,
      parapet,
    );
    mainGroup.position.set(0, 0, 2);
    registerBuilding(
      mainGroup,
      'Institute Building',
      'Ground & First Floor · Classrooms, Smart Classes, Labs & Colloquium',
      'FF-CR-105',
    );

    // 2) Workshop Block (North of Main) — composite sawtooth-roof bay group (7 parts)
    const wsGroup = new THREE.Group();
    const wsPlinth = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 7), plinthMat);
    wsPlinth.position.y = 0.25;
    const wsBody = new THREE.Mesh(new THREE.BoxGeometry(13.2, 3.0, 6.2), wallMat);
    wsBody.position.y = 2.0;
    wsGroup.add(wsPlinth, wsBody);
    for (let i = -2; i <= 2; i++) {
      const bay = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 6.0, 3), roofTrimMat);
      bay.rotation.x = Math.PI / 2;
      bay.position.set(i * 2.5, 3.9, 0);
      wsGroup.add(bay);
    }
    wsGroup.position.set(-4, 0, -14);
    registerBuilding(
      wsGroup,
      'Workshop Block',
      'Ground Floor · Carpentry, Machine, Fitting & Smithy Shops',
      'WS-MACHINE',
    );

    // 3) Library Block (East) — rotunda + cantilevered canopy + louvers (5 parts)
    const libGroup = new THREE.Group();
    const libBase = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.5, 0.5, 24), plinthMat);
    libBase.position.y = 0.25;
    const libCore = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 3.6, 24), wallMat);
    libCore.position.y = 2.3;
    const libGlass = new THREE.Mesh(new THREE.CylinderGeometry(4.52, 4.52, 1.5, 24), glassMat);
    libGlass.position.y = 2.6;
    const libCanopy = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.1, 0.45, 24), roofTrimMat);
    libCanopy.position.y = 4.3;
    const libLantern = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.0, 0.7, 16), accentCyanMat);
    libLantern.position.y = 4.8;
    libGroup.add(libBase, libCore, libGlass, libCanopy, libLantern);
    libGroup.position.set(17, 0, -6);
    registerBuilding(
      libGroup,
      'Library',
      'Central Library & Digital E-Journal Zone',
      'LIB-MAIN',
    );

    // 4) MBA Block (West) — stepped academic block (5 parts)
    const mbaGroup = new THREE.Group();
    const mbaPlinth = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.5, 8.5), plinthMat);
    mbaPlinth.position.y = 0.25;
    const mbaLower = new THREE.Mesh(new THREE.BoxGeometry(8.6, 2.4, 7.6), wallMat);
    mbaLower.position.y = 1.7;
    const mbaUpper = new THREE.Mesh(new THREE.BoxGeometry(6.8, 2.0, 5.8), wallMat);
    mbaUpper.position.set(-0.4, 3.8, -0.4);
    const mbaGlass = new THREE.Mesh(new THREE.BoxGeometry(8.72, 1.0, 2.4), glassMat);
    mbaGlass.position.set(0, 1.9, 2.0);
    const mbaCap = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.3, 6.2), roofTrimMat);
    mbaCap.position.set(-0.4, 4.95, -0.4);
    mbaGroup.add(mbaPlinth, mbaLower, mbaUpper, mbaGlass, mbaCap);
    mbaGroup.position.set(-18, 0, 5);
    registerBuilding(
      mbaGroup,
      'MBA Block',
      'West Campus · Lecture Hall & Seminar Room',
      'MBA-MAIN',
    );

    // 5) Outdoor Courts & Amenities (Canteen + Badminton Court) (4 parts)
    const outdoorGroup = new THREE.Group();
    const courtTex = createCourtTexture();
    courtTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const courtSurface = new THREE.Mesh(
      new THREE.BoxGeometry(9.0, 0.16, 6.0),
      new THREE.MeshStandardMaterial({ map: courtTex, roughness: 0.72, metalness: 0.05 }),
    );
    courtSurface.position.set(13, 0.08, 12);
    const canteenBase = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.2, 4.8), wallMat);
    canteenBase.position.set(1, 1.1, 15);
    const canteenRoof = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.28, 5.6), roofTrimMat);
    canteenRoof.position.set(1, 2.35, 15);
    outdoorGroup.add(courtSurface, canteenBase, canteenRoof);
    registerBuilding(
      outdoorGroup,
      'Outdoor & Amenities',
      'Open Courts 1–6, Badminton Court, Canteen & Temple Precinct',
      'OUT-CANTEEN',
    );

    // Issue beacon markers above buildings with open issues
    const beaconConfigs: { building: string; pos: [number, number, number] }[] = [
      { building: 'Institute Building', pos: [0, 6.4, 2] },
      { building: 'Workshop Block', pos: [-4, 5.2, -14] },
      { building: 'Library', pos: [17, 5.8, -6] },
      { building: 'MBA Block', pos: [-18, 5.8, 5] },
      { building: 'Outdoor & Amenities', pos: [1, 3.6, 15] },
    ];

    const beacons: THREE.Mesh[] = [];
    const beaconGeo = new THREE.OctahedronGeometry(0.65, 0);
    beaconConfigs.forEach((cfg) => {
      const count = openCountsByBuilding[cfg.building] ?? 0;
      const mat = count > 6 ? accentAmberMat : accentCyanMat;
      const pin = new THREE.Mesh(beaconGeo, mat);
      pin.position.set(...cfg.pos);
      pin.userData.baseY = cfg.pos[1];
      scene.add(pin);
      beacons.push(pin);
    });

    // Instanced campus trees (>20 repeated instances with per-instance scale & tint)
    const treeCount = 34;
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1.1, 7);
    trunkGeo.translate(0, 0.55, 0);
    const canopyGeo = new THREE.ConeGeometry(0.95, 2.2, 8);
    canopyGeo.translate(0, 2.1, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3f2e21, roughness: 0.9 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);
    trunks.castShadow = !isSoftwareGl;
    canopies.castShadow = !isSoftwareGl;

    const palette = [new THREE.Color(0x0f766e), new THREE.Color(0x115e59), new THREE.Color(0x15803d)];
    for (let i = 0; i < treeCount; i++) {
      const angle = (i / treeCount) * Math.PI * 2;
      const radius = 23 + (i % 4) * 3.2;
      const tx = Math.cos(angle) * radius;
      const tz = Math.sin(angle) * radius * 0.82;
      const s = 0.85 + ((i * 17) % 30) / 100;
      _vec3.set(tx, 0, tz);
      _quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.7);
      _scale.set(s, s, s);
      _mat4.compose(_vec3, _quat, _scale);
      trunks.setMatrixAt(i, _mat4);
      canopies.setMatrixAt(i, _mat4);
      canopies.setColorAt(i, palette[i % palette.length]);
    }
    trunks.computeBoundingSphere();
    canopies.computeBoundingSphere();
    scene.add(trunks, canopies);

    // Pre-compile shaders on hardware WebGL
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Coalesced on-demand + animated transition render scheduler
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      gl.flush();
      const poll = () => {
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const requestRender = () => {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        renderDirty = false;
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        let animating = false;
        if (presetTargetRef.current.active) {
          const factor = 6.5;
          camera.position.x = THREE.MathUtils.damp(
            camera.position.x,
            presetTargetRef.current.pos.x,
            factor,
            dt,
          );
          camera.position.y = THREE.MathUtils.damp(
            camera.position.y,
            presetTargetRef.current.pos.y,
            factor,
            dt,
          );
          camera.position.z = THREE.MathUtils.damp(
            camera.position.z,
            presetTargetRef.current.pos.z,
            factor,
            dt,
          );
          controls.target.x = THREE.MathUtils.damp(
            controls.target.x,
            presetTargetRef.current.target.x,
            factor,
            dt,
          );
          controls.target.y = THREE.MathUtils.damp(
            controls.target.y,
            presetTargetRef.current.target.y,
            factor,
            dt,
          );
          controls.target.z = THREE.MathUtils.damp(
            controls.target.z,
            presetTargetRef.current.target.z,
            factor,
            dt,
          );

          if (camera.position.distanceTo(presetTargetRef.current.pos) < 0.08) {
            presetTargetRef.current.active = false;
          } else {
            animating = true;
          }
        }

        const t = now * 0.0018;
        beacons.forEach((b, idx) => {
          b.rotation.y = t + idx * 0.7;
          b.position.y = (b.userData.baseY as number) + Math.sin(t * 1.4 + idx) * 0.22;
        });

        const dampingChanged = controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || animating || dampingChanged) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    requestRenderRef.current = requestRender;
    requestRender();

    // Cancel camera preset flight if user grabs OrbitControls
    const onControlStart = () => {
      presetTargetRef.current.active = false;
    };
    const onControlChange = () => requestRender();
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('change', onControlChange);

    // Raycasting (throttled hover + click)
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let lastHover = 0;

    const updatePointer = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHover < 65) return;
      lastHover = now;
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const b = hits[0].object.userData.building as string;
        setHoveredName(b);
      } else {
        setHoveredName(null);
      }
    };

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const { building, subtitle, sampleRoomId } = hits[0].object.userData as CampusBuildingSelection;
        onSelectRef.current?.({ building, subtitle, sampleRoomId });
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove, { passive: true });
    renderer.domElement.addEventListener('click', onClick);

    // ResizeObserver for crisp layout
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(entry.contentRect.width, 1);
        const h = Math.max(entry.contentRect.height, 1);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        requestRender();
      }
    });
    ro.observe(container);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', onControlChange);
      controls.dispose();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else {
            m.material.dispose();
          }
        }
      });
      envTex.dispose();
      groundTex.dispose();
      courtTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [openCountsByBuilding]);

  if (webglFailed) {
    return (
      <div className="w-full h-full min-h-[360px] rounded-2xl bg-[#070B14] border border-white/10 flex flex-col items-center justify-center p-6 text-center gap-3">
        <Layers className="w-8 h-8 text-cyan-400" />
        <p className="text-sm font-medium text-white">MITS Gwalior Campus Map Preview</p>
        <p className="text-xs text-slate-400 max-w-sm">
          3D hardware acceleration is unavailable in this browser session. Use the interactive 2D floor plans below to pick any campus room.
        </p>
      </div>
    );
  }

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#05070D] ${compact ? 'h-[380px] sm:h-[440px]' : 'h-[calc(100vh-4rem)] min-h-[540px]'}`}>
      {/* Isolated WebGL mount container */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Top-left subtle building readout (solid rgba, no backdrop-filter over WebGL) */}
      <div
        className="pointer-events-none absolute top-4 left-4 z-10 px-3 py-1.5 rounded-xl border border-white/10 text-xs font-medium text-slate-200 flex items-center gap-2"
        style={{ backgroundColor: 'rgba(11, 16, 29, 0.9)' }}
      >
        <Compass className="w-3.5 h-3.5 text-cyan-400" />
        <span>{hoveredName ? `MITS · ${hoveredName}` : 'MITS Gwalior 3D Campus · Drag to orbit'}</span>
      </div>

      {/* Collapsible Bottom Control Dock (solid rgba, zero backdrop-filter over WebGL) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center max-w-[94vw]">
        <button
          type="button"
          onClick={() => setDockCollapsed((c) => !c)}
          className="px-3 py-1 rounded-t-xl border border-b-0 border-white/10 text-[11px] font-medium text-slate-300 hover:text-white flex items-center gap-1"
          style={{ backgroundColor: 'rgba(11, 16, 29, 0.94)' }}
        >
          {dockCollapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          <span>{dockCollapsed ? 'Show Controls' : 'Hide Controls'}</span>
        </button>

        {!dockCollapsed && (
          <div
            className="flex flex-wrap items-center justify-center gap-1.5 p-1.5 rounded-2xl border border-white/12 shadow-2xl"
            style={{ backgroundColor: 'rgba(11, 16, 29, 0.94)' }}
          >
            {CAMERA_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                data-sound="toggle"
                onClick={() => selectPreset(preset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  activePreset === preset.id
                    ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                    : 'text-slate-300 hover:text-white hover:bg-white/[0.06] border border-transparent'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
