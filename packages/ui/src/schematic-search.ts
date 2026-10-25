import type {SchematicCell} from '@mos/contracts';
import type {SchematicSelection} from './schematic-selection';
import {schematicViewport} from './schematic-viewport';

export interface SchematicSearchEntry {
  key: string;
  kind: 'device' | 'net';
  label: string;
  detail: string;
  search: string;
  items: SchematicSelection[];
}
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase();

/** Searches current-cell metadata. Matching net labels do not prove electrical connectivity. */
export function schematicSearchIndex(cell: SchematicCell): SchematicSearchEntry[] {
  const nets = new Map<string, Map<string, SchematicSelection>>();
  const addNet = (net: string | undefined, item: SchematicSelection) => {
    if (!net?.trim()) return;
    if (!nets.has(net)) nets.set(net, new Map());
    nets.get(net)!.set(`${item.kind}:${item.id}`, item);
  };
  const entries: SchematicSearchEntry[] = cell.devices.map(device => {
    const item: SchematicSelection = {kind: 'device', id: device.id};
    Object.values(device.pins).forEach(net => addNet(net, item));
    const detail = [device.kind, device.model, device.cell_name, device.id].filter(Boolean).join(' · ');
    return {key: `device:${device.id}`, kind: 'device', label: device.name, detail,
      search: normalize([device.name, detail, ...Object.entries(device.pins).flat()].join(' ')), items: [item]};
  });
  for (const wire of cell.wires ?? []) addNet(wire.net, {kind: 'wire', id: wire.id});
  for (const junction of cell.junctions ?? []) addNet(junction.net, {kind: 'junction', id: junction.id});
  for (const [net, items] of nets) entries.push({key: `net:${net}`, kind: 'net', label: net,
    detail: `표기된 net · ${items.size}개 항목`, search: normalize(net), items: [...items.values()]});
  return entries;
}

export function searchSchematic(entries: SchematicSearchEntry[], query: string, kind: 'all' | SchematicSearchEntry['kind'] = 'all', limit = 40) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const matches = entries.filter(entry => (kind === 'all' || entry.kind === kind) && terms.every(term => entry.search.includes(term)));
  return {total: matches.length, entries: matches.slice(0, Math.max(0, Math.min(200, limit)))};
}

export function schematicSelectionViewport(cell: SchematicCell, items: SchematicSelection[]) {
  const keys = new Set(items.map(item => `${item.kind}:${item.id}`));
  const devices = cell.devices.filter(item => keys.has(`device:${item.id}`));
  const wires = (cell.wires ?? []).filter(item => keys.has(`wire:${item.id}`));
  const junctions = (cell.junctions ?? []).filter(item => keys.has(`junction:${item.id}`));
  if (!devices.length && !wires.length && !junctions.length) return null;
  return schematicViewport(devices, wires, junctions);
}
