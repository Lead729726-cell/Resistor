import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const app = path.join(root, 'release/Register-win32-x64/resources/app');
const json = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const files = async directory => {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
  return groups.flat().sort();
};
const samePackagedFile = async file => {
  const source = await hash(path.join(root, file));
  assert.equal(await hash(path.join(app, file)), source, `Packaged file differs: ${file}`);
  return source;
};

const metadata = await json('package.json');
assert.equal(JSON.parse(await readFile(path.join(app, 'package.json'), 'utf8')).version, metadata.version);
const ui = await json('docs/evidence/ui-tests.json');
assert(ui.stats.expected >= 32, 'Run the complete legacy, integrated EDA, appearance, process and recipe UI suite with calibration.');
assert.equal(ui.stats.unexpected, 0);
assert.equal(ui.stats.skipped, 0);
assert.equal(ui.stats.flaky, 0);
const processRecipe=await json('docs/evidence/process-recipe.json');assert.equal(processRecipe.passed,processRecipe.expected);assert(processRecipe.passed>=28&&processRecipe.kinematic_prediction&&!processRecipe.calibrated_physical_prediction&&!processRecipe.foundry_signoff);
for(const [file,expected] of Object.entries(processRecipe.source_sha256))assert.equal(await hash(path.join(root,file)),expected,`Recipe evidence source changed: ${file}`);
const processFlowUi=await json('docs/evidence/process-flow-ui.json');
for(const flag of ['all_four_steps_executed','pinch_off_and_closed_void','all_stage_history_and_GDS_preserved','all_initial_surface_coverage_exported','sub_resolution_coating_marked_unresolved','no_native_requests','actual_planar_rate_fit','actual_two_resolution_runs','full_VTU_roundtrip','tetra_volume_continuation','actual_GDS_polygons_mask','invalid_recipe_preserves_result','cancel_preserves_completed_result','malformed_JSON_does_not_crash'])assert.equal(processFlowUi[flag],true,`Recipe UI gate ${flag}`);
assert.equal(processFlowUi.browser_errors.length,0);assert.equal(processFlowUi.stage_mesh_all_cells,13824);
const processFlowRelease=await json('docs/evidence/process-flow-release.json');assert.equal(processFlowRelease.version,metadata.version);assert.equal(processFlowRelease.browser_errors.length,0);assert.equal(processFlowRelease.identical_all_stage_occupancy_and_metrics,true);assert(processFlowRelease.kinematic_prediction&&!processFlowRelease.calibrated_physical_prediction&&!processFlowRelease.foundry_signoff);
for(const runtime of [processFlowRelease.windows,processFlowRelease.linux])assert(runtime.actual_run_worker&&runtime.actual_tetra_cells===13824&&runtime.closed_void&&runtime.actual_XYZ_slice&&runtime.no_native_requests);
assert.equal(processFlowRelease.windows_cli.recipe_sha256,processFlowRelease.linux_cli.recipe_sha256);assert.equal(processFlowRelease.windows_cli.files_hash_verified,21);assert(processFlowRelease.windows_cli.cold_no_Docker&&processFlowRelease.linux_cli.actual_Node_backend);
for(const [file,expected] of Object.entries(processFlowRelease.source_sha256))assert.equal(await hash(path.join(root,file)),expected,`Recipe release evidence source changed: ${file}`);
const processEngineHash=await hash(path.join(root,'dist/process-engine.mjs'));assert.equal(processEngineHash,await hash(path.join(app,'scripts/process-engine.mjs')));
const processGeometry=await json('docs/evidence/process-geometry.json');
assert(processGeometry.passed>=19 && processGeometry.passed===processGeometry.expected);
assert.equal(processGeometry.physical_process_prediction,false);
assert.equal(processGeometry.actual_cells,1296);assert.equal(processGeometry.closed_voids,1);
for(const [file,expected] of Object.entries(processGeometry.source_sha256))assert.equal(await hash(path.join(root,file)),expected,`Process geometry evidence changed: ${file}`);
const processUi=await json('docs/evidence/process-ui.json');
for(const key of ['whole_input_inspected_when_material_hidden','actual_XYZ_section_and_png','closed_void_detected','portable_GDS_bytes_and_process_preserved','no_native_auth_requests','actual_ascii_VTU_nm_conversion','unsafe_entity_binary_higher_order_and_missing_units_rejected','failed_import_preserves_previous_volume','workspace_revision_preserved','material_specific_criteria_saved','explicit_association_and_stale_guard','reopen_preserves_process_document','narrow_footer_reachable'])assert.equal(processUi[key],true,`Process UI gate: ${key}`);
assert.equal(processUi.browser_errors.length,0);
const processRelease=await json('docs/evidence/process-release.json');assert.equal(processRelease.version,metadata.version);
assert.equal(processRelease.physical_process_prediction,false);assert(processRelease.cold_desktop_no_worker_session&&processRelease.desktop_node_isolated);
assert.equal(processRelease.browser_errors.length,0);assert.equal(processRelease.windows.content_sha256,processRelease.linux.content_sha256);
for(const runtime of [processRelease.windows,processRelease.linux])assert(runtime.worker_executed&&runtime.cells===1296&&runtime.closed_voids===1&&runtime.section_cells>0&&runtime.no_native_requests&&runtime.min_thickness_um===.02);
for(const [file,expected] of Object.entries(processRelease.source_sha256))assert.equal(await hash(path.join(root,file)),expected,`Process release evidence source changed: ${file}`);
const appearance = await json('docs/evidence/appearance-ui.json');
assert.equal(appearance.eight_palettes.length, 8);
assert.equal(new Set(appearance.eight_palettes.map(entry => `${entry.skin}:${entry.mode}`)).size, 8);
for (const entry of appearance.eight_palettes) {
  assert(Object.values(entry.text_contrast).every(value => value >= 4.5));
  entry.background.slice(1).match(/../g).forEach((hex, index) => assert(Math.abs(parseInt(hex,16) - entry.actual_canvas_pixel[index]) <= 2));
}
for (const key of ['geometry_and_PDK_layer_colors_preserved','renderer_and_camera_preserved','no_native_or_cloud_requests',
  'legacy_theme_migrated','saved_appearance_restored','system_mode_changes_live','keyboard_radio_and_focus_return',
  'cross_tab_appearance_sync','narrow_dialog_footer_reachable','workspace_project_revision_preserved','workspace_geometry_count_preserved','primary_actions_readable']) assert.equal(appearance[key], true, `Appearance UI gate: ${key}`);
