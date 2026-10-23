"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Line, Billboard, Text } from "@react-three/drei";
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import type { MissionBriefing } from "@/lib/mission-types";
import { worldPoint, type TerrainSurface, type SurfaceTile } from "@/lib/terrain-surface";

export type ViewMode = "orbit" | "explore" | "follow" | "profile";
export type SceneProps = {
  briefing: MissionBriefing;
  progress: number;
  view: ViewMode;
  clouds: boolean;
  exaggeration: number;
  reset: number;
  /** Start far out for the interactive briefing reveal */
  briefZoom?: boolean;
};

const FT_KM = 0.0003048;

function TerrainTile({
  tile,
  surface,
  exaggeration,
}: {
  tile: SurfaceTile;
  surface: TerrainSurface;
  exaggeration: number;
}) {
  const { geometry, texture } = useMemo(() => {
    const segments = 128;
    const size = surface.kmPerTile;
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let row = 0; row <= segments; row++) {
      for (let col = 0; col <= segments; col++) {
        const px = Math.min(255, Math.round((col / segments) * 255));
        const py = Math.min(255, Math.round((row / segments) * 255));
        positions.setY(
          row * (segments + 1) + col,
          (tile.heights[py * 256 + px] / 1000) * exaggeration
        );
      }
    }
    geometry.computeVertexNormals();
    const texture = tile.image ? new THREE.Texture(tile.image) : null;
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 16;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
    }
    return { geometry, texture };
  }, [tile, surface, exaggeration]);

  useEffect(
    () => () => {
      geometry.dispose();
      texture?.dispose();
    },
    [geometry, texture]
  );

  return (
    <mesh
      geometry={geometry}
      position={[
        (tile.x + 0.5 - surface.centerX) * surface.kmPerTile,
        0,
        (tile.y + 0.5 - surface.centerY) * surface.kmPerTile,
      ]}
      receiveShadow
    >
      <meshStandardMaterial
        map={texture}
        color={texture ? "#ffffff" : "#3d5c54"}
        roughness={0.82}
        metalness={0}
        // Prefer terrain over the floor plate; kills water-tile z-fighting flicker.
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

function softCloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 9; i++) {
    const cx = 180 + (i % 3) * 70 + Math.sin(i * 2.1) * 40;
    const cy = 220 + Math.floor(i / 3) * 55 + Math.cos(i * 1.7) * 35;
    const r = 90 + (i % 4) * 28;
    const g = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.35, "rgba(245,250,255,0.28)");
    g.addColorStop(0.7, "rgba(220,232,242,0.1)");
    g.addColorStop(1, "rgba(200,220,235,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function CloudLayers({
  briefing,
  exaggeration,
  showLabels,
}: {
  briefing: MissionBriefing;
  exaggeration: number;
  showLabels: boolean;
}) {
  const texture = useMemo(() => softCloudTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  const surface = briefing.surface!;
  const span = Math.max(surface.widthKm, surface.depthKm);
  const stations = [briefing.corridor.origin, briefing.corridor.destination];

  return (
    <group>
      {[briefing.corridor.weather.origin, briefing.corridor.weather.destination].flatMap(
        (weather, index) =>
          weather.cloudDecks
            .filter((d) => d.coverage !== "SKC")
            .slice(0, 2)
            .map((deck, layer) => {
              const [x, z] = worldPoint(surface, stations[index].lat, stations[index].lon);
              const altitude = deck.baseMslFt * FT_KM * exaggeration;
              const density =
                deck.coverage === "OVC"
                  ? 1
                  : deck.coverage === "BKN"
                  ? 0.75
                  : deck.coverage === "SCT"
                  ? 0.45
                  : 0.25;
              const count = Math.round(6 + density * 10);
              const radius = span * (0.18 + density * 0.12);
              const conflict =
                briefing.corridor.cruiseAltitudeFt > deck.baseMslFt - 500 ||
                (briefing.corridor.decision.cloudBufferFt !== 99999 &&
                  briefing.corridor.decision.cloudBufferFt < 500);
              return (
                <group key={`${index}-${layer}`}>
                  {Array.from({ length: count }, (_, i) => {
                    const seed = i * 17.13 + layer * 9.7 + index * 3.1;
                    const rx = Math.sin(seed) * radius * (0.35 + (i % 5) * 0.12);
                    const rz = Math.cos(seed * 1.3) * radius * (0.3 + (i % 4) * 0.14);
                    const size = radius * (0.55 + density * 0.35 + Math.sin(seed) * 0.12);
                    const yJitter = Math.sin(seed * 2.2) * 0.08 * exaggeration;
                    return (
                      <sprite
                        key={i}
                        position={[x + rx, altitude + yJitter, z + rz]}
                        scale={[size * 1.8, size * 0.55, 1]}
                      >
                        <spriteMaterial
                          map={texture}
                          transparent
                          opacity={(conflict ? 0.55 : 0.42) * (0.7 + density * 0.3)}
                          depthWrite={false}
                          color={conflict ? "#ffe4dc" : "#f4f8fc"}
                        />
                      </sprite>
                    );
                  })}
                  {showLabels && (
                    <Billboard position={[x + radius * 0.55, altitude + 0.15 * exaggeration, z]}>
                      <Text
                        fontSize={span * 0.011}
                        color={conflict ? "#ffb4a2" : "#e8f2f8"}
                        outlineWidth={span * 0.0004}
                        outlineColor="#0a1520"
                        anchorX="center"
                        anchorY="middle"
                      >
                        {`${deck.coverage} ${deck.baseMslFt.toLocaleString()} FT`}
                      </Text>
                    </Billboard>
                  )}
                </group>
              );
            })
      )}
    </group>
  );
}

function PathTube({
  points,
  color,
  radius,
}: {
  points: THREE.Vector3[];
  color: string;
  radius: number;
}) {
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, Math.max(40, points.length * 4), radius, 10, false);
  }, [points, radius]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.55}
        roughness={0.35}
        metalness={0.15}
        transparent
        opacity={0.92}
      />
    </mesh>
  );
}

