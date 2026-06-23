declare module "leaflet" {
  export interface DivIconOptions {
    className?: string;
    html?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    popupAnchor?: [number, number];
  }

  export function divIcon(options?: DivIconOptions): any;

  const L: {
    divIcon: typeof divIcon;
  };

  export default L;
}
