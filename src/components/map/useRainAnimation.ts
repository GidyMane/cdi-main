import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from "geojson";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RainyDistrict {
  /** District name — must match the `name` property in your GeoJSON features */
  name: string;
  /** Mean rainfall in mm — used to pick drop colour */
  meanMm: number;
  /** 0–100: percentage of district area that is rainy — controls drop density */
  rainyPct?: number;
}

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
  opacity: number;
  angle: number;
}

interface RainZone {
  /** Original GeoJSON geometry — kept so we can reproject every frame */
  geometry: Polygon | MultiPolygon;
  r: number;
  g: number;
  b: number;
  drops: RainDrop[];
  /** Normalised drop positions in [0,1] relative to the geo bounding box.
   *  We store these so drops survive pan/zoom without resetting. */
  normDrops: { nx: number; ny: number }[];
}

// ── Colour ramp ───────────────────────────────────────────────────────────────

function rainColor(meanMm: number): [number, number, number] {
  if (meanMm >= 300) return [3,   20,  58];
  if (meanMm >= 150) return [8,   48,  107];
  if (meanMm >= 50)  return [33,  113, 181];
  if (meanMm >= 10)  return [107, 174, 214];
  return                    [198, 219, 239];
}

// ── Coordinate helpers ────────────────────────────────────────────────────────

/** Convert a GeoJSON [lon, lat] ring to canvas pixel points */
function ringToPixels(ring: number[][], map: L.Map): [number, number][] {
  return ring.map(([lon, lat]) => {
    const pt = map.latLngToContainerPoint(L.latLng(lat, lon));
    return [pt.x, pt.y];
  });
}

/** Build a Path2D clipping path for a Polygon or MultiPolygon geometry */
function geomToPath(geometry: Polygon | MultiPolygon, map: L.Map): Path2D {
  const path = new Path2D();

  const addRing = (ring: number[][]) => {
    const pts = ringToPixels(ring, map);
    if (!pts.length) return;
    path.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
    path.closePath();
  };

  if (geometry.type === "Polygon") {
    geometry.coordinates.forEach(addRing);
  } else {
    geometry.coordinates.forEach((poly) => poly.forEach(addRing));
  }

  return path;
}

/** Pixel bounding box of a geometry at the current map view */
function geomPixelBbox(geometry: Polygon | MultiPolygon, map: L.Map) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const check = ([lon, lat]: number[]) => {
    const pt = map.latLngToContainerPoint(L.latLng(lat, lon));
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  };

  const outerRing = (rings: number[][][]) => rings[0]?.forEach(check);

  if (geometry.type === "Polygon") {
    outerRing(geometry.coordinates);
  } else {
    geometry.coordinates.forEach((poly) => outerRing(poly));
  }

  return { minX, minY, maxX, maxY };
}

// ── Drop factory ──────────────────────────────────────────────────────────────

