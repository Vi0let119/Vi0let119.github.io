/** 地图交互：点击加点、视野适配 */

export function setupClickToAdd(
  map: any,
  handler: (lng: number, lat: number) => void,
): () => void {
  const onClick = (e: any) => {
    const l = e?.lnglat;
    if (!l) return;
    const lng = Number(l.getLng?.() ?? l.lng);
    const lat = Number(l.getLat?.() ?? l.lat);
    if (Number.isFinite(lng) && Number.isFinite(lat)) handler(lng, lat);
  };
  map.on('click', onClick);
  return () => {
    try {
      map.off('click', onClick);
    } catch {
      // 忽略
    }
  };
}

export function fitView(
  map: any,
  overlays: any[],
  padding: [number, number, number, number] = [100, 100, 100, 100],
): void {
  if (!overlays.length) return;
  try {
    map.setFitView(overlays, false, padding);
  } catch {
    // 视野适配失败不影响主流程
  }
}

export function panTo(map: any, lng: number, lat: number): void {
  try {
    map.setCenter([lng, lat]);
  } catch {
    // 忽略
  }
}
