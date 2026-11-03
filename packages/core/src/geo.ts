export type LatLng = { latitude: number; longitude: number };
/** Rectángulo en el formato de Places API (New): esquina suroeste (low) y noreste (high). */
export type Rect = { low: LatLng; high: LatLng };

const KM_PER_DEG_LAT = 111.32;

/** Tamaño aproximado del rectángulo en km (ancho este-oeste, alto norte-sur). */
export function rectSizeKm(r: Rect): { widthKm: number; heightKm: number } {
  const midLat = (r.low.latitude + r.high.latitude) / 2;
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
  return {
    widthKm: Math.abs(r.high.longitude - r.low.longitude) * kmPerDegLng,
    heightKm: Math.abs(r.high.latitude - r.low.latitude) * KM_PER_DEG_LAT,
  };
}

/**
 * Divide una zona en una cuadrícula de subzonas de ~maxCellKm de lado, para que cada
 * búsqueda devuelva negocios distintos (Places corta en 60 resultados por consulta).
 * `maxCells` limita el costo: si la zona es enorme, las celdas crecen en vez de multiplicarse.
 */
export function splitRect(r: Rect, maxCellKm = 10, maxCells = 16): Rect[] {
  const { widthKm, heightKm } = rectSizeKm(r);
  let cols = Math.max(1, Math.ceil(widthKm / maxCellKm));
  let rows = Math.max(1, Math.ceil(heightKm / maxCellKm));
  while (cols * rows > maxCells) {
    if (cols >= rows && cols > 1) cols--;
    else if (rows > 1) rows--;
    else break;
  }

  const dLat = (r.high.latitude - r.low.latitude) / rows;
  const dLng = (r.high.longitude - r.low.longitude) / cols;
  const cells: Rect[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      cells.push({
        low: { latitude: r.low.latitude + i * dLat, longitude: r.low.longitude + j * dLng },
        high: { latitude: r.low.latitude + (i + 1) * dLat, longitude: r.low.longitude + (j + 1) * dLng },
      });
    }
  }
  return cells;
}
