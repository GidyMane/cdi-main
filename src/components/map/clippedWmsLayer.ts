/**
 * ClippedWMSTileLayer — A Leaflet WMS tile layer that clips tiles to the
 * Uganda boundary fetched from GeoServer WFS.
 *
 * The boundary is fetched once from:
 *   /geoserver/wfews/ows?service=WFS&version=1.0.0&request=GetFeature
 *     &typeName=wfews:country&outputFormat=application/json
 *
 * Each WMS tile is drawn onto a canvas and clipped to the Uganda polygon,
 * giving pixel-perfect edges without a semi-transparent overlay mask.
 *
 * Usage:
 *   import { clippedWms } from "./clippedWmsLayer";
 *   clippedWms(wmsUrl, { layers: "...", ... }).addTo(map);
 */
import L from "leaflet";
import type { FeatureCollection } from "geojson";

// ── GeoServer WFS boundary URL (uses the same base as the GEO_SERVER_URL) ────
const GEOJSON_BASE_URL =
  "https://map-assets.open-meteo.com/world-geojson/countries";

// ── Cached boundary promise (fetched once, reused across all layers) ──────────
let _boundaryPromise: Promise<FeatureCollection> | null = null;

function fetchUgandaBoundary(): Promise<FeatureCollection> {
  if (!_boundaryPromise) {
    _boundaryPromise = fetch(`${GEOJSON_BASE_URL}/uganda.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Boundary fetch failed: ${res.status}`);
        return res.json() as Promise<FeatureCollection>;
      })
      .catch((err) => {
        // Allow retry on next call
        _boundaryPromise = null;
        throw err;
      });
  }
  return _boundaryPromise;
}

// ── Build a Path2D clip path from GeoJSON in tile-local pixel coordinates ─────

function buildClipPath(
  geoData: FeatureCollection,
  tileSize: number,
  tilePoint: L.Point,
  zoom: number,
): Path2D {
  const path = new Path2D();
  const scale = tileSize * Math.pow(2, zoom);

  const project = (lon: number, lat: number): [number, number] => {
    // Web Mercator projection to pixel coordinates
    const x = ((lon + 180) / 360) * scale;
    const latRad = (lat * Math.PI) / 180;
    const y =
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
        2) *
      scale;
    // Convert to tile-local coordinates
    return [x - tilePoint.x * tileSize, y - tilePoint.y * tileSize];
  };

  const addRing = (ring: number[][]) => {
    if (!ring.length) return;
    const [x0, y0] = project(ring[0][0], ring[0][1]);
    path.moveTo(x0, y0);
    for (let i = 1; i < ring.length; i++) {
      const [x, y] = project(ring[i][0], ring[i][1]);
      path.lineTo(x, y);
    }
    path.closePath();
  };

  geoData.features.forEach((f) => {
    const g = f.geometry;
    if (!g) return;
    if (g.type === "Polygon") {
      (g.coordinates as number[][][]).forEach(addRing);
    } else if (g.type === "MultiPolygon") {
      (g.coordinates as number[][][][]).forEach((poly) =>
        poly.forEach(addRing),
      );
    }
  });

  return path;
}

// ── Custom GridLayer that fetches WMS tiles and clips them ─────────────────────

const ClippedWMSLayer = L.GridLayer.extend({
  initialize(
    this: any,
    url: string,
    options: L.WMSOptions & L.TileLayerOptions,
  ) {
    this._url = url;
    this._boundaryGeoJson = null as FeatureCollection | null;
    this._wmsParams = {
      service: "WMS",
      request: "GetMap",
      version: options.version || "1.1.0",
      layers: options.layers || "",
      styles: options.styles || "",
      format: options.format || "image/png",
      transparent: options.transparent !== false ? "true" : "false",
      width: "256",
      height: "256",
      srs: "EPSG:3857",
    };
    // Remove WMS-specific keys from tile layer options
    const tileOpts = { ...options };
    delete (tileOpts as any).layers;
    delete (tileOpts as any).styles;
    delete (tileOpts as any).format;
    delete (tileOpts as any).transparent;
    delete (tileOpts as any).version;
    (L.GridLayer.prototype as any).initialize.call(this, tileOpts);

    // Fetch boundary from GeoServer WFS (cached globally)
    fetchUgandaBoundary()
      .then((geojson) => {
        this._boundaryGeoJson = geojson;
        // Redraw tiles now that we have the boundary
        this.redraw();
      })
      .catch((err) => {
        console.warn("ClippedWMS: failed to fetch Uganda boundary, tiles will render unclipped:", err);
      });
  },

  createTile(this: any, coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tileSize = this.getTileSize();
    const canvas = document.createElement("canvas");
    canvas.width = tileSize.x;
    canvas.height = tileSize.y;

    const map = this._map;
    const zoom = coords.z;

    // Compute BBOX for this tile in EPSG:3857
    const tilePoint = L.point(coords.x, coords.y);
    const nwPoint = tilePoint.multiplyBy(tileSize.x);
    const sePoint = nwPoint.add(tileSize);

    const nw = map.unproject(nwPoint, zoom);
    const se = map.unproject(sePoint, zoom);

    const nw3857 = L.CRS.EPSG3857.project(nw);
    const se3857 = L.CRS.EPSG3857.project(se);
    const bbox = `${nw3857.x},${se3857.y},${se3857.x},${nw3857.y}`;

    // Build WMS URL
    const params = new URLSearchParams({
      ...this._wmsParams,
      bbox,
      width: String(tileSize.x),
      height: String(tileSize.y),
    });
    const imgUrl = `${this._url}?${params.toString()}`;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        done(undefined, canvas);
        return;
      }

      // Staggered reveal: each tile fades in with a slight delay based on position
      const delay = ((coords.x + coords.y) % 6) * 60; // 0-360ms stagger
      canvas.style.opacity = "0";
      canvas.style.transition = "opacity 0.4s ease-in";

      setTimeout(() => {
        // If boundary is loaded, clip; otherwise render unclipped
        if (this._boundaryGeoJson) {
          const clipPath = buildClipPath(
            this._boundaryGeoJson,
            tileSize.x,
            tilePoint,
            zoom,
          );
          ctx.save();
          ctx.clip(clipPath);
          ctx.drawImage(img, 0, 0, tileSize.x, tileSize.y);
          ctx.restore();
        } else {
          ctx.drawImage(img, 0, 0, tileSize.x, tileSize.y);
        }
        canvas.style.opacity = "1";
        done(undefined, canvas);
      }, delay);
    };
    img.onerror = () => {
      // Silently handle tile errors — layer may not exist on GeoServer yet
      done(undefined, canvas);
    };
    img.src = imgUrl;

    return canvas;
  },
});

/**
 * Factory function to create a clipped WMS tile layer.
 * The Uganda boundary is fetched from GeoServer WFS automatically.
 *
 * @param url     - GeoServer WMS endpoint URL
 * @param options - Standard Leaflet WMS options (layers, format, etc.)
 */
export function clippedWms(
  url: string,
  options: L.WMSOptions & L.TileLayerOptions = {},
): L.GridLayer {
  return new (ClippedWMSLayer as any)(url, options);
}
