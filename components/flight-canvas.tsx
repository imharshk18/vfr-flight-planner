"use client";

import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Line } from "@react-three/drei";
import * as THREE from "three";
import type { FlightCorridor } from "@/lib/aviation-types";

// ---- Scale constants ----
const H_SCALE = 0.015; // Horizontal: NM to Three.js units
const V_SCALE = 0.0004; // Vertical: ft to Three.js units
const MAX_TOTAL_NM = 300;

function normalizeNm(nm: number): number {
  return (nm / MAX_TOTAL_NM) * 60;
}

// ---- Terrain ribbon mesh ----

function TerrainRibbon({ corridor }: { corridor: FlightCorridor }) {
  const points = corridor.terrainProfile;
  if (points.length < 2) return null;

  const totalNm = points[points.length - 1].distanceNm;

  const shape = useMemo(() => {
    const verts: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const width = 1.2;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const x = normalizeNm(p.distanceNm) - normalizeNm(totalNm / 2);
      const y = p.elevationFt * V_SCALE;
      // Two verts: left and right edge
      verts.push(x, y, -width / 2);
      verts.push(x, y, width / 2);
      // Color: gradient green to orange to red based on elevation
      const norm = Math.min(1, p.elevationFt / 12000);
      const r = norm;
      const g = 1 - norm * 0.7;
      const b = 0.1;
      colors.push(r, g, b, r, g, b);
    }

    for (let i = 0; i < points.length - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = (i + 1) * 2;
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
      // Bottom wall verts (ground)
      verts.push(verts[a * 3], 0, verts[a * 3 + 2]);
      verts.push(verts[b * 3], 0, verts[b * 3 + 2]);
      const wi = verts.length / 3 - 2;
      indices.push(a, c, wi);
      indices.push(c, wi + 1, wi);
      colors.push(0.06, 0.12, 0.06, 0.06, 0.12, 0.06);
    }

    return { verts, colors, indices };
  }, [points, totalNm]);

  return (
    <mesh>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array(shape.verts), 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[new Float32Array(shape.colors), 3]}
        />
        <bufferAttribute
          attach="index"
          args={[new Uint16Array(shape.indices), 1]}
        />
      </bufferGeometry>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.8} />
    </mesh>
  );
}

// ---- Ground plane ----

function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
      <planeGeometry args={[120, 20]} />
      <meshStandardMaterial color="#050a08" roughness={1} />
    </mesh>
  );
}

// ---- Cloud deck plane ----

function CloudDeckPlane({
  altFt,
  totalNm,
  color,
}: {
  altFt: number;
  totalNm: number;
  color: string;
}) {
  const y = altFt * V_SCALE;
  const halfLen = normalizeNm(totalNm / 2);
  return (
    <mesh position={[0, y, 0]} rotation={[0, 0, 0]}>
      <boxGeometry args={[halfLen * 2, 0.05, 6]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.18}
        depthWrite={false}
      />
    </mesh>
  );
}

// ---- Hazard wireframe box ----

function HazardBox({
  x,
  yMin,
  yMax,
  label,
}: {
  x: number;
  yMin: number;
  yMax: number;
  label: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.material = new THREE.MeshBasicMaterial({
        color: "#ef4444",
        wireframe: true,
        transparent: true,
        opacity: 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 4),
      });
    }
  });

  const height = yMax - yMin;
  const cy = yMin + height / 2;
  return (
    <group position={[x, cy, 0]}>
      <mesh ref={meshRef}>
        <boxGeometry args={[2, height, 5]} />
        <meshBasicMaterial color="#ef4444" wireframe transparent opacity={0.5} />
      </mesh>
      <Text
        position={[0, height / 2 + 0.3, 0]}
        fontSize={0.28}
        color="#ef4444"
        anchorX="center"
        anchorY="bottom"
      >
        {label}
      </Text>
    </group>
  );
}

// ---- TFR cylinder ----

