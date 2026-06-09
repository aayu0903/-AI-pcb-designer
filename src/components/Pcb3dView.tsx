import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Component, TraceSegment, BoardSettings } from '../types';

interface Pcb3dViewProps {
  components: Component[];
  traces: TraceSegment[];
  settings: BoardSettings;
}

export const Pcb3dView: React.FC<Pcb3dViewProps> = ({ components, traces, settings }) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // --- 1. Scene Setup ---
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0d14');

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 80, 100);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't go below ground

    // --- 2. Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(40, 100, 50);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0x60a5fa, 0.5, 100);
    pointLight.position.set(-50, 20, -50);
    scene.add(pointLight);

    // --- 3. Board Geometry (FR4 substrate) ---
    const boardW = settings.width;
    const boardH = settings.height;
    const boardThickness = 1.6; // Standard PCB thickness in mm

    const boardGeo = new THREE.BoxGeometry(boardW, boardThickness, boardH);

    // Solder mask color mapping
    let maskColor = 0x0a4023; // Classic Green
    if (settings.solderMaskColor === 'black') maskColor = 0x111115;
    else if (settings.solderMaskColor === 'blue') maskColor = 0x0c2540;
    else if (settings.solderMaskColor === 'red') maskColor = 0x440a0c;

    const boardMat = new THREE.MeshStandardMaterial({
      color: maskColor,
      roughness: 0.25,
      metalness: 0.1,
    });
    const boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.receiveShadow = true;
    scene.add(boardMesh);

    // --- Helper to convert PCB 2D coordinates to Three.js coordinates ---
    // In 2D, (0,0) is top-left, x goes right, y goes down.
    // In Three.js, (0,0,0) is center. x goes right, z goes down (or up).
    // Let's translate:
    const get3DCoords = (pcbX: number, pcbY: number) => {
      const x3d = pcbX - boardW / 2;
      const z3d = pcbY - boardH / 2;
      return { x: x3d, z: z3d };
    };

    // --- 4. Render Copper Traces in 3D ---
    // Traces are drawn as thin lines or boxes on top/bottom surfaces of the board.
    traces.forEach(trace => {
      const ptA = get3DCoords(trace.x1, trace.y1);
      const ptB = get3DCoords(trace.x2, trace.y2);

      const dx = ptB.x - ptA.x;
      const dz = ptB.z - ptA.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);

      if (len === 0) return;

      const traceHeight = 0.05; // very thin
      const traceGeo = new THREE.BoxGeometry(len, traceHeight, trace.width);

      // Gold copper color for nice premium look
      const traceMat = new THREE.MeshStandardMaterial({
        color: trace.layer === 'top' ? 0xff4757 : 0x2e86de, // Red for top, Blue for bottom
        roughness: 0.1,
        metalness: 0.8,
      });

      const traceMesh = new THREE.Mesh(traceGeo, traceMat);
      // Position on top/bottom surface
      const yOffset = trace.layer === 'top' ? (boardThickness / 2 + traceHeight / 2) : -(boardThickness / 2 + traceHeight / 2);

      traceMesh.position.set(ptA.x + dx / 2, yOffset, ptA.z + dz / 2);
      traceMesh.rotation.y = -angle;
      scene.add(traceMesh);
    });

    // --- 5. Render Circular Solder Pads ---
    components.forEach(comp => {
      comp.pins.forEach(pin => {
        const rad = (comp.rotation * Math.PI) / 180;
        const rx = pin.pcbX * Math.cos(rad) - pin.pcbY * Math.sin(rad);
        const ry = pin.pcbX * Math.sin(rad) + pin.pcbY * Math.cos(rad);

        const pin3d = get3DCoords(comp.pcbX + rx, comp.pcbY + ry);
        const padHeight = 0.06;
        const padGeo = new THREE.CylinderGeometry(0.8, 0.8, padHeight, 16);
        const padMat = new THREE.MeshStandardMaterial({
          color: 0xe6a100, // Shiny Gold
          roughness: 0.1,
          metalness: 0.9,
        });

        const padMeshTop = new THREE.Mesh(padGeo, padMat);
        padMeshTop.position.set(pin3d.x, boardThickness / 2 + padHeight / 2, pin3d.z);
        scene.add(padMeshTop);

        const padMeshBottom = new THREE.Mesh(padGeo, padMat);
        padMeshBottom.position.set(pin3d.x, -(boardThickness / 2 + padHeight / 2), pin3d.z);
        scene.add(padMeshBottom);
      });
    });

    // --- 6. Render Procedural 3D Component Models ---
    components.forEach(comp => {
      const comp3D = get3DCoords(comp.pcbX, comp.pcbY);
      const rotRad = (comp.rotation * Math.PI) / 180;

      // Create component container group
      const compGroup = new THREE.Group();
      compGroup.position.set(comp3D.x, boardThickness / 2, comp3D.z);
      compGroup.rotation.y = -rotRad; // Apply rotation

      // Render model based on footprint
      if (comp.footprint === 'ESP32_SMD') {
        // ESP32 Main Black Board
        const mainGeo = new THREE.BoxGeometry(comp.pcbWidth, 0.8, comp.pcbHeight);
        const mainMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
        const mainMesh = new THREE.Mesh(mainGeo, mainMat);
        mainMesh.position.y = 0.4;
        compGroup.add(mainMesh);

        // Metal RF Shield Box
        const shieldGeo = new THREE.BoxGeometry(13, 2.0, 15);
        const shieldMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.9, roughness: 0.1 });
        const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
        shieldMesh.position.set(0, 1.4, -2);
        shieldMesh.castShadow = true;
        compGroup.add(shieldMesh);

        // PCB Antenna trace area (black/brown header)
        const antGeo = new THREE.BoxGeometry(16, 0.9, 4.5);
        const antMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
        const antMesh = new THREE.Mesh(antGeo, antMat);
        antMesh.position.set(0, 0.45, 9.5);
        compGroup.add(antMesh);
      } else if (comp.footprint.startsWith('R') || comp.footprint.startsWith('C') || comp.footprint.startsWith('LED')) {
        // Passive 0805 Resistor/Capacitor/LED
        // Body color
        let bodyColor = 0x222222; // Resistor: Charcoal
        if (comp.footprint.startsWith('C')) bodyColor = 0x8a6240; // Capacitor: Brownish
        else if (comp.footprint.startsWith('LED')) {
          bodyColor = comp.value === 'Green' ? 0x10b981 : (comp.value === 'Blue' ? 0x3b82f6 : 0xef4444); // LED emissive colors
        }

        const bodyGeo = new THREE.BoxGeometry(comp.pcbWidth * 0.6, 0.8, comp.pcbHeight * 0.9);
        const bodyMat = new THREE.MeshStandardMaterial({
          color: bodyColor,
          roughness: 0.3,
          emissive: comp.footprint.startsWith('LED') ? bodyColor : 0x000000,
          emissiveIntensity: comp.footprint.startsWith('LED') ? 0.8 : 0,
        });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = 0.4;
        bodyMesh.castShadow = true;
        compGroup.add(bodyMesh);

        // Metal solder caps on both ends
        const capGeo = new THREE.BoxGeometry(comp.pcbWidth * 0.2, 0.82, comp.pcbHeight * 0.95);
        const capMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });

        const cap1 = new THREE.Mesh(capGeo, capMat);
        cap1.position.set(-comp.pcbWidth * 0.4, 0.41, 0);
        compGroup.add(cap1);

        const cap2 = new THREE.Mesh(capGeo, capMat);
        cap2.position.set(comp.pcbWidth * 0.4, 0.41, 0);
        compGroup.add(cap2);
      } else if (comp.footprint === 'USB_C_16P') {
        // USB-C metallic receptacle
        const portGeo = new THREE.BoxGeometry(comp.pcbWidth, 3.2, comp.pcbHeight);
        const portMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.95, roughness: 0.05 });
        const portMesh = new THREE.Mesh(portGeo, portMat);
        portMesh.position.y = 1.6;
        portMesh.castShadow = true;
        compGroup.add(portMesh);

        // Inner plastic tongue
        const tongueGeo = new THREE.BoxGeometry(comp.pcbWidth - 2, 0.6, comp.pcbHeight - 1);
        const tongueMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
        const tongueMesh = new THREE.Mesh(tongueGeo, tongueMat);
        tongueMesh.position.set(0, 1.6, 0.5);
        compGroup.add(tongueMesh);
      } else if (comp.footprint === 'SOT23') {
        // SOT23 Transistor / Regulator (small 3-lead black box)
        const sotGeo = new THREE.BoxGeometry(comp.pcbWidth, 1.2, comp.pcbHeight);
        const sotMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
        const sotMesh = new THREE.Mesh(sotGeo, sotMat);
        sotMesh.position.y = 0.6;
        sotMesh.castShadow = true;
        compGroup.add(sotMesh);

        // 3 legs
        const legGeo = new THREE.BoxGeometry(0.5, 0.1, 1.2);
        const legMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.8 });

        const leg1 = new THREE.Mesh(legGeo, legMat);
        leg1.position.set(-0.95, 0.05, 0.85);
        compGroup.add(leg1);

        const leg2 = new THREE.Mesh(legGeo, legMat);
        leg2.position.set(0.95, 0.05, 0.85);
        compGroup.add(leg2);

        const leg3 = new THREE.Mesh(legGeo, legMat);
        leg3.position.set(0, 0.05, -0.85);
        compGroup.add(leg3);
      } else if (comp.footprint === 'DHT11_TH') {
        // DHT11 Sensor (Light Blue plastic body with grills)
        const dhtGeo = new THREE.BoxGeometry(comp.pcbWidth, 12, comp.pcbHeight);
        const dhtMat = new THREE.MeshStandardMaterial({ color: 0x54a0ff, roughness: 0.6 });
        const dhtMesh = new THREE.Mesh(dhtGeo, dhtMat);
        dhtMesh.position.y = 6.0;
        dhtMesh.castShadow = true;
        compGroup.add(dhtMesh);

        // Grill cuts lines
        const grillGeo = new THREE.BoxGeometry(comp.pcbWidth - 1, 0.4, 0.3);
        const grillMat = new THREE.MeshStandardMaterial({ color: 0x2e86de, roughness: 0.8 });
        for (let y = 2; y < 10; y += 1.8) {
          const grill = new THREE.Mesh(grillGeo, grillMat);
          grill.position.set(0, y, comp.pcbHeight / 2 - 0.1);
          compGroup.add(grill);
        }
      } else if (comp.footprint === 'OLED_I2C') {
        // 0.96" OLED module (Glass screen panel raised on 4 pins)
        // PCB base plate
        const baseGeo = new THREE.BoxGeometry(comp.pcbWidth, 0.8, comp.pcbHeight);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x0c1626, roughness: 0.8 });
        const baseMesh = new THREE.Mesh(baseGeo, baseMat);
        baseMesh.position.y = 0.4;
        compGroup.add(baseMesh);

        // Display glass panel raised
        const glassGeo = new THREE.BoxGeometry(comp.pcbWidth - 2, 0.4, comp.pcbHeight - 4);
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x030712, roughness: 0.1, metalness: 0.9 });
        const glassMesh = new THREE.Mesh(glassGeo, glassMat);
        glassMesh.position.set(0, 2.5, 1);
        glassMesh.castShadow = true;
        compGroup.add(glassMesh);

        // 4 supporting pin headers
        const headerGeo = new THREE.BoxGeometry(10, 2.0, 2.0);
        const headerMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 });
        const headerMesh = new THREE.Mesh(headerGeo, headerMat);
        headerMesh.position.set(0, 1.4, -comp.pcbHeight / 2 + 2);
        compGroup.add(headerMesh);
      } else if (comp.footprint === 'BUTTON_TH') {
        // Tactile switch (metallic frame, black body, circular actuator)
        const frameGeo = new THREE.BoxGeometry(6, 1.5, 6);
        const frameMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.9, roughness: 0.1 });
        const frameMesh = new THREE.Mesh(frameGeo, frameMat);
        frameMesh.position.y = 0.75;
        frameMesh.castShadow = true;
        compGroup.add(frameMesh);

        const bodyGeo = new THREE.BoxGeometry(5, 2.0, 5);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = 1.75;
        compGroup.add(bodyMesh);

        const actGeo = new THREE.CylinderGeometry(1.5, 1.5, 1.5, 12);
        const actMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 }); // dark gray button
        const actMesh = new THREE.Mesh(actGeo, actMat);
        actMesh.position.y = 3.0;
        compGroup.add(actMesh);
      } else if (comp.footprint === 'BATT_CONN') {
        // Battery JST connector (white plastic block)
        const jstGeo = new THREE.BoxGeometry(comp.pcbWidth, 4.0, comp.pcbHeight);
        const jstMat = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.6 });
        const jstMesh = new THREE.Mesh(jstGeo, jstMat);
        jstMesh.position.y = 2.0;
        jstMesh.castShadow = true;
        compGroup.add(jstMesh);
      }

      scene.add(compGroup);
    });

    // --- 7. Animation Loop ---
    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // --- 8. Window Resize Handler ---
    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // --- Cleanup ---
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      controls.dispose();
      renderer.dispose();
    };
  }, [components, traces, settings]);

  return (
    <div
      ref={mountRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        borderRadius: 8,
        overflow: 'hidden'
      }}
    >
      {/* Interaction Instruction Overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          pointerEvents: 'none',
          fontSize: '0.75rem',
          color: 'var(--text-muted)'
        }}
      >
        <div className="glass-panel" style={{ padding: '6px 10px' }}>
          Left Click + Drag to rotate • Right Click + Drag to pan • Scroll to zoom
        </div>
      </div>
    </div>
  );
};