function newNormDrop(): { nx: number; ny: number } {
  return {
    nx: Math.random(),
    // start above the top of the bbox (negative normalised y)
    ny: -(Math.random() * 0.5),
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRainAnimation(
  mapRef: React.RefObject<L.Map | null>,
  geoData: FeatureCollection | null | undefined,
) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const zonesRef    = useRef<RainZone[]>([]);
  const frameRef    = useRef<number | null>(null);
  const enabledRef  = useRef(true);

  // ── Build a lookup: lowercase district name → GeoJSON feature ──────────────
  const buildByName = useCallback(() => {
    if (!geoData?.features) return {} as Record<string, Feature>;
    const byName: Record<string, Feature> = {};
    geoData.features.forEach((f) => {
      const p = f.properties ?? {};
      const n = (
        p.name ?? p.Name ?? p.NAME ??
        p.DNAME2019 ?? p.dname2019 ??
        p.district_name ?? p.DISTRICT ??
        p.ADM2_EN ?? p.adm2_en ?? ""
      ).toLowerCase().trim() as string;
      if (n) byName[n] = f;
    });
    return byName;
  }, [geoData]);

  // ── Sync canvas size to its CSS size ──────────────────────────────────────
  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { offsetWidth: w, offsetHeight: h } = canvas;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }
  }, []);

  // ── Build zones from a list of rainy districts ────────────────────────────
  const setRainyDistricts = useCallback(
    (districts: RainyDistrict[]) => {
      if (!districts.length) {
        zonesRef.current = [];
        return;
      }

      const byName = buildByName();
      const zones: RainZone[] = [];

      districts.forEach((d) => {
        const key  = d.name.toLowerCase().trim();
        const feat = byName[key];
        if (!feat) return;

        const geom = feat.geometry as Polygon | MultiPolygon;
        if (geom.type !== "Polygon" && geom.type !== "MultiPolygon") return;

        const [r, g, b] = rainColor(d.meanMm);
        const pct   = d.rainyPct ?? 60;
        const count = Math.max(3, Math.round((pct / 100) * 40));

        // Normalised drop positions — independent of current pixel coords
        const normDrops = Array.from({ length: count }, newNormDrop);

        // Also keep pixel drops for the animation loop (rebuilt each frame)
        const drops: RainDrop[] = Array.from({ length: count }, () =>
          ({ x: 0, y: 0, len: Math.random() * 12 + 5,
             speed: Math.random() * 3.5 + 2.5,
             opacity: Math.random() * 0.45 + 0.2, angle: 0.10 }),
        );

        zones.push({ geometry: geom, r, g, b, drops, normDrops });
      });

      zonesRef.current = zones;
    },
    [buildByName],
  );

  // ── Animation loop ────────────────────────────────────────────────────────
  const startAnimation = useCallback(() => {
    if (frameRef.current) return; // already running

    // Sync canvas size immediately before the first frame
    syncCanvasSize();

    const tick = () => {
      const map    = mapRef.current;
      const canvas = canvasRef.current;
      if (!map || !canvas) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      // Keep canvas sized to its CSS box every frame (handles resize + zoom)
      syncCanvasSize();

      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      zonesRef.current.forEach((z) => {
        const { r, g, b, drops, normDrops, geometry } = z;

        // ── Reproject geometry to current pixel coords every frame ──────────
        const bbox = geomPixelBbox(geometry, map);
        if (
          !isFinite(bbox.minX) || !isFinite(bbox.maxX) ||
          bbox.maxX <= bbox.minX || bbox.maxY <= bbox.minY
        ) return;

        const path = geomToPath(geometry, map);
        const w = bbox.maxX - bbox.minX;
        const h = bbox.maxY - bbox.minY;

        ctx.save();
        ctx.clip(path, "evenodd");

        drops.forEach((d, i) => {
          const nd = normDrops[i];

          // Map normalised position → current pixel position
          d.x = bbox.minX + nd.nx * w;
          d.y = bbox.minY + nd.ny * h;

          ctx.beginPath();
          ctx.strokeStyle = `rgba(${r},${g},${b},${d.opacity})`;
          ctx.lineWidth   = 1;
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + Math.sin(d.angle) * d.len, d.y + d.len);
          ctx.stroke();

          // Advance normalised position
          nd.ny += d.speed / h;
          nd.nx += (Math.sin(d.angle) * d.speed * 0.35) / w;

          // Reset when drop exits the bottom
          if (nd.ny > 1 + d.len / h) {
            nd.nx = Math.random();
            nd.ny = -(Math.random() * 0.5);
          }
        });

        ctx.restore();
      });

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, [mapRef, syncCanvasSize]);

  const stopAnimation = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  // ── Toggle on/off ─────────────────────────────────────────────────────────
  const setEnabled = useCallback(
    (on: boolean) => {
      enabledRef.current = on;
      if (on && zonesRef.current.length) startAnimation();
      else stopAnimation();
    },
    [startAnimation, stopAnimation],
  );

  // ── Resize canvas when the container changes size ─────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => syncCanvasSize());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [syncCanvasSize]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => stopAnimation();
  }, [stopAnimation]);

  return {
    canvasRef,
    setRainyDistricts: (districts: RainyDistrict[]) => {
      setRainyDistricts(districts);
      if (enabledRef.current && districts.length) startAnimation();
      else stopAnimation();
    },
    startAnimation,
    stopAnimation,
    setEnabled,
  };
}