function TfrCylinder({
  corridor,
  tfr,
  hasCollision,
}: {
  corridor: FlightCorridor;
  tfr: { id: string; name: string; centerLat: number; centerLon: number; radiusNm: number; floorMsl: number; ceilingMsl: number };
  hasCollision: boolean;
}) {
  const originLon = corridor.origin.lon;
  const originLat = corridor.origin.lat;
  const totalNm = corridor.terrainProfile[corridor.terrainProfile.length - 1]?.distanceNm || 100;
  const halfLen = normalizeNm(totalNm / 2);

  // Project TFR center onto corridor X axis by longitude
  const lonFraction =
    (tfr.centerLon - originLon) / (corridor.destination.lon - originLon || 1);
  const x = lonFraction * halfLen * 2 - halfLen;
  const yBottom = tfr.floorMsl * V_SCALE;
  const yTop = tfr.ceilingMsl * V_SCALE;
  const height = yTop - yBottom;
  const radius = Math.max(0.5, tfr.radiusNm * H_SCALE * 20);

  const groupRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (groupRef.current && hasCollision) {
      const t = clock.getElapsedTime();
      groupRef.current.children.forEach((c, i) => {
        if (i === 0) {
          (c as THREE.Mesh).material = new THREE.MeshBasicMaterial({
            color: "#ef4444",
            wireframe: true,
            transparent: true,
            opacity: 0.3 + 0.3 * Math.sin(t * 3),
          });
        }
      });
    }
  });

  return (
    <group ref={groupRef} position={[x, yBottom + height / 2, 0]}>
      <mesh>
        <cylinderGeometry args={[radius, radius, height, 16, 1, true]} />
        <meshBasicMaterial
          color={hasCollision ? "#ef4444" : "#f59e0b"}
          wireframe
          transparent
          opacity={hasCollision ? 0.5 : 0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh>
        <cylinderGeometry args={[radius, radius, height, 16, 1, false]} />
        <meshStandardMaterial
          color={hasCollision ? "#ef4444" : "#f59e0b"}
          transparent
          opacity={hasCollision ? 0.12 : 0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Text
        position={[0, height / 2 + 0.4, 0]}
        fontSize={0.22}
        color={hasCollision ? "#ef4444" : "#f59e0b"}
        anchorX="center"
        anchorY="bottom"
      >
        {`TFR: ${tfr.name.substring(0, 20)}`}
      </Text>
    </group>
  );
}

// ---- Flight path spline ----

function FlightPathSpline({
  corridor,
  progress,
}: {
  corridor: FlightCorridor;
  progress: number;
}) {
  const points = corridor.terrainProfile;
  const totalNm = points[points.length - 1]?.distanceNm || 100;
  const halfLen = normalizeNm(totalNm / 2);
  const cruiseY = corridor.cruiseAltitudeFt * V_SCALE;
  const originY = corridor.origin.elevationFt * V_SCALE + 0.3;
  const destY = corridor.destination.elevationFt * V_SCALE + 0.3;

  const splinePoints = useMemo(() => {
    const n = 32;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = t * halfLen * 2 - halfLen;
      // Profile: climb at first quarter, cruise, descend last quarter
      let y: number;
      if (t < 0.2) {
        y = originY + (cruiseY - originY) * (t / 0.2);
      } else if (t > 0.8) {
        y = cruiseY + (destY - cruiseY) * ((t - 0.8) / 0.2);
      } else {
        y = cruiseY;
      }
      pts.push(new THREE.Vector3(x, y, 0));
    }
    return pts;
  }, [halfLen, cruiseY, originY, destY]);

  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(splinePoints),
    [splinePoints]
  );

  const isViolation =
    corridor.decision.verdict === "NO_GO" || corridor.decision.blockers.length > 0;

  // Color segments: check each against cloud ceilings
  const segmentColors = useMemo(() => {
    return splinePoints.map((pt) => {
      const altFt = pt.y / V_SCALE;
      const violates = isViolation &&
        (altFt < corridor.decision.minTerrainClearanceFt + (Math.max(...(corridor.terrainProfile.map(p => p.elevationFt))) || 0) - 100);
      return violates ? new THREE.Color("#ef4444") : new THREE.Color("#06b6d4");
    });
  }, [splinePoints, isViolation, corridor]);

  // Aircraft position along spline
  const aircraftPos = useMemo(() => {
    return curve.getPoint(Math.min(0.99, progress / 100));
  }, [curve, progress]);

  const aircraftRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (aircraftRef.current) {
      const pos = curve.getPoint(Math.min(0.99, progress / 100));
      const tan = curve.getTangent(Math.min(0.99, progress / 100));
      aircraftRef.current.position.copy(pos);
      aircraftRef.current.lookAt(pos.clone().add(tan));
    }
  });

  return (
    <group>
      {/* Spline tube */}
      <mesh>
        <tubeGeometry args={[curve, 64, 0.04, 6, false]} />
        <meshStandardMaterial
          color={isViolation ? "#ef4444" : "#06b6d4"}
          emissive={isViolation ? "#7f1d1d" : "#0e4d5c"}
          emissiveIntensity={0.6}
          roughness={0.2}
        />
      </mesh>

      {/* Aircraft model */}
      <group ref={aircraftRef} position={[aircraftPos.x, aircraftPos.y, aircraftPos.z]}>
        {/* Fuselage */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.08, 0.6, 6]} />
          <meshStandardMaterial color="#e2e8f0" emissive="#334155" emissiveIntensity={0.3} />
        </mesh>
        {/* Wings */}
        <mesh position={[0, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[0.04, 0.04, 1.2]} />
          <meshStandardMaterial color="#cbd5e1" />
        </mesh>
        {/* Tail */}
        <mesh position={[-0.25, 0.12, 0]}>
          <boxGeometry args={[0.04, 0.25, 0.4]} />
          <meshStandardMaterial color="#cbd5e1" />
        </mesh>
        {/* Tail number billboard */}
        <Text
          position={[0, 0.35, 0]}
          fontSize={0.18}
          color="#06b6d4"
          anchorX="center"
          anchorY="bottom"
          renderOrder={10}
        >
          {`${corridor.aircraft.tailNumber} ${corridor.aircraft.modelName}`}
        </Text>
      </group>
    </group>
  );
}

