"use client";

import { useMemo, useRef, useState } from "react";
import { RoundedBox, Text, Float } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { MissionBriefing } from "@/lib/mission-types";
import { buildFindings } from "@/lib/briefing-narrative";
import {
  BriefPortalModals,
  type BriefSection,
} from "@/components/floating-cards";

type PortalDef = {
  section: BriefSection;
  title: string;
  line: string;
  accent: string;
  badge?: number;
  angle: number;
};

function PortalOrb({
  def,
  span,
  onOpen,
}: {
  def: PortalDef;
  span: number;
  onOpen: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const [hot, setHot] = useState(false);
  const r = span * 0.055;
  const ring = span * 0.32;
  const lift = span * 0.1;
  const pos: [number, number, number] = [
    Math.sin(def.angle) * ring,
    lift,
    Math.cos(def.angle) * ring,
  ];

  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.quaternion.copy(camera.quaternion);
    const s = hot ? 1.12 : 1;
    group.current.scale.lerp(new THREE.Vector3(s, s, s), Math.min(1, dt * 8));
  });

  return (
    <Float speed={1.4} rotationIntensity={0.15} floatIntensity={0.35}>
      <group ref={group} position={pos}>
        {/* Outer glow disc */}
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHot(true);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            setHot(false);
            document.body.style.cursor = "auto";
          }}
        >
          <circleGeometry args={[r * 1.05, 64]} />
          <meshBasicMaterial
            color={def.accent}
            transparent
            opacity={hot ? 0.35 : 0.18}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Glass face */}
        <mesh position={[0, 0, 0.01]}>
          <circleGeometry args={[r, 64]} />
          <meshStandardMaterial
            color="#0c1218"
            emissive={def.accent}
            emissiveIntensity={hot ? 0.55 : 0.28}
            metalness={0.7}
            roughness={0.22}
            toneMapped={false}
          />
        </mesh>

        {/* Neon ring */}
        <mesh position={[0, 0, 0.02]}>
          <ringGeometry args={[r * 0.88, r * 0.98, 64]} />
          <meshBasicMaterial color={def.accent} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>

        <Text
          position={[0, r * 0.28, 0.04]}
          fontSize={r * 0.16}
          color="#9aa8b2"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.12}
        >
          {def.title.toUpperCase()}
        </Text>
        <Text
          position={[0, -r * 0.02, 0.04]}
          fontSize={r * 0.28}
          color="#f2f6f8"
          anchorX="center"
          anchorY="middle"
          maxWidth={r * 1.6}
          textAlign="center"
        >
          {def.line}
        </Text>
        {def.badge != null && def.badge > 0 && (
          <Text
            position={[r * 0.55, r * 0.55, 0.05]}
            fontSize={r * 0.2}
            color={def.accent}
            anchorX="center"
            anchorY="middle"
          >
            {String(def.badge)}
          </Text>
        )}
        <Text
          position={[0, -r * 0.42, 0.04]}
          fontSize={r * 0.14}
          color={def.accent}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.16}
        >
          ENTER
        </Text>
      </group>
    </Float>
  );
}

