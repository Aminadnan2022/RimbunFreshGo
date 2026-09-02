import { Canvas, useFrame } from '@react-three/fiber';
import { Float, RoundedBox, useTexture } from '@react-three/drei';
import { Component, Suspense, useRef, type ErrorInfo, type ReactNode } from 'react';
import type { Group } from 'three';

function Phone() {
  const phone = useRef<Group>(null);
  const appTexture = useTexture('/freshgo-shop-mobile.png');

  useFrame(({ pointer, clock }) => {
    if (!phone.current) return;
    phone.current.rotation.x += ((pointer.y * 0.035) - phone.current.rotation.x) * 0.035;
    phone.current.rotation.y += ((pointer.x * 0.09) - phone.current.rotation.y) * 0.035;
    phone.current.position.y = Math.sin(clock.elapsedTime * 0.65) * 0.07;
  });

  return (
    <group ref={phone} rotation={[-0.04, -0.18, 0.03]}>
      <RoundedBox args={[2.35, 4.65, 0.25]} radius={0.28} smoothness={5}>
        <meshStandardMaterial color="#071b15" metalness={0.78} roughness={0.19} />
      </RoundedBox>
      <RoundedBox args={[2.17, 4.43, 0.035]} radius={0.22} smoothness={5} position={[0, 0, 0.137]}>
        <meshStandardMaterial color="#f8f6ee" roughness={0.38} />
      </RoundedBox>
      <RoundedBox args={[0.67, 0.13, 0.04]} radius={0.07} smoothness={4} position={[0, 2.02, 0.17]}>
        <meshStandardMaterial color="#071b15" />
      </RoundedBox>

      <mesh position={[0, -0.02, 0.176]}>
        <planeGeometry args={[2.05, 4.18]} />
        <meshBasicMaterial map={appTexture} toneMapped={false} />
      </mesh>
    </group>
  );
}

function ProductBillboard({ src, width, height }: { src: string; width: number; height: number }) {
  const texture = useTexture(src);
  return (
    <mesh>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={1.7} />
      <directionalLight position={[4, 5, 5]} intensity={3.2} color="#fff9e9" />
      <pointLight position={[-4, 1, 3]} intensity={18} color="#43d68d" distance={8} />
      <Suspense fallback={null}>
        <Float speed={1.25} rotationIntensity={0.08} floatIntensity={0.22}>
          <Phone />
        </Float>
        <Float speed={1.05} rotationIntensity={0.18} floatIntensity={0.35}>
          <group position={[-2.2, 1.35, -0.3]} rotation={[0.1, -0.15, -0.15]}><ProductBillboard src="https://jypujsyiecgcjtjrqjfx.supabase.co/storage/v1/object/public/product-images/fish/siakap.webp" width={1.8} height={1.2} /></group>
        </Float>
        <Float speed={1.4} rotationIntensity={0.2} floatIntensity={0.42}>
          <group position={[2.05, 1.15, -0.1]} rotation={[0.05, 0.15, 0.18]}><ProductBillboard src="https://jypujsyiecgcjtjrqjfx.supabase.co/storage/v1/object/public/product-images/category-images/prawns/prawns-raw.webp" width={1.45} height={1.45} /></group>
        </Float>
        <Float speed={0.9} rotationIntensity={0.16} floatIntensity={0.32}>
          <group position={[1.95, -1.5, 0]} rotation={[0.05, 0.1, -0.12]}><ProductBillboard src="https://jypujsyiecgcjtjrqjfx.supabase.co/storage/v1/object/public/product-images/chicken/ayam-segar-2.webp" width={1.5} height={1.1} /></group>
        </Float>
        <mesh position={[0, -2.55, -0.4]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[2.1, 48]} />
          <meshBasicMaterial color="#082a20" transparent opacity={0.2} />
        </mesh>
      </Suspense>
    </>
  );
}

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('FreshGo 3D hero unavailable; using static fallback.', error, info);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function FreshGoHero3D() {
  const staticFallback = <div className="freshgo-real-phone" aria-hidden="true"><span className="freshgo-real-speaker" /><img src="/freshgo-shop-mobile.png" alt="" /></div>;

  return (
    <div className="freshgo-hero-visual" aria-label="FreshGo mobile shopping experience">
      <div className="freshgo-orbit freshgo-orbit-one" />
      <div className="freshgo-orbit freshgo-orbit-two" />
      <SceneBoundary fallback={staticFallback}>
        <div className="freshgo-webgl motion-safe:block motion-reduce:hidden">
          <Canvas
            camera={{ position: [0, 0, 7.5], fov: 42 }}
            dpr={[1, 1.5]}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          >
            <Scene />
          </Canvas>
        </div>
        <div className="hidden motion-reduce:block">{staticFallback}</div>
      </SceneBoundary>
      <div className="freshgo-float-label freshgo-label-market">Pasar Tani</div>
      <div className="freshgo-float-label freshgo-label-fresh">100% segar</div>
    </div>
  );
}
