// ==========================================================
// three-ambient.js — Hiệu ứng nền Three.js vanilla
// 3 effects: Particle Field (constellation), Floating Leaves, Topo Field
// ==========================================================
import * as THREE from 'three';

const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// =========================================
// EFFECT 1: Particle Field — hạt + đường nối
// =========================================
export function initParticleField(container) {
  if (reducedMotion()) return null;

  const w = container.clientWidth, h = container.clientHeight;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
  camera.position.z = 5;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0;';
  container.style.position = container.style.position || 'relative';
  container.insertBefore(renderer.domElement, container.firstChild);

  const count = 60;
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 6;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
    velocities.push({
      x: (Math.random() - 0.5) * 0.003,
      y: (Math.random() - 0.5) * 0.003,
      z: (Math.random() - 0.5) * 0.001,
    });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x2e5e3a,
    size: 0.035,
    transparent: true,
    opacity: 0.45,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  const lineMat = new THREE.LineBasicMaterial({
    color: 0x2e5e3a,
    transparent: true,
    opacity: 0.08,
  });

  let linesMesh = null;
  function updateLines() {
    if (linesMesh) {
      scene.remove(linesMesh);
      linesMesh.geometry.dispose();
    }
    const linePositions = [];
    const pos = geo.attributes.position.array;
    const maxDist = 1.8;
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const dx = pos[i * 3] - pos[j * 3];
        const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
        const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < maxDist * maxDist) {
          linePositions.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
          linePositions.push(pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]);
        }
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    linesMesh = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(linesMesh);
  }

  let frame = 0;
  let running = false;
  let rafId = null;

  function animate() {
    if (!running) return;
    rafId = requestAnimationFrame(animate);
    const pos = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      pos[i * 3] += velocities[i].x;
      pos[i * 3 + 1] += velocities[i].y;
      pos[i * 3 + 2] += velocities[i].z;
      if (Math.abs(pos[i * 3]) > 5) velocities[i].x *= -1;
      if (Math.abs(pos[i * 3 + 1]) > 3) velocities[i].y *= -1;
    }
    geo.attributes.position.needsUpdate = true;
    frame++;
    if (frame % 3 === 0) updateLines();
    renderer.render(scene, camera);
  }

  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !running) {
      running = true;
      animate();
    } else if (!entry.isIntersecting && running) {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
    }
  }, { threshold: 0.05 });
  observer.observe(container);

  window.addEventListener('resize', () => {
    const nw = container.clientWidth, nh = container.clientHeight;
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh);
  });

  return { renderer, scene };
}

// =========================================
// EFFECT 2: Floating Leaves
// =========================================
export function initFloatingLeaves(container) {
  if (reducedMotion()) return null;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 5;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0;opacity:0.6;';
  container.appendChild(renderer.domElement);

  function createLeafShape() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.08, 0.1, 0.12, 0.25, 0.05, 0.35);
    shape.bezierCurveTo(0.02, 0.4, 0, 0.38, -0.02, 0.35);
    shape.bezierCurveTo(-0.08, 0.25, -0.06, 0.1, 0, 0);
    return new THREE.ShapeGeometry(shape);
  }

  const leafCount = 12;
  const leaves = [];
  const greens = [0x2e5e3a, 0x3a7a4a, 0x4a8c5a, 0x5a9e6a, 0x2a5432];

  for (let i = 0; i < leafCount; i++) {
    const geo = createLeafShape();
    const mat = new THREE.MeshBasicMaterial({
      color: greens[i % greens.length],
      transparent: true,
      opacity: 0.25 + Math.random() * 0.2,
      side: THREE.DoubleSide,
    });
    const leaf = new THREE.Mesh(geo, mat);
    const s = 0.8 + Math.random() * 1.2;
    leaf.scale.set(s, s, s);
    leaf.position.set(
      (Math.random() - 0.5) * 10,
      5 + Math.random() * 5,
      (Math.random() - 0.5) * 3
    );
    leaf.userData = {
      fallSpeed: 0.004 + Math.random() * 0.006,
      rotSpeedX: (Math.random() - 0.5) * 0.015,
      rotSpeedZ: (Math.random() - 0.5) * 0.01,
      swayFreq: 0.3 + Math.random() * 0.7,
      swayAmp: 0.4 + Math.random() * 0.6,
      originX: leaf.position.x,
    };
    scene.add(leaf);
    leaves.push(leaf);
  }

  let t = 0;
  let running = true;
  let rafId = null;

  function animate() {
    if (!running) return;
    rafId = requestAnimationFrame(animate);
    t += 0.008;
    for (const leaf of leaves) {
      const d = leaf.userData;
      leaf.position.y -= d.fallSpeed;
      leaf.position.x = d.originX + Math.sin(t * d.swayFreq) * d.swayAmp;
      leaf.rotation.x += d.rotSpeedX;
      leaf.rotation.z += d.rotSpeedZ;
      if (leaf.position.y < -5) {
        leaf.position.y = 6 + Math.random() * 3;
        d.originX = (Math.random() - 0.5) * 10;
      }
    }
    renderer.render(scene, camera);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
    } else if (!running) {
      running = true;
      animate();
    }
  });

  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, stop: () => { running = false; } };
}