// ---- Airport pillar ----

function AirportPillar({
  x,
  elevFt,
  icao,
  color,
}: {
  x: number;
  elevFt: number;
  icao: string;
  color: string;
}) {
  const pillarRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (pillarRef.current) {
      (pillarRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.5 + 0.5 * Math.abs(Math.sin(clock.getElapsedTime() * 2));
    }
  });

  const y = elevFt * V_SCALE;
  return (
    <group position={[x, 0, 0]}>
      <mesh ref={pillarRef} position={[0, y / 2 + 0.5, 0]}>
        <cylinderGeometry args={[0.06, 0.06, y + 1, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
      <Text position={[0, y + 1.3, 0]} fontSize={0.35} color={color} anchorX="center">
        {icao}
      </Text>
    </group>
  );
}

// ---- Peak beacon ----

function PeakBeacon({ x, elevFt }: { x: number; elevFt: number }) {
  const beaconRef = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (beaconRef.current) {
      beaconRef.current.intensity = 1.5 + 1.5 * Math.sin(clock.getElapsedTime() * 3);
    }
  });

  const y = elevFt * V_SCALE;
  return (
    <group position={[x, y, 0]}>
      <pointLight ref={beaconRef} color="#ef4444" intensity={1.5} distance={8} />
      <mesh>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} />
      </mesh>
    </group>
  );
}

// ---- Scene content ----

