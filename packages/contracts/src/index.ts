export type Decimal = string;
export type DigitalKind = 'full_adder'|'adder4'|'cpu4'|'adder16'|'cpu16';
export interface CpuInstruction {op:'LOAD'|'ADD'|'AND'|'XOR';value:number}
export interface DigitalUnit {schema_version:1;kind:DigitalKind;datapath_bits?:number;pc_bits?:number;rom_words?:number;period_ns:number;cycles?:number;program:CpuInstruction[]|null;physical:string;electrical_hierarchy:string;physical_hierarchy:string;internal_probe_prefix?:string}
export interface DigitalCatalog {units:{id:DigitalKind;name:string;ports:string[];case_count:number;description:string}[];default_program:CpuInstruction[];default_program16:CpuInstruction[];operations:CpuInstruction['op'][];execution_available:boolean}
export interface SupplyMetrics {available:boolean;reason?:string;energy_J?:number;average_current_A?:number;peak_current_A?:number;average_power_W?:number;source?:string}
export interface UnitRow {index:number;expected:number;actual:number|null;carry_expected:number;carry_actual:number|null;pass:boolean;sample_time_s:number;a?:number;b?:number;cin?:number;pc_before?:number;pc_after?:number;pc_actual?:number;op?:string;immediate?:number;acc_before?:number;zero_expected?:number;zero_actual?:number|null;settling_time_s?:number|null;power?:SupplyMetrics}
export interface UnitVerification {schema_version:1;kind:DigitalKind;datapath_bits?:number;coverage?:string;source:string;expected_cases:number;passed_cases:number;pass:boolean;rows:UnitRow[];logic_low_max_V:number;logic_high_min_V:number;scope:string;reset_verified?:boolean;rom_wraps?:number;power?:SupplyMetrics;timing_source?:string}
export interface HierarchySource {id:string;name:string;cell:string;revision:number;pdk_id:string;cells:{name:string;ports:string[];root:boolean}[]}
export interface HierarchyRequest {project_id:string;mode:'place'|'wrap';source_project_id?:string;source_cell?:string;target_cell?:string;namespace?:string;pins?:Record<string,string>;position?:[Decimal,Decimal];rotation?:0|90|180|270;mirror?:boolean;scope?:'both'|'schematic'|'layout';parent_name?:string}
export interface HierarchyPreview {schema_version:1;request:HierarchyRequest;preview_hash:string;target_revision:number;source_revision:number|null;cell_mapping:Record<string,string>;pin_mapping:Record<string,string>;warnings:string[];valid:boolean;scope:string;before:Scene;after:Scene;impact:{before_shapes:number;after_shapes:number;added_shapes:number;removed_shapes:number;before_bounds:Decimal[];after_bounds:Decimal[];imported_cells:number;invalidated_runs:number;layout_changed:boolean;mask:{mask_changed:boolean;overlap_count:number;overlaps:{layer_id:string;bbox:[Decimal,Decimal,Decimal,Decimal];area_dbu2:string}[];overlap_display_truncated:boolean;layers:{layer_id:string;added_area_dbu2:string;removed_area_dbu2:string}[];scope:string}}}
export interface Layer { id:string; name:string; gds:[number,number]; color:string; opacity:number; z_display_um:number; thickness_display_um:number; source:'illustrative'|'pdk'|'published_reference'|'user'; physical_z_um?:number|null; physical_thickness_um?:number|null; material?:string }
export interface Device { id:string; name:string; kind:'nmos'|'pmos'|'resistor'|'capacitor'|'voltage'|'current'|'ground'|'port'|'block'; model?:string; cell_name?:string; pins:Record<string,string>; parameters:Record<string,number|string>; x:number; y:number; rotation?:0|90|180|270; mirror?:boolean }
export interface Wire { id:string; points:[number,number][]; net?:string; junction?:boolean }
export interface Junction { id:string; x:number; y:number; net?:string }
export interface SchematicCell { ports?:string[]; devices:Device[]; wires?:Wire[]; junctions?:Junction[]; connectivity_mode?:'explicit'|'geometric' }
export interface Testbench { analysis?:'op'|'dc'|'ac'|'tran';corner?:string;temperature_C?:number;supply_V?:number;duration_s?:number;step_s?:number;load_F?:number;vds_V?:number;vbs_V?:number }
export interface PdkManifest { schema_version:1; id:string; name:string; version:string; root?:string; magic_rc?:string; magic_tech?:string; netgen_setup?:string; model_file?:string; model_mode:'lib'|'include'|'sky130-subset'; corners:string[]; spice_scale:number; layer_file?:string }
export interface SetupCheck { name:string; status:'pass'|'fail'|'warning'; message:string }
export interface PdkProfile { id:string; name:string; version:string; manifest:PdkManifest; fingerprint:string; built_in?:boolean; available?:boolean; capabilities:Record<string,boolean>; checks?:SetupCheck[]; source?:'installed'|'uploaded'; validation?:PdkValidation; lock?:{signature:string;files:Record<string,string>} }
export interface PdkValidation { valid:boolean; profile?:PdkProfile; checks:SetupCheck[]; fingerprint?:string; signature?:string; files?:Record<string,string> }
export interface AnalysisPort { name:string; mode:'ground'|'voltage'|'floating'; dc_V:number }
export interface AnalysisSetup { profile_id:string; profile_hash?:string; top_cell:string; corner:string; temperature_C:number; ports:AnalysisPort[]; analysis:'op'|'dc'|'tran'; sweep_port?:string; start_V?:number; end_V?:number; step_V?:number; duration_s?:number; step_s?:number; pex:boolean; reference_spice?:string }
export interface AnalysisInspection { top_cells:string[]; top_cell:string; labels:string[]; ports:string[]; checks:SetupCheck[]; fingerprint?:string; revision?:number; layout_sha256?:string; global_nodes?:string[]; inspection_id?:string; artifacts?:Record<string,string>; log_text?:string }
export type BackendOperation = 'simulation'|'drc'|'lvs'|'pex'|'layout_export'|'netlist_export'|'implementation';
export interface BackendCatalogEntry { id:string; name:string; vendor:string; operations:BackendOperation[]; formats:string[]; verification:'unverified'|'open-source-verified'; notes?:string }
export interface BackendProfile { id:string; name:string; tool_id:string; version:string; runner:'local'|'agent'; operations:BackendOperation[]; fingerprint:string; available:boolean; checks:SetupCheck[]; status?:string; checked_at?:string }
export interface BackendCatalog { tools:BackendCatalogEntry[]; profiles:BackendProfile[] }
export interface BackendValidation { valid:boolean; profile:BackendProfile; checks:SetupCheck[]; fingerprint?:string }
export interface BackendManifest { schema_version:1; id:string; name:string; tool_id:string; version:string; runner:Record<string,unknown>; [key:string]:unknown }
export interface BackendSetup { profile_id:string; profile_hash?:string; operation:BackendOperation; top_cell:string; parameters?:Record<string,string|number|boolean>; netlist_text?:string }
export interface BackendArtifact { name:string; base64:string; mime:string }
export interface CompatibilityFile { name:string; base64:string; mime?:string }
export interface CompatibilityLayer { name:string; layer:number; datatype:number; purpose?:string }
export interface CompatibilityOptions { source_tool?:string; top_cell?:string; netlist_top?:string; netlist_file?:string; library_section?:string; dbu_um?:number; lef_files?:string[]; macro_files?:string[]; layer_map?:CompatibilityLayer[]; allow_unmapped_layers?:boolean; results?:Record<string,unknown> }
export interface CompatibilityEntry { name:string; format:string; status:'supported'|'metadata-only'|'requires-converter'|'unsupported'|'invalid'; capabilities:string[]; warnings:string[]; details?:Record<string,unknown> }
export interface CompatibilityReport { schema_version:1; files:CompatibilityEntry[]; warnings:string[]; layer_map?:CompatibilityLayer[]; top_cells?:string[]; dbu_um?:number; circuits?:{name:string;pins:string[];devices?:number;instances?:number}[]; validated_native?:boolean; source_tool?:string; checks?:SetupCheck[]; losses?:string[]; kind?:string; supported?:boolean; [key:string]:unknown }
export interface CompatibilityImportResult { project:Project; report:CompatibilityReport }
export interface CompatibilityExportResult { files:CompatibilityFile[]; report:CompatibilityReport }
export type DatabaseAdapterId = 'cadence-skill' | 'synopsys-ndm' | 'klayout-file';
export interface DatabaseCheck { name:string; status:string; message:string }
export interface DatabaseSourceManifest {
  schema_version:1; id:string; name:string; adapter:DatabaseAdapterId;
  backend_profile_id?:string; layout_file?:string; library:string; view?:string;
  layer_map:CompatibilityLayer[]; shared_project_ids?:string[];
  executable?:string; native_db?:string; env_names?:string[]; version?:string; tool_id?:string;
}
export type DatabaseManifest = DatabaseSourceManifest;
export interface DatabaseSource {
  id:string; name:string; adapter:DatabaseAdapterId; library:string; view?:string;
  status:string; fingerprint?:string; available?:boolean; tool_id?:string; version?:string;
  vendor_execution_verified:boolean; checks?:DatabaseCheck[]; [key:string]:unknown;
}
export interface DatabaseCatalog {
  adapters:{id:DatabaseAdapterId; name:string; tool_id:string; formats:string[]; status:string; notes:string[]; [key:string]:unknown}[];
  [key:string]:unknown;
}
export interface DatabaseProbe {
  source_id:string; status:string; fingerprint?:string; available?:boolean;
  vendor_execution_verified:boolean; checks:DatabaseCheck[]; [key:string]:unknown;
}
export interface DatabaseCells {
  source_id:string; fingerprint:string; cells:{library:string;cell:string;view:string}[];
  status:string; checks:DatabaseCheck[]; [key:string]:unknown;
}
export type DatabaseCellList = DatabaseCells;
export interface NativeDatabaseGraph { schema_version:number; dbu_um:number; top_cell:string; cells:Record<string,unknown>[]; [key:string]:unknown }
export interface DatabaseRead {
  id:string; source_id:string; cell:string; view:string;
  status:'verified'|'unverified'|'unavailable'; vendor_execution_verified:boolean;
  graph?:NativeDatabaseGraph; graph_sha256?:string; checks:DatabaseCheck[];
  can_import?:boolean; fingerprint?:string; source_fingerprint?:string;
  diagnostics:unknown[]; [key:string]:unknown;
}
export interface DatabaseImportResult { project:Project; report:Record<string,unknown> }
export interface PvtMetric { name:string; source:'measurement'|'waveform'|'branch'; key:string; reduction?:'min'|'max'|'mean'|'last'; absolute?:boolean }
export type PvtSupply = {kind:'testbench';source_names:string[]} | {kind:'device';device_id:string} | {kind:'port';name:string};
export interface PvtSources {mode:string;bindings:PvtSupply[];corners:string[];analyses:string[];limits:Record<string,unknown>;[key:string]:unknown}
export interface PvtConfig { analysis:'op'|'dc'|'ac'|'tran';corners:string[];temperatures_C:number[];supplies_V:number[];supply:PvtSupply;metrics:PvtMetric[];constraints?:{metric:string;op:'<='|'>=';value:number}[];settings?:Record<string,number|string|boolean>;wall_time_s?:number;point_timeout_s?:number;max_parallel?:1|2 }
export interface PvtCondition { corner:string;temperature_C:number;supply_V:number }
export interface PvtPoint { id:string;condition:PvtCondition;project_id?:string;run_id?:string;execution_status:string;analysis_result?:string;metrics:Record<string,number|null>;constraints?:Record<string,unknown>[];message?:string;[key:string]:unknown }
export interface PvtStudy { id:string;project_id:string;source_revision:number;source_signature:string;layout_sha256:string;config:PvtConfig;execution_status:string;freshness:'current'|'stale';points:PvtPoint[];summary?:Record<string,unknown>;created_at?:string;started_at?:string;ended_at?:string;message?:string;notes?:string[];[key:string]:unknown }
export interface RoutingLayerRule { layer_id:string;min_width_dbu:Decimal;min_spacing_dbu:Decimal;min_area_dbu2:Decimal;grid_dbu:Decimal;[key:string]:unknown }
export interface RoutingRules { project_id?:string;profile_id:string;fingerprint:string;resources:{path:string;sha256:string}[];layers:RoutingLayerRule[];supported_scope:string;via_resources?:unknown;limits?:string[];[key:string]:unknown }
export interface RouteInput { layer_id:string;start:[Decimal,Decimal];end:[Decimal,Decimal];width?:Decimal;net?:string;order?:'x-first'|'y-first';points?:[Decimal,Decimal][];rule_fingerprint?:string }
export interface RoutePreview { project_id:string;revision:number;rule_fingerprint:string;preview_hash:string;valid:boolean;points:[Decimal,Decimal][];width:Decimal;length_dbu:Decimal;collisions:{shape_id:string;layer_id:string;reason:string}[];limits:string[];[key:string]:unknown }
export interface DesignTemplate { id:string;name:string;parameter_defaults:Record<string,number>;ports:string[];analyses:string[];physical_status:string;limits:string[];[key:string]:unknown }
export interface DesignCatalog { templates:DesignTemplate[];[key:string]:unknown }
export type StarterMode = 'nominal' | 'slow_hot' | 'fast_cold';
export interface SemiconductorStarter { schema_version:1;id:string;title:string;technology_id:string;mode:StarterMode;mode_name:string;initial_testbench:Testbench;layout_scope:'physical'|'schematic';ideal_components:boolean;observe:string[];source_url:string;verification:string }
export interface SemiconductorTechnology { id:string;name:string;node:string;voltages:string;features:string[];adapter:boolean;installed:boolean;execution_available:boolean;reason?:string;source_url:string }
export interface SemiconductorPreset { id:string;technology_id:string;title:string;subtitle:string;category:string;features:string[];observe:string[];layout:'physical'|'schematic';ideal_components:boolean;testbench:Required<Testbench>;modes:StarterMode[];configurations:Partial<Record<StarterMode,Required<Testbench>>>;execution_available:boolean }
export interface SemiconductorCatalog { schema_version:1;version:string;technologies:SemiconductorTechnology[];presets:SemiconductorPreset[];modes:{id:StarterMode;name:string;settings:Partial<Testbench>}[] }
export interface DesignNet { name:string;pins:{device_id:string;device_name:string;pin:string}[];[key:string]:unknown }
export interface DesignConnectivity { project_id:string;revision:number;source:string;nets:DesignNet[];devices:Device[];ports:string[];issues:{code:string;message:string;device_id?:string;severity?:string;[key:string]:unknown}[];layout_binding:{status:string;mappings:unknown[];reason:string};limits:string[];[key:string]:unknown }
export interface Project { digital_unit?:DigitalUnit; schema_version:1; id:string; name:string; pdk_id:string; revision:number; cell:string; dbu_um:number; grid_dbu:number; source:'pdk'|'fixture'; layers:Layer[]; schematic:SchematicCell & {cells?:Record<string,SchematicCell>}; testbench?:Testbench; design_template?:Record<string,unknown>; semiconductor_starter?:SemiconductorStarter; pvt_point?:Record<string,unknown>; analysis_setup?:AnalysisSetup; backend_setup?:BackendSetup; active_backend?:'open-source'|'commercial'; interchange_netlist?:Record<string,unknown>; interchange_layout?:Record<string,unknown>; interchange_report?:CompatibilityReport; runs:Run[]; saved_at?:string; example?:string }
export interface SceneShape { id:string; layer_id:string; cell_path:string; polygon:[Decimal,Decimal][]; holes?:[Decimal,Decimal][][]; net?:string; device_id?:string; instance_id?:string }
export interface Scene { project_id:string; revision:number; dbu_um:number; grid_dbu?:number; source:'pdk'|'fixture'|'imported'; layers:Layer[]; shapes:SceneShape[]; devices?:Device[]; bounds?:[Decimal,Decimal,Decimal,Decimal]; bounds_filter?:[Decimal,Decimal,Decimal,Decimal] | null;total_shape_count?:number;returned_shape_count?:number;truncated?:boolean;cells?:{name:string;bbox:[Decimal,Decimal,Decimal,Decimal];shape_count:number;instance_count:number}[]; instances?:{id:string;cell_name:string;cell_path:string;parent_cell:string;bbox?:[Decimal,Decimal,Decimal,Decimal];position:[Decimal,Decimal];rotation:number;mirror:boolean;array?:{columns:number;rows:number;dx:Decimal;dy:Decimal}}[]; labels?:{id:string;layer_id:string;cell_path:string;text:string;position:[Decimal,Decimal];net?:string}[]; pins?:{id:string;name:string;layer_id:string;cell_path:string;box:[Decimal,Decimal,Decimal,Decimal];net?:string}[] }
export interface Marker { id:string; rule:string; description:string; bbox:[Decimal,Decimal,Decimal,Decimal]; layer_id?:string; cell_path?:string; severity?:string }
export interface Waveform { name:string; unit:string; x:number[]; y:number[]; x_unit?:string }
export interface CurrentBranch { id:string; name:string; device_id?:string; from_net:string; to_net:string; values_A:number[]; path_dbu?:[Decimal,Decimal][]; layer_id?:string; mapping:'device_terminals'|'user_path'|'unmapped'; source_vector:string }
export interface NodeVoltage { net:string; source_vector:string; values_V:number[] }
export interface CurrentFlow { node_voltages?:NodeVoltage[]; voltage_probe_scope?:string; omitted_voltage_nets?:string[]; schema_version:1; source:'ngspice'|'imported'|'spectre'|'hspice'|'primesim'|'commercial'; analysis:string; x:number[]; x_unit:string; branches:CurrentBranch[]; convention:'conventional'; revision:number; project_id?:string; run_id?:string; layout_sha256?:string; backend_profile_id?:string; tool?:string; geometry_linkage?:'unverified'|'verified'; input_origin?:'project-snapshot'|'operator-recipe'|'external-native-database'|'imported-file'; freshness?:'current'|'stale'; notes?:string[] }
export interface DigitalVerification { schema_version:1; protocol:string; source:string; expected_cases:number; passed_cases:number; complete:boolean; pass:boolean; rows:{index:number;select:number;pattern:number;expected:number;actual:number|null;sample_time_s:number;inputs_V:Record<string,number|null>;output_min_V:number|null;output_max_V:number|null;pass:boolean}[]; data_delays_s:{rise:number[];fall:number[]}; stimulus_energy_J:number; delay_scope:string }
export interface Run { analysis_stage?:'pre-layout'|'post-layout'; unit_verification?:UnitVerification; digital_verification?:DigitalVerification; id:string; project_id:string; kind:string; workflow?:'configured-layout'|'commercial-backend'|'imported-results'; native_execution?:boolean; imported_source?:{files:Record<string,{bytes:number;sha256:string}>;vendor_execution_verified:false}; profile_id?:string; backend_profile_id?:string; revision:number; execution_status:'queued'|'running'|'completed'|'failed'|'canceled'; analysis_result:'pass'|'fail'|'unsupported'|'unknown'; freshness:'current'|'stale'; started_at?:string; ended_at?:string; elapsed_s?:number; tool?:string; message?:string; artifacts?:Record<string,string>; markers?:Marker[]; waveforms?:Waveform[]; measurements?:Record<string,number|string|null>; parasitics?:{resistors:number; capacitors:number}; manifest_path?:string; current_flow?:CurrentFlow }
export interface Doctor { protocol_version:1; runner:string; tools:{name:string; path:string|null; version:string|null; available:boolean; reason?:string}[]; pdk:{id:string; available:boolean; version?:string; path?:string; capabilities:Record<string,boolean>; reason?:string} }
export type LayoutCommand = ({type:'add_box';layer_id:string;box:[Decimal,Decimal,Decimal,Decimal];net?:string}|{type:'move_shape';id:string;dx:Decimal;dy:Decimal}|{type:'delete_shape';id:string}|{type:'add_route'|'add_path';layer_id:string;points:[Decimal,Decimal][];width:Decimal;net?:string}|{type:'undo'|'redo'}|{type:'update_device';id:string;parameters:Record<string,number|string>}|{type:'add_cell';name:string}|{type:'add_polygon';layer_id:string;polygon:[Decimal,Decimal][];holes?:[Decimal,Decimal][][];net?:string}|{type:'add_label';layer_id:string;text:string;position:[Decimal,Decimal];net?:string}|{type:'add_pin';layer_id:string;name:string;box:[Decimal,Decimal,Decimal,Decimal];net?:string}|{type:'add_instance';cell_name:string;position:[Decimal,Decimal];rotation:0|90|180|270;mirror:boolean;array?:{columns:number;rows:number;dx:Decimal;dy:Decimal};target_cell_name?:string}|{type:'transform_instance';id:string;rotation?:0|90|180|270;mirror?:boolean;dx?:Decimal;dy?:Decimal}|{type:'copy_instance';id:string;dx:Decimal;dy:Decimal}|{type:'delete_instance';id:string}) & {cell_name?:string};
export type SchematicCommand = ({type:'update_device';id:string;parameters:Record<string,number|string>}|{type:'move_device';id:string;x:number;y:number}|{type:'transform_device';id:string;rotation?:0|90|180|270;mirror?:boolean}|{type:'add_device';device:Device}|{type:'delete_device';id:string}|{type:'set_pin';id:string;pin:string;net:string}|{type:'undo'|'redo'}|{type:'add_wire';wire:Wire}|{type:'delete_wire';id:string}|{type:'move_wire'|'copy_wire';id:string;dx:number;dy:number}|{type:'add_junction';junction:Junction}|{type:'delete_junction';id:string}|{type:'move_junction';id:string;dx:number;dy:number}|{type:'copy_device';id:string;dx?:number;dy?:number;name?:string}|{type:'set_connectivity_mode';mode:'explicit'|'geometric'}|{type:'add_cell';name:string;ports?:string[]}|{type:'update_testbench';settings:Testbench}) & {cell_name?:string};
export interface DesktopDiagnostics {schema_version:1;checked_at:string;platform:string;arch:string;workspace:string;engine_ready:boolean;items:{id:string;status:'pass'|'missing'|'blocked'|'pending';message:string;action:string}[];read_only:true;credentials_included:false}
export class WorkerError extends Error { code:string; details:unknown; constructor(code:string,message:string,details?:unknown){super(message);this.name='WorkerError';this.code=code;this.details=details;} }
type RpcOverride = (method:string,params:Record<string,unknown>)=>Promise<unknown>;
let override:RpcOverride|undefined;
export function setRpcOverride(next:RpcOverride|undefined){override=next;}
declare global { interface Window { mos?:{rpc:(method:string,params:Record<string,unknown>)=>Promise<{ok:boolean;result?:unknown;error?:{code:string;message:string;details?:unknown}}>;
onMenuCommand?:(callback:(command:'save'|'undo'|'redo')=>void)=>()=>void}; } }
export async function rpc<T=unknown>(method:string,params:Record<string,unknown>={}):Promise<T>{
  if(override) return await override(method,params) as T;
  return localRpc<T>(method,params);
}
export async function localRpc<T=unknown>(method:string,params:Record<string,unknown>={}):Promise<T>{
  let data;
  try { data=window.mos ? await window.mos.rpc(method,params) : await fetch('/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,params})}).then(async r=>{if(!r.ok)throw new WorkerError('TRANSPORT',`Worker HTTP ${r.status}`);return r.json();}); }
  catch(e){ if(e instanceof WorkerError)throw e;throw new WorkerError('WORKER_UNAVAILABLE',e instanceof Error?e.message:'EDA worker unavailable'); }
  if(!data.ok)throw new WorkerError(data.error?.code??'UNKNOWN',data.error?.message??'Worker request failed',data.error?.details);
  return data.result as T;
}

/** Local development uses the configured Vite port; published HTTP workspaces use cloud auth. */
export function isLocalWorkbench(){
  if(typeof location==='undefined')return true;
  if(location.protocol==='file:')return true;
  const dev=(import.meta as ImportMeta & {env?:{DEV?:boolean}}).env?.DEV===true;
  return ['127.0.0.1','localhost'].includes(location.hostname)&&(location.port==='5173'||dev);
}