assert.equal(appearance.actual_GDS_shapes,52);
assert.equal(appearance.workspace_panels.length,6);
const primaryActions = appearance.workspace_panels.flatMap(entry => entry.primary_actions);
assert(primaryActions.length > 0 && primaryActions.every(entry => entry.contrast >= 4.5));
assert.equal(appearance.browser_errors.length,0);
const appearanceRelease = await json('docs/evidence/appearance-release.json');
assert.equal(appearanceRelease.version,metadata.version);
for (const key of ['executable_logo_embedded','desktop_temporary_profile_verified','desktop_skin_restored_after_restart',
  'desktop_node_isolated','desktop_Docker_absent_and_no_worker_session','remote_asset_hashes_match','remote_no_native_or_auth_requests']) assert.equal(appearanceRelease[key], true, `Appearance release gate: ${key}`);
assert.equal(appearanceRelease.remote_palettes.length,8);
assert.equal(new Set(appearanceRelease.remote_palettes.map(entry => `${entry.skin}:${entry.mode}`)).size,8);
assert.equal(appearanceRelease.remote_actual_GDS_shapes,52);
assert.equal(appearanceRelease.browser_errors.length,0);
for (const entry of appearanceRelease.remote_palettes) entry.actual_canvas_background.slice(1).match(/../g).forEach((hex,index) => assert(Math.abs(parseInt(hex,16) - entry.actual_canvas_pixel[index]) <= 2));
for (const [file,expected] of Object.entries(appearanceRelease.source_sha256)) assert.equal(await hash(path.join(root,file)),expected,`Appearance evidence source changed: ${file}`);
const brand = await json('docs/evidence/brand-assets.json');
assert.deepEqual(brand.icon_sizes,[16,24,32,48,64,128,256]);
assert.equal(await hash(path.join(root,brand.source)),brand.source_sha256);
assert.equal(await samePackagedFile('apps/desktop/assets/register.ico'),brand.ico_sha256);
assert.equal(await samePackagedFile('apps/desktop/assets/register.png'),brand.png_sha256);
const units = await json(`docs/evidence/unit-tests-${metadata.version.split('.').slice(0,2).join('.')}.json`);
assert.equal(units.version, metadata.version);
for (const suite of ['contracts', 'viewer', 'importer']) assert.equal(units[suite].failed, 0);
for (const [file, expected] of Object.entries(units.source_sha256)) assert.equal(await hash(path.join(root, file)), expected, `Unit evidence source changed: ${file}`);
const pdk = await json('docs/evidence/pdk-setup.json');
assert(pdk.cases.length >= 32 && pdk.cases.every(entry => entry.result === 'pass'));
const pdkAudit = await json('docs/evidence/pdk-setup-audit.json');
assert.equal(pdkAudit.failed, 0); assert(pdkAudit.passed >= 39);
const pdkUi = await json('docs/evidence/pdk-setup-ui.json');
assert(pdkUi.naked_GDS_without_sidecar && pdkUi.saved_history_reopened && pdkUi.user_path_preserves_actual_samples);
assert.equal(pdkUi.browser_errors.length, 0);
const pdkCloud = await json('docs/evidence/pdk-cloud.json');
assert.equal(pdkCloud.actual_current_source, 'ngspice'); assert(pdkCloud.checks.length >= 4);
const pdkBackup = await json('docs/evidence/pdk-backup.json');
assert(pdkBackup.registry_preserved && pdkBackup.managed_models_explicitly_included_and_hash_verified);
assert(pdkBackup.backend_resources_excluded_by_default && pdkBackup.backend_resources_explicitly_included);
const backend = await json('docs/evidence/commercial-backend.json');
assert(backend.cases.length >= 23 && backend.cases.every(entry=>entry.result==='pass'));
const backendResults = await json('docs/evidence/commercial-results.json');
assert.equal(backendResults.parser_suite.status,'pass');assert(backendResults.parser_suite.test_count>=21);
assert.equal(backendResults.vendor_execution_verified,false);
const backendAudit = await json('docs/evidence/commercial-audit.json');
assert.equal(backendAudit.audit_suite.status,'pass');assert(backendAudit.audit_suite.test_count>=9);
assert.equal(backendAudit.vendor_execution_verified,false);
for(const report of [backendResults,backendAudit])for(const [file,expected] of Object.entries(report.source_hashes))assert.equal(await hash(path.join(root,file)),expected,`Native evidence source changed: ${file}`);
const backendUi = await json('docs/evidence/commercial-backend-ui.json');
assert(backendUi.zero_rpc_before_explicit_action && backendUi.no_vendor_job_launched);
assert(backendUi.actual_open_source_calibration?.actual_artifact_download && backendUi.actual_open_source_calibration?.saved_history_reopened);
assert.equal(backendUi.actual_open_source_calibration.vendor_execution,false);
assert.equal(backendUi.browser_errors.length,0);
const backendCloud = await json('docs/evidence/commercial-cloud.json');
assert(backendCloud.checks.length>=4);assert.equal(backendCloud.vendor_execution_verified,false);
const interchange=await json('docs/evidence/interchange.json');
assert(interchange.cases?.length>=31&&interchange.cases.every(entry=>entry.result==='pass'));
assert.equal(interchange.vendor_execution_verified,false);
assert(interchange.source_sha256?.['workers/eda/interchange.py']&&interchange.source_sha256?.['workers/eda/server.py']);
for(const [file,expected] of Object.entries(interchange.source_sha256||{}))assert.equal(await hash(path.join(root,file)),expected,`File interchange evidence source changed: ${file}`);
const interchangeUi=await json('docs/evidence/interchange-ui.json');
assert(interchangeUi.local_inspection_without_rpc&&interchangeUi.native_import_export&&interchangeUi.external_current_samples);
assert.equal(interchangeUi.browser_errors.length,0);
const interchangeCloud=await json('docs/evidence/interchange-cloud.json');
assert(interchangeCloud.checks.length>=4);assert.equal(interchangeCloud.current_source,'imported');
const primary=await json('docs/evidence/interchange-primary.json');
assert.equal(primary.parser_sha256,await hash(path.join(root,'packages/importer/src/compat.ts')));
assert(primary.records.length>=2&&primary.records.every(record=>record.diagnostic_errors===0&&record.no_inferred_gds));
assert.equal(primary.vendor_execution_verified,false);
const database=await json('docs/evidence/native-database.json');
assert(database.cases?.length>=20&&database.cases.every(entry=>entry.result==='pass'));
assert.equal(database.vendor_execution_verified,false);
for(const [file,expected] of Object.entries(database.source_sha256||{}))assert.equal(await hash(path.join(root,file)),expected,`Native database source changed: ${file}`);
assert(database.source_sha256?.['workers/eda/native_database.py']);
const databaseCloud=await json('docs/evidence/native-database-cloud.json');
assert(databaseCloud.checks.length>=4);assert.equal(databaseCloud.actual_reader,'klayout-file');assert.equal(databaseCloud.vendor_execution_verified,false);
const databaseUi=await json('docs/evidence/native-database-ui.json');
assert(databaseUi.local_review_without_rpc&&databaseUi.original_database_panel_without_rpc);
assert(databaseUi.native_source_registration_and_diagnostics&&databaseUi.native_neutral_graph_import);
assert.equal(databaseUi.vendor_execution_verified,false);assert.equal(databaseUi.browser_errors.length,0);
const review=await json('docs/evidence/viewer-review.json');
assert(review.passed>=20&&review.passed===review.cases);
assert.equal(review.scope.worker_rpc,false);assert.equal(review.scope.geometry_inference,false);
for(const [file,expected] of Object.entries(review.source_sha256))assert.equal(await hash(path.join(root,file)),expected,`Design review source changed: ${file}`);
const current = await json('docs/evidence/current-flow.json');
const currentCases = [...current.isolated_actual_engine.cases, ...current.live_authenticated_api.cases];
assert.equal(currentCases.length, current.case_count);
assert.equal(current.case_count, 20);
assert(currentCases.every(entry => entry.result === 'pass'));
const compatibility = await json('docs/evidence/current-flow-0.4-compatibility.json');
assert.equal(compatibility.cases.length, 16); assert(compatibility.cases.every(entry => entry.result === 'pass'));
const concurrency = await json('docs/evidence/current-concurrency.json');
assert.equal(concurrency.regression.cases.length, 3);
assert(concurrency.regression.cases.every(entry => entry.result === 'pass'));
const linux = await json('docs/evidence/cloud-container.json');
assert(linux.actual_current_direction_viewer && linux.public_standalone_viewer_without_login_or_rpc);
assert(linux.registered_pdk_configured_analysis && linux.configured_job_restored_in_remote_setup_ui);
assert(linux.configured_analysis_started_from_remote_button);
assert(linux.native_backend_started_from_remote_button && linux.native_backend_saved_history_restored);
assert(linux.file_interchange_import_export_from_remote_ui);
assert(linux.file_interchange_current_import_from_remote_ui);
assert(linux.native_database_from_remote_ui && linux.loaded_design_review_without_local_rpc);
assert(linux.integrated_pvt_from_remote_ui && linux.integrated_route_from_remote_ui && linux.integrated_connectivity_from_remote_ui && linux.integrated_stale_after_route);
assert.equal(linux.native_database_read.reader,'klayout-file');
assert.equal(linux.native_database_read.vendor_execution_verified,false);
assert.equal(linux.actual_backend_calibration.vendor_execution_verified,false);
assert.equal(linux.browser_errors.length, 0);
assert(linux.runs.every(run => run.result === 'pass'));
const cold = await json('docs/evidence/windows-viewer-only.json');
assert(cold.docker_not_on_PATH && cold.empty_workspace && !cold.native_session_created);
const local = await json('docs/evidence/standalone-viewer.json');
assert(local.no_native_auth_cloud_requests && local.real_lyp_import);
assert.equal(local.browser_errors.length, 0);
const native = await json('docs/evidence/native-current-viewer.json');
assert(native.two_and_three_dimensional_arrows && native.portable_bundle_no_rpc && native.stale_arrows_withheld);
const cloud = await json('docs/evidence/cloud-integration.json');
const mcp = await json('docs/evidence/mcp-integration.json');
assert.equal(mcp.tools.length,33);assert(mcp.actual_worker);
assert(mcp.actual_pvt?.run_id && mcp.actual_pvt.parent_immutable && mcp.actual_pvt.stale_after_edit);
assert(mcp.actual_route?.preview_hash && mcp.actual_route.rule_fingerprint);
assert(mcp.actual_template?.project_id);
assert(mcp.actual_native_database?.read_id && mcp.actual_native_database?.graph_sha256);
assert.equal(mcp.actual_native_database.vendor_execution_verified,false);
assert.equal(path.resolve(mcp.entry_path),path.resolve(app,'scripts/mcp.mjs'));
assert.equal(mcp.entry_sha256,await hash(path.join(app,'scripts/mcp.mjs')));

