import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const releaseBase = 'https://github.com/Lead729726-cell/Resistor/releases/download/v0.16.1/';
export const tutorialMedia = {
  file: 'tutorial-assets/guide-ko-v1.mp4',
  url: releaseBase + 'Resistor-Guide-KO-clean.mp4',
  bytes: 19895880,
  sha256: '12b79c68f3ea311ea126da89013998bb7fa49af54e47e3c0c1ad4711e3d6d6e8'
};
const chapters = [
  ['오늘 만들 결과', 0], ['다운로드와 엔진', 23.7],
  ['첫 반도체와 공정 조건', 62], ['회로와 소자 편집', 111.86666666666667],
  ['실제 시뮬레이션 실행', 161.33333333333331], ['전압·전류와 신호 시험', 209.06666666666666],
  ['파형 커서와 수치 측정', 262.33333333333337], ['레이아웃과 실제 검증', 300.96666666666675],
  ['GDS 저장과 독립 뷰어', 354.36666666666673], ['직접 따라 해보기', 395.5666666666668]
].map(([title, start_s]) => ({title, start_s}));
const clock = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export async function prepareTutorialSite(root) {
  const folder = path.join(root, 'platform/download-site');
  await mkdir(folder, {recursive: true});
  const manifest = {
    id: 'cmos-inverter-ko-v1', title: 'CMOS 회로부터 전압·전류·GDS까지', language: 'ko',
    duration_seconds: 427.367, width: 1920, height: 1080, fps: 30,
    captured_product: 'Register', captured_version: '0.16.0', current_product: 'Resistor',
    audio: 'Korean synthetic narration', subtitle_cues: 72,
    playback: tutorialMedia, chapters,
    downloads: {
      captioned_video: releaseBase + 'Resistor-Guide-KO.mp4',
      video_package: releaseBase + 'Resistor-Guide-KO-YouTube-Pack.zip',
      subtitles: '/tutorial-assets/subtitles-ko.srt',
      example: '/tutorial-assets/inverter.register.zip'
    },
    verification_scope: {
      executed: ['ngspice transient', 'signal tests 8/8', 'Magic DRC', 'Netgen LVS'],
      pex_executed: false, measured_process_z: false, spatial_current_density: false,
      full_human_listening_review: false
    }
  };
  await writeFile(path.join(folder, 'tutorial.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(folder, 'tutorial.html'), `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resistor 사용 가이드 · 회로에서 전압·전류·GDS까지</title>
<meta name="description" content="실제 Resistor 앱 조작으로 배우는 7분 7초, 1080p 한국어 사용 가이드. CMOS 인버터, 전압·전류 파형, DRC/LVS와 GDS 뷰어를 챕터별로 따라 해보세요.">
<link rel="canonical" href="https://resistor-downloads.vercel.app/tutorial/">
<link rel="icon" href="/register-symbol.svg" type="image/svg+xml">
<link rel="stylesheet" href="/tutorial.css"></head>
<body><a class="skip" href="#player">영상으로 이동</a>
<header><div class="bar"><a class="brand" href="/" aria-label="Resistor 다운로드 홈"><img src="/register-symbol.svg" alt=""><strong>Resistor</strong><span>Engineering Workbench</span></a>
<nav aria-label="사이트 메뉴"><a href="/">다운로드</a><a href="/tutorial/" aria-current="page">튜토리얼</a><a href="/pdk-links.html">PDK 모음집</a><button type="button" data-theme>화면 테마</button></nav></div></header>
<main><div class="intro"><div><p class="eyebrow">사용 가이드 · LESSON 01</p><h1>CMOS 회로부터<br class="mobile-break"> 전압·전류·GDS까지.</h1><p>실제 앱에서 인버터를 만들고, 시뮬레이션과 신호 시험을 실행한 뒤 레이아웃을 다시 열어봅니다.</p></div><div class="spec"><span>07:07</span><span>1080p · 30fps</span><span>한국어 음성 · 자막</span></div></div>
<div class="lesson"><section class="player-panel" aria-label="가이드 영상"><video id="player" controls playsinline preload="metadata" poster="/tutorial-assets/thumbnail.png" aria-label="CMOS 인버터 사용 가이드">
<source src="/${tutorialMedia.file}" type="video/mp4"><track kind="subtitles" src="/tutorial-assets/subtitles-ko.vtt" srclang="ko" label="한국어" default>
브라우저가 영상을 지원하지 않습니다. 아래 MP4 다운로드를 사용하세요.</video>
<div class="transport"><button id="play-toggle" type="button">영상 재생</button><span id="playback-state" role="status" aria-live="polite">영상 정보 불러오는 중</span><span id="playback-clock" aria-label="재생 시간">00:00 / 07:07</span></div>
<p class="version-note">촬영 화면은 이름 변경 전 <strong>Register 0.16.0</strong>입니다. 현재 제품명은 <strong>Resistor</strong>이며 같은 작업 흐름을 사용할 수 있습니다.</p>
<noscript><p>브라우저의 기본 재생 버튼으로 시청할 수 있습니다. 챕터 이동에는 JavaScript가 필요합니다.</p></noscript></section>
<aside class="chapters" aria-labelledby="chapters-title"><div class="chapter-head"><h2 id="chapters-title">챕터</h2><span>10개</span></div><ol>${chapters.map((c, i) => `<li><button type="button" data-time="${c.start_s}"${i === 0 ? ' aria-current="true"' : ''}><time>${clock(c.start_s)}</time><span>${c.title}</span></button></li>`).join('')}</ol><p>챕터를 누르면 해당 부분부터 재생됩니다.</p></aside></div>
<section class="resources" aria-labelledby="resources-title"><h2 id="resources-title">직접 따라 해보세요.</h2><p>실습 프로젝트를 Resistor로 가져온 뒤 자신의 환경에서 해석을 실행하세요. GDS·OASIS는 뷰어에서 열 수 있습니다.</p>
<div class="resource-grid"><a class="resource primary" href="/tutorial-assets/inverter.register.zip" download><strong>인버터 실습 프로젝트 ↓</strong><span>Resistor 교환 파일 · 6.1 KiB</span></a>
<a class="resource" href="${manifest.downloads.captioned_video}"><strong>자막 포함 MP4 ↓</strong><span>1080p · 19.1 MiB</span></a>
<a class="resource" href="/tutorial-assets/subtitles-ko.srt" download><strong>한국어 자막 SRT ↓</strong><span>72개 자막 · UTF-8</span></a>
<a class="resource" href="${manifest.downloads.video_package}"><strong>영상·음성·자막 묶음 ↓</strong><span>편집용 파일과 실습 예제 · 62.6 MiB</span></a></div>
<div class="extra"><a href="/tutorial-assets/inverter.gds" download>GDS 레이아웃</a><a href="/tutorial-assets/inverter.oas" download>OASIS 레이아웃</a><a href="/tutorial-assets/inverter.spice" download>SPICE 회로</a><a href="https://github.com/Lead729726-cell/Resistor/blob/main/docs/desktop-installation.md">설치·엔진 연결 안내</a></div></section>
<details class="scope"><summary>촬영한 해석과 표시 범위</summary><p>ngspice 과도 해석, 신호 시험 8/8, Magic DRC, Netgen LVS의 실제 실행 장면을 담았습니다. PEX와 post-layout 해석은 이번 영상에서 실행하지 않았습니다.</p><p>3D 높이는 표시용이며 측정된 공정 지형이 아닙니다. 전류 화살표는 소자의 부호 있는 단자 전류를 표시하며 금속 내부의 공간 전류 밀도를 계산한 결과가 아닙니다. DRC/LVS 결과는 영상의 공개 엔진과 선택한 규칙에 한정됩니다.</p><p>한국어 합성 음성과 설명을 위한 정지·느린 재생·확대 편집을 사용했습니다.</p></details>
<footer><span>Resistor · MIT open source</span><a href="https://github.com/Lead729726-cell/Resistor">GitHub</a><a href="/tutorial.json">영상·챕터 정보</a></footer></main>
<script src="/appearance.js" defer></script><script src="/tutorial.js" defer></script></body></html>\n`);
  return manifest;
}

export async function prepareTutorialMedia(root) {
  const destination = path.join(root, 'platform/download-site', tutorialMedia.file);
  let body;
  try { body = await readFile(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const valid = data => data?.length === tutorialMedia.bytes && createHash('sha256').update(data).digest('hex') === tutorialMedia.sha256;
  if (!valid(body)) {
    const response = await fetch(tutorialMedia.url, {signal: AbortSignal.timeout(60000)});
    if (!response.ok) throw Error(`Tutorial media unavailable: ${response.status}`);
    body = Buffer.from(await response.arrayBuffer());
    if (!valid(body)) throw Error('Tutorial media size or SHA-256 mismatch');
    await mkdir(path.dirname(destination), {recursive: true});
    await writeFile(destination, body);
  }
  return {file: tutorialMedia.file, bytes: body.length, sha256: tutorialMedia.sha256};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await prepareTutorialSite(process.cwd());
  if (process.argv.includes('--prepare-media')) console.log(JSON.stringify(await prepareTutorialMedia(process.cwd())));
}
