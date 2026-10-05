# PDK and extracted-GDS analysis

The **PDK·해석 설정** button opens the setup wizard. A standalone viewer does not contact native RPC, authentication or collaboration services before this explicit action. Analysis requires the native EDA worker; the public web viewer directs users to an authenticated shared workspace instead of trying an unavailable local endpoint.

## Procedure

1. Open a GDS file in the local viewer, or open a native/shared project. Open **PDK·해석 설정**.
2. Select an installed PDK profile and press **실제 PDK 리소스 검증**. Review actual checks, capabilities, version and resource fingerprint. Layer-display LYP/JSON files provide colors/heights; extraction technology and SPICE models are separate resources.
3. In **GDS / Cell**, explicitly press **엔진으로 GDS 가져오기** when starting from a local viewer. This uploads original bytes to a separate native project, retaining the local file. Choose the extraction cell and press **실제 GDS 추출 포트 검사**. Ports come from actual Magic extraction; labels alone are not treated as connectivity.
4. In **포트 바이어스**, assign every discovered port exactly once: Ground, DC Voltage, or Floating. Initial ports are visibly floating. A MOS preset is offered only when the exact four B/D/S/G ports were discovered; it visibly sets B/S ground, D=1.8 V, G=0.9 V and can be edited. A ground reference is required by backend validation.
5. In **해석 조건**, select OP, a DC sweep of an actual voltage-biased port, or transient response with the specified DC inputs. Choose the declared model corner, temperature and supported PEX option. LVS additionally needs safe reference-SPICE text. Time-varying PULSE inputs and complex AC direction are outside this setup subset.
6. Press **검증하고 해석 설정 저장**. The worker persists the conditions with a new revision. Profile/hash/cell/revision changes invalidate the earlier inspection or saved execution gate. Unsaved input can be reset to server values; setup JSON can be exported/imported without silently launching jobs.
7. In **실행 / 결과**, run actual extraction + simulation or supported DRC/LVS/PEX. Check execution, analysis result, freshness, manifests, raw waveforms and logs. Cancellation is a native job request. Failed extraction, models, biases or convergence remain visible worker errors.
8. Current results retain actual signed ampere samples and source vectors. Unmapped branches remain numerical. **전류 경로 편집** can associate a branch with an actual layer and an explicitly confirmed signed-integer DBU polyline. This is a user-supplied display path; values remain unchanged and no physical conductive path/current-density field is invented.
9. Export a `.register-view.json` to preserve scene, current data, display settings, setup and optional original GDS. Known stale results retain their flag. Switching cells suspends old current paths; changing a path cannot reactivate a stale result.

## Adding a profile

Local users can select **새 PDK 등록**, import a manifest JSON or edit the profile ID/name/version, worker root, Magic rc/technology, Netgen setup, model file/mode, corners, scale and optional layer-file path. A package ZIP is optional and limited to 16 MiB. Uploaded executable decks must match installed verified resource hashes; additional model dependencies must remain within supported managed roots. Unsupported or missing resources are reported by the actual validator. Shared users choose server-installed profiles; registering/uploading PDK resources requires server administrator setup.

The manifest and setup downloads contain configuration data, never worker credentials. Setup submissions whitelist public AnalysisSetup input fields so internal server inspection metadata is not replayed as user input.

## Verification

TypeScript and the existing standalone viewer smoke test passed after integration. The three focused Playwright tests passed in 58.4 seconds after the final native checkpoint: naked MOS GDS OP/DC/DRC/PEX, missing-ground rejection, dirty reset, repeated saved-bias edits, setup JSON reimport, four persisted jobs, native-current path preservation, manifest/ZIP filename handling, actual invalid-resource rejection and an alternate actual MOS top cell. LVS stays disabled without reference SPICE. The setup footer remained visible at 1280×640. Actual PEX returned 57 resistors and 6 capacitors; the DC sweep returned 10 signed-current samples.

Evidence is in `qa/pdk-setup-evidence.json`, copied to `docs/evidence/pdk-setup-ui.json`, with actual Run/setup/bundle JSON files and `register-pdk-configured-current.png` / `register-pdk-setup-short-height.png`. Earlier failures and traces are retained separately in `qa/pdk-setup-first-attempt` and `qa/pdk-setup-callback-attempt`. Those attempts exposed and fixed the test's old-run selection race and the terminal polling cleanup race that canceled the scene/current callback.
