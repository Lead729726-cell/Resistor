Focused UI scenario (editor_ui owns execution, no parallel browser workload):

1. Open an actual loaded GDS scene, show DesignReviewPanel. Spy transport; this panel must call zero RPC.
2. Search one actual loaded shape ID/net, click result and verify shared selection/focus. Search result counts describe only loaded shapes.
3. Open 거리. Type A=(900719925474099300000000,0), B=(900719925474099300000300,400), DBU=0.001. Read exact Δ=(300,400) DBU, Manhattan700 DBU, distance500 DBU/0.5µm. Also select actual outer/hole vertex into A; do not generate bbox points.
4. Save a selected-shape bookmark. Export/download JSON; reload/import restores only same project/revision/scope. Wrong revision import must show STALE and never select another occurrence.
5. Capture current scene as baseline, then load a changed explicit polygon fixture or edit actual design through normal authorized UI. Compare changed integer shape contours. Truncated/ROI scope must remain disclosed; one-sided loaded IDs are not globally asserted as added/deleted.
6. Supply actual result CurrentFlow (or clearly labeled supplied sample fixture) and download CSV. Verify negative current and positive/zero values, explicit from/to, A and x_unit, source/project/revision/freshness. Stale results remain numeric CSV with stale column. Formula-like text metadata is prefixed; numeric negatives stay raw numbers.
7. Download waveform CSV and compare actual x/y values/units against Run. Source/date mismatches must not be represented as spatial current mapping.

Unit data cases verify parser/ruler/export semantics only. Commercial or native simulation execution verification is separate evidence.
