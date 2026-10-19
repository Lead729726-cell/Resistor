# Resistor Indust instructor filming tools

The app's lecture studio (`Ctrl+Shift+F9`) includes RC, blank-divider, inverter,
layout and four oscillator project plans. Select a plan, create a separate demo,
then run the real engine yourself. Opening a plan or changing a step does not run
analysis. `F8` restores the surrounding workbench panels. Presenter notes open in
a separate window; capture only the workbench window.

## Private course preparation

Instructor manuscripts, answer keys, source material and recordings belong below
`teaching-private/`. Git and the Vite development file server exclude that folder.
Do not publish it to the download portal. The read-only instructor console binds
to IPv4 loopback and exposes only the generated package, without engine tokens.

```powershell
npm run course:prepare
npm run course:serve
```

These commands require a locally authored
`teaching-private/inflearn-resistor/course.json`. A private manuscript is deliberately
not included in the open-source repository. Its schema has course metadata
(`schema_version: 1`, bounded `id`, title, audience, `planned_total_minutes`,
`platform_reference.url`) and a `lessons` array. Every lesson has a numeric `id`,
section, title, minutes, demo, plan, goal, opening, explanations, actions,
observations, error case, assignment and instructor answer. The validator in
[course-kit.mjs](../scripts/course-kit.mjs) is the executable schema.

Preparation creates an isolated native-engine workspace, checks actual OP/transient
and GDS/OASIS roundtrips, and exports eight editable student starter bundles.
Import drops previous engine results. Preparation refuses to replace edited demo
revisions; use a new private session folder with `--base=teaching-private/session2`.
Existing user projects and the Edu workspace are not used.

The instructor console is `http://127.0.0.1:5189/`; its separate workbench is
`http://127.0.0.1:5188/eda`. Close with `Ctrl+C`. It stops only the engine it started.
The student handout ZIP excludes instructor scripts and answers. ZIPs contain no
runtime binaries; the environment handout records the required source snapshot.

## Recording checks

Use 1920×1080, 16:9 and 30 fps as the production target. Set microphone and window
capture in OBS, then listen to a short test before a full take. The guide below
was checked on 2026-10-19; recheck before submitting a course.

[Inflearn's official video guide](https://inflab-1.gitbook.io/inflearn/lecture-video/format)
specifies minimum 1080p, supported frame rates and containers, file size limits and
an audio track (even for a silent video). This kit targets H.264/yuv420p with
44.1 kHz stereo AAC at 256 kbps. A metadata checker can inspect an actual file:

```powershell
npm run course:check-video -- EP01.mp4 --ffprobe "path/to/ffprobe"
```

Metadata acceptance is separate from human audio listening, subtitle correction,
instructional review and Inflearn approval. Planned cue times are not subtitles
or actual recorded chapter times. No narration service, course upload or payment
is triggered by these tools.

```powershell
npm run test:course
npm run test:lecture
```

With the private course console running, `npm run course:rehearse` drives the real
app, creates a new isolated demo, presses Simulate and records a silent 1080p
browser rehearsal. It preserves the prepared instructor projects. Its raw WebM
is 25 fps; a 30 fps export duplicates frames and does not prove native 30 fps
capture or microphone quality. Evidence stays in the private course folder.
