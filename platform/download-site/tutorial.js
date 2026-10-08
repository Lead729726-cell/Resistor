(() => {
  const video = document.querySelector('#player');
  const play = document.querySelector('#play-toggle');
  const state = document.querySelector('#playback-state');
  const time = document.querySelector('#playback-clock');
  const chapters = [...document.querySelectorAll('[data-time]')];
  const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  let waiting = false;
  const update = () => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    time.textContent = `${clock(video.currentTime)} / ${duration ? clock(duration) : '07:07'}`;
    play.textContent = video.paused ? '영상 재생' : '일시정지';
    if (video.error) state.textContent = '영상을 불러오지 못했습니다. MP4 다운로드를 사용하세요.';
    else if (!duration) state.textContent = '영상 정보 불러오는 중';
    else if (video.ended) state.textContent = '시청 완료';
    else if (waiting || video.seeking) state.textContent = '영상 불러오는 중';
    else state.textContent = video.paused ? '재생 준비 · 한국어 자막 CC' : '재생 중';
    let selected = 0;
    chapters.forEach((button, index) => { if (Number(button.dataset.time) <= video.currentTime + 0.1) selected = index; });
    chapters.forEach((button, index) => { if (index === selected) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current'); });
  };
  const start = async () => {
    try { await video.play(); } catch {
      if (!video.error) state.textContent = '재생 버튼을 눌러 영상을 시작하세요.';
    }
  };
  play.addEventListener('click', () => video.paused ? start() : video.pause());
  chapters.forEach(button => button.addEventListener('click', () => {
    const seconds = Number(button.dataset.time);
    const seek = () => { video.currentTime = Math.min(seconds, video.duration); start(); };
    if (video.readyState > 0) seek(); else video.addEventListener('loadedmetadata', seek, {once: true});
    history.replaceState(null, '', `#t=${seconds.toFixed(3)}`);
  }));
  const deepLink = () => {
    const match = /^#t=(\d+(?:\.\d+)?)$/.exec(location.hash);
    if (match) video.currentTime = Math.min(Number(match[1]), video.duration);
    update();
  };
  video.addEventListener('loadedmetadata', deepLink);
  window.addEventListener('hashchange', () => { if (video.readyState > 0) deepLink(); });
  ['timeupdate', 'play', 'pause', 'ended', 'seeking', 'seeked', 'error'].forEach(event => video.addEventListener(event, update));
  video.addEventListener('waiting', () => { waiting = true; update(); });
  ['playing', 'canplay', 'seeked'].forEach(event => video.addEventListener(event, () => { waiting = false; update(); }));
  update();
})();
