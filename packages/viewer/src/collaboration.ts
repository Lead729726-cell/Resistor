export interface ViewerCursor { x: string; y: string; layer_id?: string }
export interface ViewerPresence { peerId: string; name: string; color: string; selection?: string | null; cursor?: ViewerCursor | null }
export interface ViewerFocus { shapeId?: string; cellPath?: string; instanceId?: string; sequence: number }
export interface ExtractedMapping {
  revision: number;
  source: string;
  elements: { id: string; kind: 'R' | 'C'; nodes: string[]; value: number; unit: string; shape_ids?: string[] }[];
}