function Airplane({
  position,
  direction,
  size,
}: {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  size: number;
}) {
  const group = useRef<THREE.Group>(null);
  const lookTarget = useRef(new THREE.Vector3());
  useFrame(() => {
    if (!group.current) return;
    group.current.position.copy(position);
    // Three.js lookAt aims local −Z (our nose) at the target, keeping wings level to +Y.
    const dir = direction.lengthSq() > 1e-10 ? direction : new THREE.Vector3(0, 0, -1);
    lookTarget.current.copy(position).add(dir);
    group.current.up.set(0, 1, 0);
    group.current.lookAt(lookTarget.current);
  });
  return (
    <group ref={group} scale={size}>
      <mesh scale={[0.16, 0.18, 0.85]}>
        <sphereGeometry args={[1, 20, 16]} />
        <meshStandardMaterial color="#e9f5fa" metalness={0.5} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.05, -0.18]} scale={[0.145, 0.17, 0.3]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#13394b" metalness={0.8} roughness={0.15} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[2.5, 0.045, 0.35]} />
        <meshStandardMaterial color="#f2f5f3" metalness={0.4} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.02, 0.58]}>
        <boxGeometry args={[0.9, 0.04, 0.22]} />
        <meshStandardMaterial color="#d4e8ee" />
      </mesh>
      <mesh position={[0, 0.22, 0.6]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[0.045, 0.4, 0.25]} />
        <meshStandardMaterial color="#f19a55" />
      </mesh>
      <pointLight position={[0, 0.3, 0]} intensity={0.6} distance={size * 40} color="#9be2db" />
    </group>
  );
}

