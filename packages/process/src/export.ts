import { validateVolume, type ProcessVolume } from './model';
import type { VtuOptions } from './vtu';
/** Complete conforming mesh export; all coordinates and supplied/derived thickness values are retained. */
export function volumeVtu(volume:ProcessVolume){
  validateVolume(volume);
  const array=(name:string,type:string,components:number,values:(number|null)[])=>`<DataArray type="${type}"${name?` Name="${name}"`:''} NumberOfComponents="${components}" format="ascii">${values.map(v=>v===null?'NaN':String(v)).join(' ')}</DataArray>`;
  return `<?xml version="1.0"?><VTKFile type="UnstructuredGrid" version="0.1" byte_order="LittleEndian"><UnstructuredGrid><Piece NumberOfPoints="${volume.points_um.length}" NumberOfCells="${volume.cells.length}"><Points>${array('','Float64',3,volume.points_um.flat())}</Points><Cells>${array('connectivity','Int32',1,volume.cells.flatMap(c=>c.vertices))}${array('offsets','Int32',1,volume.cells.map((_,i)=>(i+1)*4))}${array('types','UInt8',1,volume.cells.map(()=>10))}</Cells><CellData>${array('material','Int32',1,volume.cells.map(c=>c.material_id))}${array('thickness_um','Float64',1,volume.cells.map(c=>c.thickness_um))}</CellData></Piece></UnstructuredGrid></VTKFile>`;
}
export function volumeVtuSettings(volume:ProcessVolume):VtuOptions {return {name:volume.name,stage:volume.stage,coordinate_unit:'um',material_array:'material',thickness_array:'thickness_um',thickness_unit:'um',materials:volume.materials,provenance:volume.provenance,scope:volume.scope,association:volume.association};}
