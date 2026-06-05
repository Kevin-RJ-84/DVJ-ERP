"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Mesh } from "three";

function DiamondHero() {
  const meshRef = useRef<Mesh>(null);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.rotation.y += delta * 0.35;
    mesh.rotation.x = Math.sin(state.clock.elapsedTime * 0.35) * 0.12;
    mesh.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.08;
  });

  return (
    <mesh ref={meshRef} position={[0, -0.1, 0]}>
      <octahedronGeometry args={[1.05, 1]} />
      <meshPhysicalMaterial
        color="#dbeafe"
        roughness={0.14}
        metalness={0.12}
        transmission={0.88}
        thickness={1.4}
        ior={2.0}
        envMapIntensity={0.8}
        clearcoat={1}
        clearcoatRoughness={0.08}
      />
    </mesh>
  );
}

export function JewelryLoginScene() {
  const dpr = useMemo((): [number, number] => {
    if (typeof window === "undefined") return [1, 1.5];
    return window.innerWidth < 1024 ? [1, 1.25] : [1, 1.75];
  }, []);

  return (
    <div aria-hidden className="absolute inset-0 z-0 pointer-events-none">
      <Canvas dpr={dpr} camera={{ position: [0, 0, 3.2], fov: 42 }} gl={{ antialias: true }}>
        <color attach="background" args={["#000000"]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[2.5, 3, 2]} intensity={1.45} color="#fef3c7" />
        <directionalLight position={[-3, -1.5, 1.5]} intensity={0.9} color="#93c5fd" />
        <DiamondHero />
      </Canvas>
    </div>
  );
}