function FlightWorld({
  briefing,
  progress,
  view,
  clouds,
  exaggeration,
  reset,
  briefZoom = true,
}: SceneProps) {
  const { camera } = useThree();
  const controls = useRef<OrbitControlsType>(null);
  const followLook = useRef(new THREE.Vector3());
  const surface = briefing.surface!;
  const span = Math.max(surface.widthKm, surface.depthKm);
  const verdict = briefing.corridor.decision.verdict;
  const ambience =
    verdict === "GO"
      ? { bg: "#6aa8c8", fog: "#8ec0d8", path: "#3ad7ff" }
      : verdict === "MARGINAL"
      ? { bg: "#b8a878", fog: "#c8b888", path: "#ff9a2e" }
      : { bg: "#7a8a98", fog: "#9aa8b4", path: "#ff3d32" };

  const path = useMemo(() => {
    const profile = briefing.flightProfile?.samples;
    return briefing.corridor.terrainProfile.map((p, idx) => {
      const [x, z] = worldPoint(surface, p.lat, p.lon);
      const altFt =
        profile?.[Math.min(idx, (profile?.length || 1) - 1)]?.altitudeFt ??
        briefing.corridor.cruiseAltitudeFt;
      return new THREE.Vector3(x, altFt * FT_KM * exaggeration, z);
    });
  }, [briefing, surface, exaggeration]);

  const ground = useMemo(
    () =>
      briefing.corridor.terrainProfile.map((p) => {
        const [x, z] = worldPoint(surface, p.lat, p.lon);
        return new THREE.Vector3(x, p.elevationFt * FT_KM * exaggeration + 0.02, z);
      }),
    [briefing, surface, exaggeration]
  );

  const f = progress * (path.length - 1);
  const i = Math.min(path.length - 2, Math.max(0, Math.floor(f)));
  const point = path[i].clone().lerp(path[i + 1], f - i);
  const direction = path[i + 1].clone().sub(path[i]);

  useEffect(() => {
    if (!path.length) return;
    const mid = path[Math.floor(path.length / 2)];
    if (view === "profile") {
      const routeDir = path.at(-1)!.clone().sub(path[0]).setY(0).normalize();
      const side = new THREE.Vector3(-routeDir.z, 0, routeDir.x);
      camera.position.copy(mid.clone().addScaledVector(side, span * 0.78).add(new THREE.Vector3(0, span * 0.16, 0)));
      camera.lookAt(mid);
      controls.current?.target.copy(mid);
    } else if (view === "follow") {
      const dir = direction.clone().normalize();
      camera.position.copy(
        point.clone().addScaledVector(dir, -span * 0.1).add(new THREE.Vector3(0, span * 0.045, 0))
      );
      followLook.current.copy(point.clone().addScaledVector(dir, span * 0.06));
      camera.lookAt(followLook.current);
    } else if (view === "explore") {
      // Free 3D — set framing once per enter/reset; do not fight OrbitControls.
      camera.position.set(span * 0.42, span * 0.28, span * 0.55);
      camera.lookAt(mid);
      controls.current?.target.copy(mid);
    } else {
      // Cockpit brief: corridor centered in the Cessna windshield hole
      const dist = briefZoom ? 0.62 : 0.38;
      const elev = briefZoom ? 0.28 : 0.42;
      camera.position.set(span * dist * 0.35, span * dist * elev, span * dist * 0.85);
      const look = new THREE.Vector3(0, Math.max(span * 0.02, mid.y * 0.22), -span * 0.02);
      camera.lookAt(look);
      controls.current?.target.copy(look);
    }
    controls.current?.update();
    // Explore: only re-frame on view/reset — path identity changes must not steal the camera.
    // Follow: omit point/direction so progress ticks don't fight playback lerp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    camera,
    span,
    view,
    reset,
    briefing.corridor.cruiseAltitudeFt,
    exaggeration,
    briefZoom,
    view === "explore" ? reset : path,
  ]);

  useFrame((_, delta) => {
    if (!controls.current) return;
    if (view !== "follow") return;
    const dir = direction.clone().normalize();
    const desired = point
      .clone()
      .addScaledVector(dir, -span * 0.11)
      .add(new THREE.Vector3(span * 0.02, span * 0.048, span * 0.01));
    camera.position.lerp(desired, 1 - Math.exp(-delta * 2.8));
    followLook.current.lerp(
      point.clone().addScaledVector(dir, span * 0.065),
      1 - Math.exp(-delta * 2.2)
    );
    camera.lookAt(followLook.current);
  });

  const color = ambience.path;
  const ribbonStep = Math.max(1, Math.floor(path.length / 12));

  return (
    <>
      <color attach="background" args={[ambience.bg]} />
      <fog attach="fog" args={[ambience.fog, span * 1.1, span * 2.8]} />
      <ambientLight intensity={1.35} />
      <hemisphereLight args={[ambience.bg, "#3d4a3a", 0.95]} />
      <directionalLight
        position={[span * 0.55, span * 1.2, span * 0.3]}
        intensity={2.6}
        color="#fff6e8"
        castShadow
      />
      {/* Floor well below sea level so flat water tiles never depth-fight it */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -Math.max(0.35, span * 0.012), 0]} receiveShadow>
        <circleGeometry args={[span * 0.85, 64]} />
        <meshStandardMaterial
          color={ambience.bg}
          roughness={1}
          metalness={0}
          depthWrite={false}
        />
      </mesh>

      {surface.tiles.map((tile) => (
        <TerrainTile
          key={`${tile.x}/${tile.y}`}
          tile={tile}
          surface={surface}
          exaggeration={exaggeration}
        />
      ))}

      <Line points={ground} color="#c5f4e7" lineWidth={1} transparent opacity={0.35} dashed dashSize={0.2} gapSize={0.18} />
      <PathTube points={path} color={color} radius={span * 0.0018} />
      <Line points={path} color={color} lineWidth={10} transparent opacity={0.12} />

      {path
        .filter((_, n) => n % ribbonStep === 0)
        .map((p, n) => (
          <Line
            key={n}
            points={[
              [p.x, Math.max(0.02, ground[Math.min(ground.length - 1, n * ribbonStep)]?.y ?? 0.02), p.z],
              p,
            ]}
            color={color}
            lineWidth={0.8}
            transparent
            opacity={0.28}
          />
        ))}

      {[briefing.corridor.origin, briefing.corridor.destination].map((a, index) => {
        const [x, z] = worldPoint(surface, a.lat, a.lon);
        const y = a.elevationFt * FT_KM * exaggeration;
        const pathIdx = index ? path.length - 1 : 0;
        const rwy = index
          ? briefing.corridor.decision.recommendedArrRunway
          : briefing.corridor.decision.recommendedDepRunway;
        // Short beacons — DEP mint / ARR amber (old poles were span-scaled skyscrapers)
        const marker = index ? "#ffb14a" : "#5ef0d0";
        const poleH = Math.min(0.55, Math.max(0.18, span * 0.0035));
        return (
          <group key={a.icao}>
            <mesh position={[x, y + 0.04, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[span * 0.008, span * 0.012, 48]} />
              <meshBasicMaterial color={marker} side={THREE.DoubleSide} transparent opacity={0.95} />
            </mesh>
            <mesh position={[x, y + poleH * 0.5, z]}>
              <cylinderGeometry args={[span * 0.0007, span * 0.0011, poleH, 10]} />
              <meshStandardMaterial color={marker} emissive={marker} emissiveIntensity={0.55} />
            </mesh>
            {view !== "follow" && (
              <Billboard position={[x, path[pathIdx].y + span * 0.025, z]}>
                <Text
                  fontSize={span * 0.011}
                  color={marker}
                  outlineWidth={span * 0.0006}
                  outlineColor="#0a1520"
                  anchorX="center"
                  anchorY="bottom"
                >
                  {`${index ? "ARR" : "DEP"} ${a.icao}${rwy ? ` RWY ${rwy}` : ""}`}
                </Text>
              </Billboard>
            )}
          </group>
        );
      })}

      {view !== "follow" && briefing.flightProfile &&
        (() => {
          const samples = briefing.flightProfile.samples;
          const markers: Array<{ label: string; i: number }> = [];
          const climbI = samples.findIndex((s) => s.phase === "climb");
          const cruiseI = samples.findIndex((s) => s.phase === "cruise");
          const descI = samples.findIndex((s) => s.phase === "descent");
          if (climbI >= 0) markers.push({ label: "CLIMB OUT", i: climbI });
          if (cruiseI >= 0) markers.push({ label: "TOP OF CLIMB", i: cruiseI });
          if (descI >= 0) markers.push({ label: "TOP OF DESCENT", i: descI });
          return markers.map((m) => {
            const p = path[Math.min(m.i, path.length - 1)];
            return (
              <Billboard key={m.label} position={[p.x, p.y + span * 0.02, p.z]}>
                <Text
                  fontSize={span * 0.009}
                  color="#b8f2ed"
                  outlineWidth={span * 0.0005}
                  outlineColor="#0a1520"
                  anchorX="center"
                  anchorY="bottom"
                >
                  {m.label}
                </Text>
              </Billboard>
            );
          });
        })()}

      {clouds && (
        <CloudLayers
          briefing={briefing}
          exaggeration={exaggeration}
          showLabels={view !== "follow"}
        />
      )}
      <Airplane position={point} direction={direction} size={span * 0.009} />

      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enabled={view !== "follow"}
        enableRotate={view !== "follow"}
        enableZoom={view !== "follow"}
        enablePan={view === "explore" || view === "profile"}
        screenSpacePanning={view === "explore"}
        autoRotate={false}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={span * 0.06}
        maxDistance={span * 2.4}
      />

      {/* Soft cinematic grade through the windshield */}
      {briefZoom && view === "orbit" && (
        <EffectComposer multisampling={4} enableNormalPass={false}>
          <Bloom
            mipmapBlur
            intensity={0.75}
            luminanceThreshold={0.45}
            luminanceSmoothing={0.45}
          />
          <ChromaticAberration
            blendFunction={BlendFunction.NORMAL}
            offset={new THREE.Vector2(0.0004, 0.0004)}
          />
          <Noise opacity={0.025} />
          <Vignette eskil={false} offset={0.22} darkness={0.75} />
        </EffectComposer>
      )}
    </>
  );
}

export default function FlightScene(props: SceneProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [30, 18, 40], near: 0.15, far: 8000, fov: 48 }}
      gl={{
        antialias: true,
        alpha: false,
        logarithmicDepthBuffer: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.08,
        powerPreference: "high-performance",
      }}
      style={{ width: "100%", height: "100%", display: "block" }}
      fallback={
        <div className="scene-failure">
          This view needs WebGL. In Chrome: Settings → System → Use hardware acceleration → reload.
        </div>
      }
    >
      <FlightWorld {...props} />
    </Canvas>
  );
}