function VerdictStamp({
  briefing,
  span,
  onOpen,
}: {
  briefing: MissionBriefing;
  span: number;
  onOpen: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const d = briefing.corridor.decision;
  const tone =
    d.verdict === "GO" ? "#2ee6a0" : d.verdict === "MARGINAL" ? "#ff9a2e" : "#ff3d32";
  const w = span * 0.28;
  const h = span * 0.1;

  useFrame(() => {
    if (group.current) group.current.quaternion.copy(camera.quaternion);
  });

  return (
    <Float speed={0.9} floatIntensity={0.25} rotationIntensity={0.08}>
      <group ref={group} position={[0, span * 0.22, 0]}>
        <RoundedBox
          args={[w, h, span * 0.02]}
          radius={span * 0.012}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          onPointerOver={() => {
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "auto";
          }}
        >
          <meshStandardMaterial
            color="#10161c"
            emissive={tone}
            emissiveIntensity={0.85}
            metalness={0.55}
            roughness={0.25}
            toneMapped={false}
          />
        </RoundedBox>
        <Text
          position={[0, h * 0.18, span * 0.014]}
          fontSize={span * 0.014}
          color="#b8c4cc"
          anchorX="center"
          letterSpacing={0.18}
        >
          VFR DECISION
        </Text>
        <Text
          position={[0, -h * 0.08, span * 0.014]}
          fontSize={span * 0.042}
          color="#ffffff"
          anchorX="center"
          letterSpacing={0.04}
        >
          {d.verdict.replace("_", "-")}
        </Text>
      </group>
    </Float>
  );
}

function RouteChip({ briefing, span }: { briefing: MissionBriefing; span: number }) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => {
    if (group.current) group.current.quaternion.copy(camera.quaternion);
  });
  const { origin, destination, aircraft, decision: d } = briefing.corridor;

  return (
    <group ref={group} position={[-span * 0.22, span * 0.26, span * 0.08]}>
      <RoundedBox args={[span * 0.22, span * 0.055, span * 0.012]} radius={span * 0.006}>
        <meshStandardMaterial
          color="#0e141a"
          emissive="#3ad7ff"
          emissiveIntensity={0.2}
          metalness={0.6}
          roughness={0.3}
          toneMapped={false}
        />
      </RoundedBox>
      <Text
        position={[0, span * 0.008, span * 0.01]}
        fontSize={span * 0.016}
        color="#f2f7f8"
        anchorX="center"
      >
        {`${origin.icao}  →  ${destination.icao}`}
      </Text>
      <Text
        position={[0, -span * 0.014, span * 0.01]}
        fontSize={span * 0.01}
        color="#8a9aa6"
        anchorX="center"
      >
        {`${aircraft.modelName} · ${d.groundSpeedKt} kt · ${d.estimatedTimeEnrouteMin} min`}
      </Text>
    </group>
  );
}

/** Cinematic in-world briefing — all portals are real Three.js meshes. */
export function BriefStage3D({
  briefing,
  span,
  onSection,
}: {
  briefing: MissionBriefing;
  span: number;
  onSection: (s: BriefSection) => void;
}) {
  const { decision: d, weather } = briefing.corridor;
  const notams = useMemo(() => {
    const findings = buildFindings(d, briefing.weatherIntel);
    return findings.filter((f) =>
      ["TFR/NOTAM", "TFR", "SIGMET", "G-AIRMET", "CWA", "PIREP"].includes(f.source)
    );
  }, [d, briefing.weatherIntel]);

  const portals: PortalDef[] = [
    {
      section: "notams",
      title: "Notams",
      line: notams.length ? `${notams.length} hazards` : "Clear",
      accent: "#ff9a2e",
      badge: notams.length || undefined,
      angle: -2.5,
    },
    {
      section: "adverse",
      title: "Status",
      line: d.verdict.replace("_", "-"),
      accent: d.verdict === "GO" ? "#2ee6a0" : d.verdict === "MARGINAL" ? "#ff9a2e" : "#ff3d32",
      badge: d.blockers.length || undefined,
      angle: -1.55,
    },
    {
      section: "forecast",
      title: "Forecasts",
      line: `${weather.origin.flightCategory}/${weather.destination.flightCategory}`,
      accent: "#4aa8ff",
      angle: -0.55,
    },
    {
      section: "weather",
      title: "Weather",
      line: `${weather.origin.windSpeedKt} kt wind`,
      accent: "#3ad7ff",
      angle: 0.55,
    },
    {
      section: "synopsis",
      title: "Perf",
      line: `${d.fuelRequiredGal} gal`,
      accent: "#c9d4dc",
      angle: 1.55,
    },
    {
      section: "charts",
      title: "Charts",
      line: "NOAA",
      accent: "#8b7cff",
      angle: 2.5,
    },
  ];

  return (
    <group>
      {/* Soft stage plate under the corridor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
        <circleGeometry args={[span * 0.7, 80]} />
        <meshStandardMaterial color="#070b10" roughness={1} metalness={0} />
      </mesh>

      <VerdictStamp briefing={briefing} span={span} onOpen={() => onSection("adverse")} />
      <RouteChip briefing={briefing} span={span} />
      {portals.map((p) => (
        <PortalOrb key={p.section} def={p} span={span} onOpen={() => onSection(p.section)} />
      ))}
    </group>
  );
}

/** DOM modals host — sibling of Canvas, not inside it */
export function BriefStageModals({
  briefing,
  section,
  onSection,
}: {
  briefing: MissionBriefing;
  section: BriefSection | null;
  onSection: (s: BriefSection | null) => void;
}) {
  return <BriefPortalModals briefing={briefing} section={section} onSection={onSection} />;
}