function SceneContent({
  corridor,
  progress,
}: {
  corridor: FlightCorridor;
  progress: number;
}) {
  const totalNm =
    corridor.terrainProfile[corridor.terrainProfile.length - 1]?.distanceNm || 100;
  const halfLen = normalizeNm(totalNm / 2);

  const maxTerrainPt = corridor.terrainProfile.reduce(
    (max, pt) => (pt.elevationFt > max.elevationFt ? pt : max),
    corridor.terrainProfile[0] || { distanceNm: 0, elevationFt: 0, lat: 0, lon: 0 }
  );

  // Cloud decks MSL
  const originCeilings = corridor.weather.origin.cloudDecks
    .filter((d) => d.coverage === "BKN" || d.coverage === "OVC")
    .map((d) => d.baseMslFt);
  const destCeilings = corridor.weather.destination.cloudDecks
    .filter((d) => d.coverage === "BKN" || d.coverage === "OVC")
    .map((d) => d.baseMslFt);

  // Check for cloud penetration conflict
  const isViolation = corridor.decision.verdict === "NO_GO";
  const allCeilings = [...originCeilings, ...destCeilings];
  const lowestCeilingMsl =
    allCeilings.length > 0 ? Math.min(...allCeilings) : Infinity;
  const hasCeilingConflict =
    isViolation &&
    lowestCeilingMsl < Infinity &&
    corridor.cruiseAltitudeFt > lowestCeilingMsl - 500;

  return (
    <>
      <ambientLight intensity={0.25} color="#1a2a3a" />
      <directionalLight
        position={[10, 20, 5]}
        intensity={1.0}
        color="#7eb8d4"
        castShadow
      />
      <pointLight position={[0, 15, 0]} intensity={0.5} color="#06b6d4" />

      <GroundPlane />
      <TerrainRibbon corridor={corridor} />

      {/* Origin pillar */}
      <AirportPillar
        x={-halfLen}
        elevFt={corridor.origin.elevationFt}
        icao={corridor.origin.icao}
        color="#06b6d4"
      />
      {/* Destination pillar */}
      <AirportPillar
        x={halfLen}
        elevFt={corridor.destination.elevationFt}
        icao={corridor.destination.icao}
        color="#06b6d4"
      />

      {/* Peak terrain beacon */}
      {maxTerrainPt && (
        <PeakBeacon
          x={normalizeNm(maxTerrainPt.distanceNm) - halfLen}
          elevFt={maxTerrainPt.elevationFt}
        />
      )}

      {/* Origin cloud deck */}
      {originCeilings.map((msl, i) => (
        <CloudDeckPlane
          key={`orig-cloud-${i}`}
          altFt={msl}
          totalNm={totalNm}
          color="#64748b"
        />
      ))}

      {/* Destination cloud deck */}
      {destCeilings.map((msl, i) => (
        <CloudDeckPlane
          key={`dest-cloud-${i}`}
          altFt={msl}
          totalNm={totalNm}
          color="#475569"
        />
      ))}

      {/* Hazard volume for cloud penetration */}
      {hasCeilingConflict && (
        <HazardBox
          x={0}
          yMin={(lowestCeilingMsl - 500) * V_SCALE}
          yMax={lowestCeilingMsl * V_SCALE}
          label="CLOUD VIOLATION"
        />
      )}

      {/* TFR cylinders */}
      {corridor.tfrs.map((tfr) => {
        const hasCollision = corridor.decision.blockers.some((b) =>
          b.includes(tfr.name)
        );
        return (
          <TfrCylinder
            key={tfr.id}
            corridor={corridor}
            tfr={tfr}
            hasCollision={hasCollision}
          />
        );
      })}

      {/* Flight path spline and aircraft */}
      <FlightPathSpline corridor={corridor} progress={progress} />

      {/* Cruise altitude reference plane */}
      <mesh
        position={[0, corridor.cruiseAltitudeFt * V_SCALE, 0]}
        rotation={[0, 0, 0]}
      >
        <boxGeometry args={[halfLen * 2, 0.01, 4]} />
        <meshStandardMaterial
          color="#06b6d4"
          transparent
          opacity={0.08}
          depthWrite={false}
        />
      </mesh>

      {/* Altitude label */}
      <Text
        position={[halfLen + 1.5, corridor.cruiseAltitudeFt * V_SCALE, 0]}
        fontSize={0.22}
        color="#06b6d4"
        anchorX="left"
      >
        {`${corridor.cruiseAltitudeFt.toLocaleString()} ft MSL`}
      </Text>
    </>
  );
}

// ---- Main Canvas export ----

export default function FlightCanvas({
  corridor,
  progress,
}: {
  corridor: FlightCorridor | null;
  progress: number;
}) {
  if (!corridor) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#070709]">
        <div className="text-center">
          <div className="text-cyan-400 text-xl font-mono mb-2">AEROTWIN 3D</div>
          <div className="text-slate-400 text-sm font-mono">
            Enter origin and destination airports to initialize corridor analysis
          </div>
        </div>
      </div>
    );
  }

  return (
    <Canvas
      camera={{ position: [0, 8, 28], fov: 45 }}
      gl={{ antialias: true, alpha: false }}
      style={{ background: "#070709" }}
    >
      <SceneContent corridor={corridor} progress={progress} />
      <OrbitControls
        maxPolarAngle={Math.PI / 2.05}
        minDistance={8}
        maxDistance={180}
        enablePan
        target={[0, 2, 0]}
      />
    </Canvas>
  );
}