const pvt=await json('docs/evidence/pvt.json');
const design=await json('docs/evidence/design-tools.json');
for(const report of [pvt,design]){
  assert(report.case_count>0 && report.passed===report.case_count);
  assert(report.source_sha256?.['workers/eda/server.py']);
  for(const [file,expected] of Object.entries(report.source_sha256))assert.equal(await hash(path.join(root,file)),expected,`Integrated native evidence source changed: ${file}`);
}
const integratedCloud=await json('docs/evidence/integrated-cloud.json');
assert(integratedCloud.checks.length>=4 && integratedCloud.points.length===2);
assert.equal(integratedCloud.actual_engine,'ngspice');
assert(integratedCloud.points.every(point=>point.analysis_result==='pass' && point.run_id));
const integratedUi=await json('docs/evidence/integrated-tools-ui.json');
assert(integratedUi.zero_rpc_before_explicit_action && integratedUi.actual_pvt && integratedUi.actual_route && integratedUi.actual_template);
assert.equal(integratedUi.browser_errors.length,0);

const workerHashes = {};
for (const file of await files(path.join(root, 'workers/eda'))) {
  if (file.endsWith('.py')) {
    const relative = path.relative(root, file);
    workerHashes[path.relative(path.join(root, 'workers/eda'), file)] = await samePackagedFile(relative);
  }
}
const rendererHashes = {};
for (const file of await files(path.join(root, 'dist'))) {
  rendererHashes[path.relative(path.join(root, 'dist'), file)] = await samePackagedFile(path.relative(root, file));
}
const backendHashes={};
for(const directory of ['platform/commercial','adapters/commercial'])for(const file of await files(path.join(root,directory))){
  if(file.includes('__pycache__'))continue;
  const relative=path.relative(root,file);backendHashes[relative]=await samePackagedFile(relative);
}
const sourceHashes = {};
for (const file of ['apps/desktop/main.cjs', 'apps/desktop/preload.cjs', 'platform/cloud/hub.mjs',
  'scripts/runtime.mjs', 'scripts/worker.mjs', 'scripts/cloud-backup.mjs', 'scripts/commercial-agent.mjs', 'adapters/pdks/sky130/display.json',
  'adapters/pdks/sky130/sky130A.lyp', 'examples/sky130/current-viewer.register-view.json',
  'examples/sky130/configured-mosfet.register-view.json', 'examples/sky130/mosfet.analysis-setup.json']) {
  sourceHashes[file] = await samePackagedFile(file);
}
const evidencePath = 'docs/evidence/release.json';
const previous = await json(evidencePath);
if (previous.version !== metadata.version) {
  const archive = path.join(root, `docs/evidence/release-${previous.version}.json`);
  try { await stat(archive); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await cp(path.join(root, evidencePath), archive, { errorOnExist: true, force: false });
  }
}
const exe = path.join(root, 'release/Register-win32-x64/Register.exe');
const release = {
  finalized_at: new Date().toISOString(), product: '레지스터 / Register', version: metadata.version,
  platform: 'Windows x64 + isolated Docker Linux collaboration stack',
  exe_path: exe, exe_bytes: (await stat(exe)).size, exe_sha256: await hash(exe),
  package_lock_sha256: await hash(path.join(root, 'package-lock.json')),
  process_geometry_checks:processGeometry.passed,process_ui_scenarios:3,process_windows_linux_worker_verified:true,
  process_recipe_checks:processRecipe.passed,process_recipe_ui_scenarios:3,process_kinematic_prediction_verified:true,process_flow_windows_linux_and_cli_verified:true,process_flow_recipe_sha256:processFlowRelease.windows_cli.recipe_sha256,process_engine_bundle_sha256:processEngineHash,
  process_source_sha256:processRelease.source_sha256,process_checked_at:processRelease.checked_at,
  process_physical_prediction_verified:false,process_scope:'Imported XYZ conforming tetra inspection plus actual rate-driven 3D voxel conformal/directional deposition, selective isotropic/directional etch, first-hit ray shadowing and local single-bounce reemission, Preston/ideal-plane CMP, GDS masks with holes, tetra resampling, h/2h comparison, planar rate fit, stage histories and Node CLI/VTU exports. Uncalibrated kinematic model; no chemistry/plasma/coupled-device physics or foundry signoff.',
  appearance_skins:['graphite','jade','copper','iris'],appearance_modes:['light','dark','system'],
  appearance_ui_checks:appearance.eight_palettes.length,appearance_primary_text_contrast_min:Math.min(...appearance.eight_palettes.flatMap(entry=>Object.values(entry.text_contrast))),
  appearance_primary_action_contrast_min:Math.min(...primaryActions.map(entry=>entry.contrast)),
  appearance_workspace_panels:appearance.workspace_panels.length,appearance_preserves_GDS_PDK_camera_revision:true,
  appearance_saved_and_system_keyboard_tab_sync_verified:true,
  appearance_windows_restart_and_isolated_profile_verified:true,appearance_linux_palettes_verified:appearanceRelease.remote_palettes.length,
  appearance_checked_at:appearanceRelease.checked_at,appearance_source_sha256:appearanceRelease.source_sha256,
  original_vector_logo_sha256:brand.source_sha256,windows_icon_embedded:true,windows_icon_sizes:brand.icon_sizes,
  worker_sha256: workerHashes, renderer_sha256: rendererHashes, integration_source_sha256: sourceHashes,backend_source_sha256:backendHashes,
  packaged_source_and_assets_match: true,
  mcp_bundle_sha256: await hash(path.join(app, 'scripts/mcp.mjs')),
  mcp_bundle_actual_handshake_verified: true, mcp_typed_tools: mcp.tools.length,
  integrated_pvt_native_checks:pvt.case_count,integrated_design_native_checks:design.case_count,
  integrated_cloud_checks:integratedCloud.checks.length,integrated_tools_ui_verified:true,
  integrated_eda_scope:'Actual bounded ngspice PVT, explicit supply bindings, immutable source, worst measured conditions; conservative installed SKY130 met1 Manhattan preview/apply; connected circuit templates and explicit pin-net/device mapping. Physical verification remains independent.',
  contracts_tests: units.contracts.passed, viewer_unit_tests: units.viewer.passed, importer_unit_tests: units.importer.passed,
  configured_pdk_native_checks: pdk.cases.length, independent_pdk_checks: pdkAudit.passed,
  pdk_setup_ui_verified: true, pdk_cloud_checks: pdkCloud.checks.length, managed_pdk_backup_verified: true,
  commercial_catalog_families:17,commercial_backend_native_checks:backend.cases.length,
  commercial_result_parser_fixture_checks:backendResults.parser_suite.test_count,
  independent_commercial_bridge_checks:backendAudit.audit_suite.test_count,
  commercial_backend_ui_verified:true,commercial_backend_cloud_checks:backendCloud.checks.length,
  file_interchange_native_checks:interchange.cases.length,file_interchange_ui_verified:true,
  file_interchange_cloud_checks:interchangeCloud.checks.length,
  native_database_checks:database.cases.length,native_database_cloud_checks:databaseCloud.checks.length,native_database_ui_verified:true,
  native_database_execution_gate:'Commercial tools/OpenAccess SDK absent; public KLayout source reads and clearly synthetic boundary tests do not establish vendor execution.',
  design_review_checks:review.passed,design_review_ui_verified:true,
  design_review_scope:'Loaded scene search, exact integer ruler, project/revision/scope bookmarks, loaded scene comparison and signed actual-result CSV. Partial scope remains explicit.',
  file_interchange_public_pdk_sources:primary.records.map(record=>({name:record.name,sha256:record.sha256,format:record.format,layers:record.layers})),
  commercial_execution_verified:false,commercial_execution:'No commercial tools installed; installation and release-specific site/licensed flow required.',
  actual_backend_calibration:'Public ngspice local/agent and Linux shared UI; 1V/1kOhm signed source/resistor -/+1mA.',
  actual_native_current_checks: current.case_count, concurrent_native_thread_checks: concurrency.regression.cases.length,
  prior_signed_current_compatibility_checks: compatibility.cases.length,
  ui_tests: ui.stats, cloud_native_integration_checks: cloud.checks,
  linux_current_and_standalone_viewer_verified_at: linux.checked_at,
  remote_linux_web_physical_test_passed: true, windows_cold_viewer_without_docker_or_credentials: true,
  remote_linux_native_database_ui_verified:true,remote_linux_loaded_design_review_ui_verified:true,
  remote_linux_integrated_pvt_route_connectivity_ui_verified:true,
  standalone_local_files_without_rpc_or_auth: true, native_signed_current_2d_3d_and_stale_gates: true,
  actual_saved_mos_op_current_A: native.current_A,
  prior_extended_native_and_performance_baseline: 'docs/evidence/release-0.2.0.json',
  prior_signed_current_and_cold_viewer_baseline: 'docs/evidence/release-0.3.0.json',
  prior_registered_pdk_baseline:'docs/evidence/release-0.4.0.json',
  prior_integrated_linux_physical_baseline:'docs/evidence/release-0.8.0.json',
  appearance_release_native_scope:'Worker and collaboration backend unchanged. Native baseline source hashes and current packaged files match; current Windows full UI and Linux appearance rerun verified.',
  inherited_verification_baselines:['docs/evidence/pdk-setup-audit.json','docs/evidence/current-flow.json','docs/evidence/current-flow-0.4-compatibility.json','docs/evidence/current-concurrency.json'],
  paid_supabase_project_created: false, external_hosting: 'not_provisioned',
  signing: 'unsigned development distribution',
  supported_current_mapping: 'Verified generated single-MOS D/S contacts; explicit external user paths; unmapped branches numeric only.',
  current_limits: 'No scalar AC arrows, TCAD/current-density fields, or full distributed PEX R/C branch mapping.',
  pdk_scope: 'Public SKY130A and validated compatible ngspice/Magic profiles. Cadence/Synopsys/Siemens native adapter/agent implemented; actual vendor execution awaits installed tools, licensed PDK/site recipes and version verification.',
  native_format_scope:'Actual GDS/OAS native import/export and KLayout LEF/DEF reading with explicit layer maps; Cadence ASCII tech/display/library definitions and CDL/SPICE metadata/preserved export; imported signed numeric results. Raw OA/Milkyway/NDM and binary result formats require native SDK/exporter.',
  direct_database_scope:'Fixed Cadence read-only cellview and ICC2/Fusion DB API query scripts with immutable operator resources; original DB execution awaits installed tools and release validation. Standalone OpenAccess C++ SDK and Custom Compiler direct DB API reader are not implemented.',
  commercial_current_scope:'Actual signed exported numeric currents, unverified GDS/opaque-library correspondence and explicit user paths.'
};
await writeFile(path.join(root, evidencePath), `${JSON.stringify(release, null, 2)}\n`);
for (const directory of ['docs', 'examples']) await cp(path.join(root, directory), path.join(app, directory), { recursive: true });
for (const file of ['README.md', 'workers/eda/IMPLEMENTATION.md', 'workers/eda/PDK_SETUP.md']) await cp(path.join(root, file), path.join(app, file));
assert.equal(await hash(path.join(root, evidencePath)), await hash(path.join(app, evidencePath)));
console.log(JSON.stringify({ version: release.version, packaged_assets_match: true, exe_bytes: release.exe_bytes,
  ui_passed: ui.stats.expected, native_current_passed: current.case_count, concurrent_native_passed: concurrency.regression.cases.length,
  appearance_palettes:appearance.eight_palettes.length,appearance_linux_palettes:appearanceRelease.remote_palettes.length,windows_icon_and_skin_restart_verified:true,
  process_geometry_checks:processGeometry.passed,process_recipe_checks:processRecipe.passed,process_windows_linux_verified:true,process_flow_windows_linux_and_cli_verified:true,process_physical_prediction_verified:false,
  configured_pdk_checks: pdk.cases.length, independent_pdk_checks: pdkAudit.passed,
  commercial_backend_checks:backend.cases.length,commercial_parser_checks:backendResults.parser_suite.test_count,
  file_interchange_checks:interchange.cases.length,file_interchange_cloud_checks:interchangeCloud.checks.length,
  native_database_checks:database.cases.length,native_database_cloud_checks:databaseCloud.checks.length,design_review_checks:review.passed,
  commercial_bridge_checks:backendAudit.audit_suite.test_count,commercial_execution_verified:false,
  linux_current_and_standalone_viewer_passed: true, evidence: path.join(root, evidencePath) }, null, 2));