// =========================================
// EFFECT 4: Banner Particles — hạt lấp lánh trôi (bokeh/tuyết/hoa)
// Dùng cho banner dịp lễ. color: hex, snow: true = rơi thẳng xuống.
// =========================================
export function initBannerParticles(container, opts = {}) {
  if (!container || reducedMotion()) return null;
  const color = opts.color ?? 0xffffff;
  const snow = opts.snow ?? false;
  const count = opts.count ?? 90;

  let w = container.clientWidth || 1200;
  let h = container.clientHeight || 300;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
  camera.position.z = 6;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  container.appendChild(renderer.domElement);

  const RX = 9, RY = 3.4; // phạm vi phủ hạt
  const positions = new Float32Array(count * 3);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 2 * RX;
    const y = (Math.random() - 0.5) * 2 * RY;
    const z = (Math.random() - 0.5) * 3;
    positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
    parts.push({
      vy: -(0.004 + Math.random() * 0.012),
      swayFreq: 0.5 + Math.random() * 1.5,
      swayAmp: 0.15 + Math.random() * 0.5,
      baseX: x,
      twinkle: Math.random() * Math.PI * 2,
    });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Texture tròn mềm (glow) vẽ bằng canvas
  const tx = document.createElement('canvas'); tx.width = tx.height = 64;
  const ctx = tx.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const sprite = new THREE.CanvasTexture(tx);

  const mat = new THREE.PointsMaterial({
    color, size: snow ? 0.22 : 0.18, map: sprite,
    transparent: true, opacity: 0.9, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  let t = 0, running = false, rafId = null;
  function animate() {
    if (!running) return;
    rafId = requestAnimationFrame(animate);
    t += 0.016;
    const pos = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const p = parts[i];
      pos[i * 3 + 1] += p.vy;                       // trôi xuống
      pos[i * 3] = p.baseX + (snow ? Math.sin(t * p.swayFreq) * p.swayAmp
                                   : Math.sin(t * p.swayFreq + i) * p.swayAmp * 0.5);
      if (pos[i * 3 + 1] < -RY) {                   // vòng lại lên trên
        pos[i * 3 + 1] = RY;
        p.baseX = (Math.random() - 0.5) * 2 * RX;
      }
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = 0.75 + Math.sin(t * 1.5) * 0.12;  // nhấp nháy nhẹ
    renderer.render(scene, camera);
  }

  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) { running = true; animate(); }
    else if (!e.isIntersecting && running) { running = false; if (rafId) cancelAnimationFrame(rafId); }
  }, { threshold: 0.01 });
  io.observe(container);

  const onResize = () => {
    w = container.clientWidth || w; h = container.clientHeight || h;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  return {
    renderer, scene,
    destroy() {
      running = false; if (rafId) cancelAnimationFrame(rafId);
      io.disconnect(); window.removeEventListener('resize', onResize);
      renderer.dispose(); geo.dispose(); mat.dispose(); sprite.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.remove();
    },
  };
}

// =========================================
// EFFECT 3: Topo Field (wireframe sóng)
// =========================================
export function initTopoField(container) {
  if (reducedMotion()) return null;

  const w = container.clientWidth, h = container.clientHeight;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
  camera.position.set(0, 3, 5);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0;';
  container.style.position = container.style.position || 'relative';
  container.insertBefore(renderer.domElement, container.firstChild);

  const planeGeo = new THREE.PlaneGeometry(12, 8, 60, 40);
  planeGeo.rotateX(-Math.PI / 2);
  const planeMat = new THREE.MeshBasicMaterial({
    color: 0x2e5e3a,
    wireframe: true,
    transparent: true,
    opacity: 0.12,
  });
  const plane = new THREE.Mesh(planeGeo, planeMat);
  scene.add(plane);

  const posArr = planeGeo.attributes.position.array;
  const originalY = new Float32Array(posArr.length / 3);
  for (let i = 0; i < posArr.length / 3; i++) {
    originalY[i] = posArr[i * 3 + 1];
  }

  let t = 0;
  let running = false;
  let rafId = null;

  function animate() {
    if (!running) return;
    rafId = requestAnimationFrame(animate);
    t += 0.005;
    for (let i = 0; i < posArr.length / 3; i++) {
      const x = posArr[i * 3];
      const z = posArr[i * 3 + 2];
      posArr[i * 3 + 1] = originalY[i] + Math.sin(x * 0.5 + t) * 0.3 + Math.cos(z * 0.4 + t * 0.7) * 0.2;
    }
    planeGeo.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
  }

  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !running) {
      running = true;
      animate();
    } else if (!entry.isIntersecting && running) {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
    }
  }, { threshold: 0.05 });
  observer.observe(container);

  window.addEventListener('resize', () => {
    const nw = container.clientWidth, nh = container.clientHeight;
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh);
  });

  return { renderer, scene };
}
