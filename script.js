/*! 词块 HSK4 · 단어블록 테트리스 | © 2026 진담중국어. All rights reserved. 무단 복제·배포 금지 */
'use strict';
/* =========================================================
   词块 HSK4 (단어블록 테트리스) — script.js
   ---------------------------------------------------------
   1. 설정 저장/불러오기
   2. 사운드 (Web Audio 합성 효과음 + BGM mp3)
   3. 중국어 음성 (Tingting 우선)
   4. 블록 / 색상 / 회전(SRS)
   5. 게임 진행 (생성·이동·고정·줄 삭제·점수·레벨)
   6. 아이템 · 방해 이벤트
   7. 퀴즈
   8. 그리기 (보드·고스트·파티클·미리보기)
   9. 메인 루프 / 키 입력
  10. 화면 전환 (인트로·로비·일시정지·클리어·게임오버·랭킹·설정)
   ========================================================= */

const $ = (id) => document.getElementById(id);

/* ---------------- 1. 설정 ---------------- */
function loadJSON(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : def;
  } catch (e) {
    return def;
  }
}
function saveJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {}
}
const SETTINGS_KEY = 'cntetris_settings_v2';
const settings = Object.assign(
  { bgm: 45, sfx: 75, tts: true, rate: 85, voice: '', ghost: true, muted: false, soft: 5 },
  loadJSON(SETTINGS_KEY, {}),
);
const saveSettings = () => saveJSON(SETTINGS_KEY, settings);

/* ---------------- 2. 사운드 ---------------- */
const Sound = (() => {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  // 아이폰은 음성(TTS)·전화·알림이 나오면 오디오가 'interrupted'(중단) 상태가 됨 → 'running'이 아니면 무조건 다시 켬
  function ensure() {
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  }
  function init() {
    try {
      // iOS 17+: 무음 스위치와 상관없이 게임 소리로 재생, 다른 소리에 덜 끊기게
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
    } catch (e) {}
    if (ctx) {
      ensure();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    setVolume();
  }
  function setVolume() {
    if (master) master.gain.value = settings.muted ? 0 : (settings.sfx / 100) * 0.9;
  }
  function tone(f, dur, o = {}) {
    if (!ctx) return;
    const { type = 'sine', vol = 0.2, to = null, delay = 0, attack = 0.004 } = o;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }
  function noise(dur, o = {}) {
    if (!ctx) return;
    const { vol = 0.2, freq = 2000, to = null, type = 'lowpass', delay = 0, q = 0.7 } = o;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(freq, t);
    if (to) filt.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.03);
  }
  // 종소리 (배음 3개)
  function bell(f, dur, vol, delay = 0) {
    tone(f, dur, { vol, delay });
    tone(f * 2, dur * 0.6, { vol: vol * 0.35, delay });
    tone(f * 3.01, dur * 0.3, { type: 'triangle', vol: vol * 0.1, delay });
  }
  // 중국풍 5음계 (궁상각치우: C D E G A)
  const PENTA = [0, 2, 4, 7, 9];
  function pn(i) {
    const oct = Math.floor(i / 5);
    const deg = ((i % 5) + 5) % 5;
    return 523.25 * Math.pow(2, oct + PENTA[deg] / 12);
  }
  function gong(delay = 0, vol = 0.4) {
    tone(98, 2.2, { vol, delay, attack: 0.01 });
    tone(101, 2.0, { vol: vol * 0.6, delay, attack: 0.01 });
    tone(98 * 2.76, 1.2, { vol: vol * 0.18, delay });
    noise(0.35, { vol: vol * 0.3, freq: 900, to: 200, delay });
  }

  // 실로폰(마림바) 소리: 맑은 기본음 + 짧게 사라지는 높은 배음
  function mari(f, dur = 0.35, vol = 0.2, delay = 0) {
    tone(f, dur, { vol, delay, attack: 0.003 });
    tone(f * 4, dur * 0.22, { vol: vol * 0.28, delay, attack: 0.002 });
    tone(f * 2, dur * 0.5, { type: 'triangle', vol: vol * 0.12, delay });
  }
  // 글로켄슈필(반짝 종): 높고 길게 울림
  function glock(f, dur = 0.6, vol = 0.14, delay = 0) {
    tone(f, dur, { vol, delay, attack: 0.002 });
    tone(f * 2.76, dur * 0.4, { vol: vol * 0.3, delay });
  }
  // 뽁! 거품 터지는 소리
  function pop(f = 600, vol = 0.22, delay = 0) {
    tone(f, 0.09, { vol, delay, to: f * 2.4, attack: 0.002 });
  }
  // 밝은 장음계 (도레미솔라 + 시)
  const MAJ = [0, 2, 4, 5, 7, 9, 11];
  function mj(i, base = 523.25) {
    const oct = Math.floor(i / 7);
    const deg = ((i % 7) + 7) % 7;
    return base * Math.pow(2, oct + MAJ[deg] / 12);
  }

  const sfx = {
    move: () => tone(1350, 0.03, { type: 'triangle', vol: 0.07, to: 1100 }),
    rotate: () => pop(520, 0.18),
    soft: () => tone(900, 0.02, { type: 'triangle', vol: 0.035 }),
    // 퐁! 하고 튀어 오르는 소리
    hard: () => {
      tone(420, 0.16, { vol: 0.42, to: 110 });
      tone(260, 0.12, { type: 'triangle', vol: 0.18, to: 520, delay: 0.1 });
      noise(0.05, { vol: 0.1, freq: 2200, to: 600 });
    },
    // 똑 (나무 블록)
    lock: () => {
      tone(880, 0.06, { type: 'triangle', vol: 0.22, to: 620 });
      tone(1760, 0.03, { vol: 0.06 });
    },
    hold: () => pop(700, 0.15),
    // 줄 삭제: 뽀글뽀글 + 실로폰 올라가는 소리 (콤보마다 한 칸씩 높아짐)
    clear: (lines, combo) => {
      const b = Math.min(Math.max(combo, 0), 7);
      for (let i = 0; i < 3; i++) pop(700 + i * 260, 0.13, i * 0.045);
      for (let i = 0; i <= lines + 1; i++) mari(mj(b + i * 2), 0.4, 0.22, 0.04 + i * 0.07);
      glock(mj(b + 9), 0.5, 0.1, 0.12 + lines * 0.07);
    },
    // 줄이 사라진 뒤 블록이 '쿵' 내려앉는 소리 (귀엽게 짧게)
    collapse: (lines) => {
      tone(300, 0.14, { vol: 0.24 + Math.min(lines, 4) * 0.03, to: 140 });
    },
    // 4줄! 팡파레
    tetris: (combo) => {
      const b = Math.min(Math.max(combo, 0), 4);
      [0, 2, 4, 7, 9, 11, 14].forEach((n, i) => mari(mj(b + n), 0.45, 0.2, i * 0.055));
      [14, 16, 18].forEach((n) => glock(mj(b + n), 1.1, 0.1, 0.42));
      for (let i = 0; i < 6; i++) glock(mj(b + 14 + i * 2), 0.3, 0.05, 0.5 + i * 0.05);
    },
    allClear: () => {
      for (let i = 0; i < 12; i++) mari(mj(i), 0.3, 0.17, i * 0.045);
      [14, 16, 18, 21].forEach((n) => glock(mj(n), 1.2, 0.09, 0.6));
    },
    // 띵동 (문제 나올 때)
    quiz: () => {
      glock(mj(11), 0.5, 0.16);
      glock(mj(7), 0.7, 0.16, 0.22);
    },
    // 딩동댕! (정답)
    correct: () => {
      glock(mj(7), 0.35, 0.17);
      glock(mj(9), 0.35, 0.17, 0.14);
      glock(mj(11), 0.7, 0.19, 0.28);
    },
    // 뿌우~ (오답, 만화 같은 내려가는 소리)
    wrong: () => {
      tone(392, 0.22, { type: 'square', vol: 0.06, to: 370 });
      tone(330, 0.4, { type: 'square', vol: 0.06, to: 250, delay: 0.2 });
      tone(196, 0.55, { type: 'triangle', vol: 0.16, to: 150, delay: 0.2 });
    },
    tick: () => tone(1500, 0.03, { type: 'triangle', vol: 0.09 }),
    // 반짝반짝 마법 소리
    item: () => {
      tone(500, 0.4, { vol: 0.08, to: 2000 });
      for (let i = 0; i < 6; i++) glock(mj(7 + i * 2), 0.3, 0.08, 0.15 + i * 0.05);
    },
    // 펑! (귀여운 폭발)
    bomb: () => {
      noise(0.45, { vol: 0.45, freq: 2500, to: 150 });
      tone(180, 0.35, { vol: 0.4, to: 50 });
      for (let i = 0; i < 4; i++) pop(500 + i * 300, 0.1, 0.12 + i * 0.05);
    },
    // 슝~ 미끄럼 휘슬
    gravity: () => {
      tone(1400, 0.55, { vol: 0.13, to: 220 });
      tone(300, 0.18, { type: 'triangle', vol: 0.2, to: 120, delay: 0.5 });
    },
    // 지잉! 번개
    zap: () => {
      tone(1800, 0.25, { type: 'square', vol: 0.05, to: 300 });
      noise(0.25, { vol: 0.22, freq: 5000, to: 800, type: 'bandpass', q: 2 });
      glock(mj(14), 0.4, 0.08, 0.15);
    },
    // 꽁! (방해 줄)
    penalty: () => {
      tone(220, 0.18, { type: 'square', vol: 0.07, to: 160 });
      tone(140, 0.3, { vol: 0.25, to: 80 });
    },
    // 어-오! (경고)
    warn: () => {
      tone(660, 0.16, { type: 'triangle', vol: 0.18, to: 620 });
      tone(500, 0.24, { type: 'triangle', vol: 0.18, to: 440, delay: 0.18 });
    },
    // 흔들흔들 지진
    quake: () => {
      for (let i = 0; i < 6; i++) tone(i % 2 ? 160 : 120, 0.12, { type: 'triangle', vol: 0.18, delay: i * 0.1 });
      noise(0.7, { vol: 0.15, freq: 400, to: 120 });
    },
    sand: () => tone(1900, 0.025, { type: 'triangle', vol: 0.05 }),
    // 레벨 업 팡파레
    levelUp: () => {
      [0, 2, 4, 7].forEach((n, i) => mari(mj(n), 0.3, 0.2, i * 0.11));
      [7, 9, 11].forEach((n) => glock(mj(n), 1.1, 0.12, 0.5));
    },
    // 와와와~ 아쉬운 소리
    over: () => {
      [0, -1, -2].forEach((n, i) => tone(mj(n + 4, 261.6), 0.32, { type: 'sawtooth', vol: 0.05, delay: i * 0.33 }));
      tone(mj(1, 261.6), 0.9, { type: 'sawtooth', vol: 0.05, to: mj(0, 220), delay: 1.0 });
      [0, -1, -2].forEach((n, i) => tone(mj(n + 4, 261.6), 0.32, { vol: 0.14, delay: i * 0.33 }));
      tone(mj(1, 261.6), 0.9, { vol: 0.14, to: mj(0, 220), delay: 1.0 });
    },
    count: (go) => (go ? (mari(mj(7), 0.5, 0.22), glock(mj(11), 0.7, 0.14, 0.05)) : pop(800, 0.16)),
    fever: () => {
      for (let i = 0; i < 8; i++) mari(mj(4 + i), 0.25, 0.14, i * 0.05);
      glock(mj(14), 0.8, 0.12, 0.42);
    },
    ui: () => pop(900, 0.12),
  };
  return { init, ensure, setVolume, sfx, ctx: () => ctx };
})();
const S = Sound.sfx;

const BGM = (() => {
  const TRACKS = {
    lobby: ['lobby'],
    PRACTICE: ['practice', 'practice2'],
    NORMAL: ['normal', 'normal2', 'practice', 'practice2'],
    HELL: ['hell', 'hell2'],
    over: ['over'],
  };
  // 오디오 요소를 하나만 만들어 계속 재사용 → 아이폰에서도 첫 터치 이후 음악 전환이 막히지 않음
  const el = new Audio();
  el.loop = true;
  el.preload = 'auto';
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let curKey = '';
  let duck = 1;
  let gain = null; // 아이폰은 audio.volume이 안 먹혀서 Web Audio로 볼륨 조절
  let fadeId = 0;
  let want = false; // 지금 음악이 나와야 하는 상태인지
  const target = () => (settings.muted ? 0 : (settings.bgm / 100) * 0.6 * duck);
  const setVol = (v) => {
    v = Math.max(0, Math.min(1, v));
    if (gain) gain.gain.value = v;
    else el.volume = v;
  };
  const getVol = () => (gain ? gain.gain.value : el.volume);

  function attach(ctx) {
    if (gain || !ctx || !IOS || !/^https?:$/.test(location.protocol)) return;
    try {
      const src = ctx.createMediaElementSource(el);
      gain = ctx.createGain();
      src.connect(gain);
      gain.connect(ctx.destination);
      el.volume = 1;
    } catch (e) {
      gain = null;
    }
  }
  function fade(to, ms, done) {
    const id = ++fadeId;
    const from = getVol();
    const t0 = performance.now();
    const step = () => {
      if (id !== fadeId) return;
      const k = Math.min(1, (performance.now() - t0) / ms);
      setVol(from + (to - from) * k);
      if (k < 1) setTimeout(step, 30);
      else if (done) done();
    };
    step();
  }
  function play(key) {
    if (curKey === key && key === 'lobby' && !el.paused) return;
    curKey = key;
    const list = TRACKS[key];
    const src = 'sound/' + list[Math.floor(Math.random() * list.length)] + '.mp3';
    const start = () => {
      el.src = src;
      setVol(0);
      want = true;
      el.play().catch(() => {});
      fade(target(), 700);
    };
    if (!el.paused && getVol() > 0.01) fade(0, 300, start);
    else start();
  }
  return {
    play,
    attach,
    stop() {
      curKey = '';
      want = false;
      fade(0, 300, () => el.pause());
    },
    // 아이폰이 음성·알림 때문에 음악을 멈춰 버렸으면 다시 재생
    keepAlive() {
      if (want && curKey && el.paused && !document.hidden) el.play().catch(() => {});
      if (want && curKey && !el.paused && getVol() < 0.01 && target() > 0) fade(target(), 400);
    },
    setDuck(d) {
      duck = d;
      fade(target(), 250);
    },
    refresh() {
      fadeId++;
      setVol(target());
    },
    pause() {
      want = false;
      el.pause();
    },
    resume() {
      if (curKey) {
        want = true;
        el.play().catch(() => {});
      }
    },
  };
})();

/* ---------------- 3. 중국어 음성 (Tingting 우선) ---------------- */
const TTS = (() => {
  const synth = window.speechSynthesis;
  let voice = null;
  let voices = [];
  // 1순위 Tingting(고음질 → 기본), 없으면 중국어 여성 음성
  const PREFS = [/ting[\s-]?ting.*(premium|enhanced|高|增强|优化)/i, /ting[\s-]?ting|婷婷/i, /xiaoxiao|晓晓/i, /google.*(普通话|mandarin)/i, /xiaoyi|晓伊/i, /huihui|慧慧/i, /yaoyao|瑶瑶/i, /lili|丽丽/i];
  const isMale = (v) => /kangkang|康康|yunxi|云希|yunyang|云扬|yunjian|云健|male|男/i.test(v.name);
  const notMainland = (v) => /HK|TW|yue|粤|香港|台|臺|cantonese/i.test(v.lang + ' ' + v.name);

  function choose() {
    if (!synth) return;
    voices = synth.getVoices().filter((v) => /^(zh|cmn)/i.test(v.lang) || /chinese|中文|普通话|tingting|婷婷/i.test(v.name));
    voice = null;
    if (!voices.length) return;
    if (settings.voice) voice = voices.find((v) => v.name === settings.voice) || null;
    if (!voice) {
      for (const re of PREFS) {
        voice = voices.find((v) => re.test(v.name) && !notMainland(v));
        if (voice) break;
      }
    }
    if (!voice) voice = voices.find((v) => /zh[-_]CN/i.test(v.lang) && !isMale(v)) || voices.find((v) => !notMainland(v) && !isMale(v)) || voices[0];
  }
  if (synth) {
    choose();
    synth.addEventListener ? synth.addEventListener('voiceschanged', onVoices) : (synth.onvoiceschanged = onVoices);
  }
  function onVoices() {
    choose();
    if (typeof fillVoiceSelect === 'function') fillVoiceSelect();
  }
  function speak(text, rate) {
    if (!synth || !settings.tts || settings.muted || !text) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice ? voice.lang : 'zh-CN';
    try {
      if (voice) u.voice = voice;
    } catch (e) {}
    u.rate = rate || settings.rate / 100;
    u.pitch = 1.05;
    u.onend = u.onerror = () => {
      Sound.ensure();
      setTimeout(() => {
        Sound.ensure();
        BGM.keepAlive();
      }, 150);
    };
    synth.speak(u);
  }
  // 아이폰은 첫 터치 때 한 번 말을 시켜야 이후 음성이 나옴
  function unlock() {
    if (!synth) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
    } catch (e) {}
  }
  return {
    speak,
    unlock,
    choose,
    get voice() {
      return voice;
    },
    get voices() {
      return voices;
    },
    get available() {
      return !!synth && voices.length > 0;
    },
  };
})();

/* ---------------- 4. 블록 · 색상 · 회전 ---------------- */
const COLS = 10;
const ROWS = 20;
const BS = 40;
const LINES_PER_LEVEL = 20; // 레벨당 지울 줄 (예전 30 → 템포 개선)

// 1~7 기본, 8 낙석(모래), 9 방해벽돌, 10 폭탄, 11 중력, 12~16 헬 특수블록, 17 번개
// 사탕 같은 밝은 블록 색 (1~7 기본, 8 떨어지는 돌, 9 방해 블록, 10 폭탄, 11 내려앉기, 12~16 헬 특수, 17 번개)
const COLORS = [
  null, '#4fc3f7', '#5b7cfa', '#ff9f43', '#ffd23f', '#3ddc97', '#b388ff', '#ff6b81',
  '#e8c07d', '#c9c3e3', '#ff6b6b', '#9b7bff', '#2ed3c6', '#ff8fd8', '#8c9eff', '#ffe08a', '#ffb199', '#ffd23f',
];
const INK = '#2b2a4c';
const ITEM_NAME = { 10: '火烧连营!', 11: '泰山压顶!', 17: '一扫而光!' };
// 아이템 블록 그림 (SVG 경로를 캔버스에 그대로 그림)
const ITEM_PATH = {
  10: ['M12 9.2a5.6 5.6 0 1 0 0.01 0z', 'M14.6 8.6l2.4-2.4', 'M18.6 3.6v2M20.6 5.6h-2'],
  11: ['M6.5 5L12 10.5 17.5 5M6.5 12.4L12 17.9l5.5-5.5'],
  17: ['M13.4 2.8L5.8 13.4h5.4L10.2 21.2l8-11.3h-5.5z'],
};
const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const isItem = (v) => v === 10 || v === 11 || v === 17;

const SHAPES = {
  1: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  2: [[2, 0, 0], [2, 2, 2], [0, 0, 0]],
  3: [[0, 0, 3], [3, 3, 3], [0, 0, 0]],
  4: [[4, 4], [4, 4]],
  5: [[0, 5, 5], [5, 5, 0], [0, 0, 0]],
  6: [[0, 6, 0], [6, 6, 6], [0, 0, 0]],
  7: [[7, 7, 0], [0, 7, 7], [0, 0, 0]],
  10: [[10]],
  11: [[11]],
  12: [[12, 0, 12], [12, 12, 12], [0, 0, 0]],
  13: [[0, 13, 0], [13, 13, 13], [0, 13, 0]],
  14: [[14, 0, 0], [14, 0, 0], [14, 14, 14]],
  15: [[15, 15], [15, 0]],
  16: [[16, 0, 0], [16, 16, 0], [0, 16, 16]],
  17: [[17]],
};
const SPECIALS = [12, 13, 14, 15, 16];

// SRS 벽차기 테이블 (x, y-위쪽)
const KICK_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICK_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
const KICK_SIMPLE = [[0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0], [0, 1]];

const rotCW = (m) => m[0].map((_, i) => m.map((r) => r[i]).reverse());
const rotCCW = (m) => m[0].map((_, i) => m.map((r) => r[r.length - 1 - i]));

// 블록 스프라이트 (미리 그려서 캐시)
const spriteCache = {};
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}
function rrect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function sprite(v, size) {
  const key = v + '_' + size;
  if (spriteCache[key]) return spriteCache[key];
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const col = COLORS[v];
  const lw = Math.max(1.5, size * 0.075); // 굵은 남색 테두리 (스티커 느낌)
  const pad = lw / 2 + size * 0.03;
  const r = size * 0.22;
  const grad = c.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, shade(col, 0.22));
  grad.addColorStop(1, shade(col, -0.08));
  rrect(c, pad, pad, size - pad * 2, size - pad * 2, r);
  c.fillStyle = grad;
  c.fill();
  // 아래쪽 그림자 띠
  c.save();
  c.clip();
  c.fillStyle = shade(col, -0.22);
  c.fillRect(0, size * 0.74, size, size);
  c.restore();
  rrect(c, pad, pad, size - pad * 2, size - pad * 2, r);
  c.lineWidth = lw;
  c.strokeStyle = INK;
  c.stroke();
  // 반짝이 (왼쪽 위)
  c.fillStyle = 'rgba(255,255,255,0.75)';
  rrect(c, size * 0.22, size * 0.2, size * 0.3, size * 0.13, size * 0.065);
  c.fill();
  c.beginPath();
  c.arc(size * 0.64, size * 0.265, size * 0.055, 0, Math.PI * 2);
  c.fill();
  if (v === 9) {
    // 방해 블록: 작은 점무늬
    c.fillStyle = 'rgba(43,42,76,0.22)';
    [[0.35, 0.55], [0.62, 0.48], [0.5, 0.66], [0.7, 0.66]].forEach(([a, b]) => {
      c.beginPath();
      c.arc(size * a, size * b, size * 0.045, 0, Math.PI * 2);
      c.fill();
    });
  }
  if (v === 8) {
    c.fillStyle = 'rgba(120,80,30,0.35)';
    [[0.3, 0.55], [0.55, 0.5], [0.68, 0.64], [0.42, 0.68]].forEach(([a, b]) => {
      c.beginPath();
      c.arc(size * a, size * b, size * 0.05, 0, Math.PI * 2);
      c.fill();
    });
  }
  if (ITEM_PATH[v]) {
    // 하얀 동그라미 위에 아이템 그림
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = lw * 0.7;
    c.strokeStyle = INK;
    c.stroke();
    c.save();
    const s = (size * 0.46) / 24;
    c.translate(size / 2 - 12 * s, size / 2 - 12 * s);
    c.scale(s, s);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    ITEM_PATH[v].forEach((d, i) => {
      const path = new Path2D(d);
      if (v === 11 || (v === 10 && i > 0)) {
        c.lineWidth = v === 11 ? 3.2 : 2.4;
        c.strokeStyle = v === 10 && i === 2 ? '#ffb800' : INK;
        c.stroke(path);
      } else {
        c.fillStyle = v === 17 ? '#ffb800' : INK;
        c.fill(path);
        if (v === 17) {
          c.lineWidth = 1.6;
          c.strokeStyle = INK;
          c.stroke(path);
        }
      }
    });
    c.restore();
  }
  spriteCache[key] = cv;
  return cv;
}

/* ---------------- 5. 게임 상태 ---------------- */
const MODE_CFG = {
  PRACTICE: { speed: (l) => Math.max(350, 900 * Math.pow(0.92, l - 1)), lock: 700, quizEvery: 3, quizTime: 10000, sky: 0, label: '练习 PRACTICE' },
  NORMAL: { speed: (l) => Math.max(90, 700 * Math.pow(0.85, l - 1)), lock: 500, quizEvery: 5, quizTime: 7000, sky: 22000, label: '普通 NORMAL' },
  HELL: { speed: (l) => Math.max(55, 380 * Math.pow(0.86, l - 1)), lock: 420, quizEvery: 5, quizTime: 5500, sky: 9000, label: '地狱 HELL' },
};
const CLEAR_MS = 320;
const SOFT_MS = 40; // 키보드 ↓ 소프트드롭 속도
// 모바일 아래 버튼: 탭 = 한 칸, 꾹 누르면 잠깐 뒤 연속 하강 (속도는 설정에서 1~10단계)
const TOUCH_SOFT_DELAY = 170;
const touchSoftMs = () => Math.round(190 - (settings.soft || 5) * 15); // 1단계 175ms … 5단계 115ms … 10단계 40ms
const DAS = 150;
const ARR = 38;
const FEVER_MS = 15000;

const G = { state: 'IDLE', mode: 'NORMAL', section: 1, runId: 0, particles: [], popups: [], trails: [], sky: [] };

/* 구간(25단어) · 단어별 정답 기록 */
// 노멀 = 25단어씩 40구간, 헬 = 100단어씩 10구간
const SEC_SIZE = { NORMAL: SECTION_SIZE, HELL: 100 };
const secSize = (mode = G.mode) => SEC_SIZE[mode] || SECTION_SIZE;
const secCount = (mode = G.mode) => Math.ceil(VOCAB_LIST.length / secSize(mode));
const MASTER_KEY = 'cikuai_hsk4_mastery';
const mastery = loadJSON(MASTER_KEY, {});
const pad4 = (n) => String(n).padStart(4, '0');
function sectionWords(sec, mode = G.mode) {
  const n = secSize(mode);
  const s = (sec - 1) * n;
  return VOCAB_LIST.slice(s, s + n);
}
function sectionProgress(sec, mode = G.mode) {
  return sectionWords(sec, mode).filter((w) => mastery[w.no] > 0).length;
}
/* 스테이지 난이도 — 올라갈수록 빨라지고, 방해 블록·낙석 증가
   노멀 40스테이지(최종) < 헬 1스테이지 가 되도록 설계 */
function difficulty(mode, stage) {
  if (mode === 'HELL') {
    const t = (stage - 1) / Math.max(1, secCount('HELL') - 1);
    return {
      speed: Math.round(230 - 150 * t), // 230ms → 80ms
      garbage: 5 + Math.round(4 * t), // 시작 방해 줄 5 → 9
      sky: Math.round(9000 - 5000 * t), // 낙석 9초 → 4초마다
      eventMs: Math.round(15000 - 6000 * t), // 좌우반전·지진 15초 → 9초마다
      special: 0.1 + 0.12 * t, // 특수 블록 10% → 22%
      lock: 420,
      quizEvery: 2,
      quizTime: Math.round(5500 - 1000 * t),
    };
  }
  const t = (stage - 1) / Math.max(1, secCount('NORMAL') - 1);
  return {
    speed: Math.round(800 - 540 * t), // 800ms → 260ms (헬 1스테이지 230ms보다 느림)
    garbage: Math.floor(t * 5.99), // 시작 방해 줄 0 → 5
    sky: stage < 3 ? 0 : Math.round(26000 - 14000 * t), // 3스테이지부터 낙석 26초 → 12초
    eventMs: 0,
    special: 0,
    lock: 500,
    quizEvery: 3,
    quizTime: Math.round(7500 - 1500 * t),
  };
}
const PROGRESS_KEY = 'cikuai_hsk4_stages';
const progress = Object.assign({ NORMAL: { unlocked: 1, best: null }, HELL: { unlocked: 1, best: null } }, loadJSON(PROGRESS_KEY, {}));
const saveProgress = () => saveJSON(PROGRESS_KEY, progress);
function unlockStage(mode, stage) {
  const p = progress[mode];
  if (stage > p.unlocked) {
    p.unlocked = Math.min(stage, secCount(mode) + 1); // secCount+1 = 전부 클리어
    saveProgress();
    return true;
  }
  return false;
}
const isCleared = (mode, stage) => stage < progress[mode].unlocked;
const continueStage = (mode) => Math.min(progress[mode].unlocked, secCount(mode));
function markCorrect(w) {
  mastery[w.no] = (mastery[w.no] || 0) + 1;
  saveJSON(MASTER_KEY, mastery);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const cfg = () => MODE_CFG[G.mode];
const isFever = () => G.feverUntil > G.clock;

function resetGame(mode, section) {
  Object.assign(G, {
    mode,
    section: section || G.section || 1,
    qQueue: [],
    sectionDone: false,
    runId: G.runId + 1,
    board: createBoard(),
    piece: null,
    queue: [],
    bag: [],
    hold: null,
    holdUsed: false,
    score: 0,
    level: 1,
    lines: 0,
    levelLines: 0,
    combo: -1,
    maxCombo: 0,
    b2b: false,
    dropAcc: 0,
    lockAcc: 0,
    lockResets: 0,
    softDrop: false,
    placed: 0,
    quizPending: false,
    levelUpPending: false,
    gauge: 0,
    streak: 0,
    feverUntil: 0,
    clock: 0,
    quizRight: 0,
    quizTotal: 0,
    lvQuizRight: 0,
    lvQuizTotal: 0,
    missed: new Map(),
    quizPool: [],
    reversedUntil: 0,
    skyTimer: 0,
    sandTimer: 0,
    eventTimer: 0,
    sky: [],
    clearing: null,
    levelStart: 0,
    levelScoreStart: 0,
    overT: 0,
    particles: [],
    popups: [],
    trails: [],
  });
  G.level = G.section;
  G.startStage = G.section;
  G.stagesCleared = 0;
  G.allClear = false;
  G.diff = difficulty(mode, G.section);
  G.dropInterval = G.diff.speed;
  G.qQueue = shuffle(sectionWords(G.section).slice());
  fillQueue();
}

function newPiece(type) {
  return { type, matrix: SHAPES[type].map((r) => [...r]), rot: 0, x: 0, y: 0 };
}
function nextFromBag() {
  if (G.mode === 'HELL' && Math.random() < (G.diff ? G.diff.special : 0.1)) return newPiece(SPECIALS[Math.floor(Math.random() * SPECIALS.length)]);
  if (!G.bag.length) G.bag = shuffle([1, 2, 3, 4, 5, 6, 7]);
  return newPiece(G.bag.pop());
}
function fillQueue() {
  while (G.queue.length < 4) G.queue.push(nextFromBag());
}

function collideM(m, ox, oy) {
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (!m[r][c]) continue;
      const x = ox + c, y = oy + r;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && G.board[y][x]) return true;
    }
  }
  return false;
}
const collide = (p, dx = 0, dy = 0) => collideM(p.matrix, p.x + dx, p.y + dy);
function pieceAt(x, y) {
  const p = G.piece;
  if (!p) return false;
  const r = y - p.y, c = x - p.x;
  return r >= 0 && r < p.matrix.length && c >= 0 && c < p.matrix[r].length && !!p.matrix[r][c];
}
function eachCell(p, fn) {
  p.matrix.forEach((row, r) => row.forEach((v, c) => v && fn(p.x + c, p.y + r, v)));
}

function placeAtTop(p) {
  p.x = Math.floor((COLS - p.matrix[0].length) / 2);
  let top = 0;
  while (top < p.matrix.length && p.matrix[top].every((v) => !v)) top++;
  p.y = -top;
  for (let i = 0; i < 2 && collide(p); i++) p.y--;
  return !collide(p);
}

function spawnNext() {
  if (G.state === 'GAME_OVER') return;
  G.piece = G.queue.shift();
  fillQueue();
  G.holdUsed = false;
  G.lockAcc = 0;
  G.lockResets = 0;
  G.dropAcc = 0;
  G.state = 'PLAYING';
  if (!placeAtTop(G.piece)) return gameOver();
  drawPreviews();
}

function onMoved() {
  if (collide(G.piece, 0, 1) && G.lockResets < 15) {
    G.lockAcc = 0;
    G.lockResets++;
  }
}
function tryMove(dir) {
  const p = G.piece;
  if (!p) return false;
  const d = G.reversedUntil > G.clock ? -dir : dir;
  if (collide(p, d, 0)) return false;
  p.x += d;
  S.move();
  onMoved();
  return true;
}
function rotate(dir) {
  const p = G.piece;
  if (!p || p.type === 4 || p.matrix.length === 1) return;
  const from = p.rot;
  const to = (from + (dir > 0 ? 1 : 3)) % 4;
  const m = dir > 0 ? rotCW(p.matrix) : rotCCW(p.matrix);
  const kicks = p.type === 1 ? KICK_I[from + '>' + to] : p.type <= 7 ? KICK_JLSTZ[from + '>' + to] : KICK_SIMPLE;
  for (const [kx, ky] of kicks) {
    if (!collideM(m, p.x + kx, p.y - ky)) {
      p.matrix = m;
      p.x += kx;
      p.y -= ky;
      p.rot = to;
      S.rotate();
      onMoved();
      return;
    }
  }
}
function ghostY(p) {
  let y = p.y;
  while (!collideM(p.matrix, p.x, y + 1)) y++;
  return y;
}
function hardDrop() {
  const p = G.piece;
  if (!p) return;
  const gy = ghostY(p);
  const dist = gy - p.y;
  // 낙하 잔상
  const cols = {};
  eachCell(p, (x, y, v) => {
    if (cols[x] === undefined || y < cols[x].y) cols[x] = { y, v };
  });
  Object.keys(cols).forEach((x) => G.trails.push({ x: +x, y0: cols[x].y, y1: cols[x].y + dist, color: COLORS[cols[x].v], life: 220, max: 220 }));
  p.y = gy;
  addScore(dist * 2, true);
  S.hard();
  buzz(12);
  boardFx('thump');
  lockPiece();
}
function holdPiece() {
  if (!G.piece || G.holdUsed) return;
  const cur = newPiece(G.piece.type);
  if (G.hold) {
    G.piece = newPiece(G.hold.type);
    G.hold = cur;
    G.lockAcc = 0;
    G.lockResets = 0;
    G.dropAcc = 0;
    if (!placeAtTop(G.piece)) return gameOver();
  } else {
    G.hold = cur;
    spawnNext();
  }
  G.holdUsed = true;
  S.hold();
  drawPreviews();
}

function lockPiece() {
  const p = G.piece;
  let above = false;
  eachCell(p, (x, y, v) => {
    if (y < 0) above = true;
    else G.board[y][x] = v;
  });
  G.piece = null;
  if (above) return gameOver();
  const item = applyItems(p);
  if (!item) {
    S.lock();
    G.placed++;
    if (G.placed % G.diff.quizEvery === 0 && G.qQueue.length) G.quizPending = true;
  }
  resolveLines(true);
}

function fullRows() {
  const rows = [];
  for (let y = 0; y < ROWS; y++) if (G.board[y].every((v) => v)) rows.push(y);
  return rows;
}
function removeRows(rows) {
  rows.sort((a, b) => a - b).forEach((y) => {
    G.board.splice(y, 1);
    G.board.unshift(new Array(COLS).fill(0));
  });
}
function resolveLines(fromLock) {
  const rows = fullRows();
  if (!rows.length) {
    if (fromLock) {
      G.combo = -1;
      finishTurn();
    }
    return;
  }
  rows.forEach((y) => {
    for (let x = 0; x < COLS; x++) burst(x, y, G.board[y][x], 5);
  });
  scoreLines(rows, !fromLock);
  if (fromLock) {
    G.state = 'CLEARING';
    G.clearing = { rows, t: 0 };
  } else {
    removeRows(rows);
    unstickPiece();
  }
}
function scoreLines(rows, passive) {
  const n = rows.length;
  let pts = ([0, 100, 300, 500, 800][n] || 1200) * G.level;
  let tag = '';
  if (!passive) {
    G.combo++;
    G.maxCombo = Math.max(G.maxCombo, G.combo);
    if (G.combo > 0) pts += 50 * G.combo * G.level;
    if (n >= 4) {
      if (G.b2b) {
        pts = Math.floor(pts * 1.5);
        tag = 'B2B ';
      }
      G.b2b = true;
    } else G.b2b = false;
  }
  if (isFever()) pts *= 2;
  addScore(pts);
  const cy = rows.reduce((a, b) => a + b, 0) / n;
  G.popups.push({ text: '+' + pts.toLocaleString(), x: 200, y: cy * BS + 20, life: 900, max: 900, color: isFever() ? '#ffb800' : '#3ba8f5' });

  G.lines += n;

  const comboTxt = !passive && G.combo > 0 ? `${G.combo} 连击!` : '';
  buzz(n >= 4 ? [30, 40, 60] : 25);
  if (n >= 4) {
    S.tetris(G.combo);
    boardFx('shake-l');
    flash();
    showAction('痛快!', tag + comboTxt, '#ff6b6b');
    setTimeout(() => TTS.speak('痛快！', 1), 120);
  } else {
    S.clear(n, passive ? 0 : G.combo);
    boardFx(n >= 2 ? 'shake-m' : 'shake-s');
    if (n === 3) showAction('三消!', comboTxt, '#9b7bff');
    else if (n === 2) showAction('双消!', comboTxt, '#3ba8f5');
    else if (comboTxt) showAction(comboTxt, '', '#ff9f43');
  }
  updateHUD();
}
function addScore(pts, quiet) {
  G.score += Math.round(pts);
  const el = $('score');
  el.textContent = G.score.toLocaleString();
  $('score-m').textContent = el.textContent;
  if (!quiet) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
}
function finishTurn() {
  if (G.state === 'GAME_OVER') return;
  if (G.levelUpPending) {
    G.levelUpPending = false;
    return showLevelClear();
  }
  if (G.quizPending) {
    G.quizPending = false;
    return startQuiz();
  }
  spawnNext();
}
// 보드가 바뀐 뒤 현재 블록이 겹치면 위로 밀어 올림
function unstickPiece() {
  const p = G.piece;
  if (!p) return;
  let n = 0;
  while (collide(p) && n < 4) {
    p.y--;
    n++;
  }
  if (collide(p)) gameOver();
}

/* ---------------- 6. 아이템 · 방해 이벤트 ---------------- */
function applyItems(p) {
  let type = 0, ix = 0, iy = 0;
  eachCell(p, (x, y, v) => {
    if (isItem(v)) {
      type = v;
      ix = x;
      iy = y;
    }
  });
  if (!type) return false;
  const run = G.runId;
  if (type === 10) {
    S.bomb();
    boardFx('shake-l');
    flash('#ff8a3d');
    for (let y = iy - 1; y <= iy + 1; y++)
      for (let x = ix - 1; x <= ix + 1; x++)
        if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
          if (G.board[y][x]) burst(x, y, G.board[y][x], 7);
          G.board[y][x] = 0;
        }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 7;
      G.particles.push({ x: ix * BS + 20, y: iy * BS + 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 700, max: 700, color: i % 2 ? '#ffd93b' : '#ff4560', size: 6 });
    }
    dropFloating();
  } else if (type === 11) {
    S.gravity();
    boardFx('shake-m');
    G.board[iy][ix] = 0;
    for (let x = 0; x < COLS; x++) {
      const col = [];
      for (let y = ROWS - 1; y >= 0; y--) if (G.board[y][x]) col.push(G.board[y][x]);
      for (let y = ROWS - 1; y >= 0; y--) G.board[y][x] = col.length ? col.shift() : 0;
    }
  } else if (type === 17) {
    S.zap();
    boardFx('shake-m');
    flash('#fff6a0');
    G.board[iy][ix] = 0;
    const rows = [ROWS - 1, ROWS - 2];
    rows.forEach((y) => {
      for (let x = 0; x < COLS; x++) if (G.board[y][x]) burst(x, y, G.board[y][x], 5);
    });
    removeRows(rows);
    addScore(200 * G.level);
  }
  if (run === G.runId) showNotice(ITEM_NAME[type], COLORS[type]);
  return true;
}
// 폭탄 이후 바닥과 연결되지 않은 블록 떨어뜨리기
function dropFloating() {
  const seen = createBoard();
  const q = [];
  for (let x = 0; x < COLS; x++)
    if (G.board[ROWS - 1][x]) {
      seen[ROWS - 1][x] = 1;
      q.push([x, ROWS - 1]);
    }
  while (q.length) {
    const [cx, cy] = q.shift();
    [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && G.board[ny][nx] && !seen[ny][nx]) {
        seen[ny][nx] = 1;
        q.push([nx, ny]);
      }
    });
  }
  for (let x = 0; x < COLS; x++)
    for (let y = ROWS - 2; y >= 0; y--)
      if (G.board[y][x] && !seen[y][x]) {
        let d = y;
        while (d + 1 < ROWS && !G.board[d + 1][x]) d++;
        if (d !== y) {
          G.board[d][x] = G.board[y][x];
          G.board[y][x] = 0;
        }
      }
}
function grantItem() {
  const t = [10, 11, 17][Math.floor(Math.random() * 3)];
  G.queue.unshift(newPiece(t));
  S.item();
  const run = G.runId;
  setTimeout(() => run === G.runId && showNotice('아이템 획득!', '#ffb800'), 600);
  drawPreviews();
}
function addPenaltyLine() {
  if (G.board[0].some((v) => v)) return gameOver();
  G.board.shift();
  const row = new Array(COLS).fill(9);
  row[Math.floor(Math.random() * COLS)] = 0;
  G.board.push(row);
  S.penalty();
  boardFx('shake-m');
}
function spawnSky() {
  const n = G.mode === 'HELL' ? 1 + Math.floor(Math.random() * Math.min(3, 1 + G.level / 2)) : 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(Math.random() * COLS);
    if (!G.board[0][x]) G.sky.push({ x, y: -1 - Math.random() * 2 });
  }
  if (G.sky.length) {
    S.warn();
    showNotice('乱石穿空!\n돌이 떨어져요', '#ff9f43');
  }
}
function updateSky(dt) {
  let changed = false;
  for (let i = G.sky.length - 1; i >= 0; i--) {
    const g = G.sky[i];
    g.y += dt / 42;
    const cy = Math.floor(g.y);
    const below = cy + 1;
    const hit = below >= ROWS || (below >= 0 && (G.board[below][g.x] || pieceAt(g.x, below)));
    if (hit) {
      let ly = Math.min(cy, ROWS - 1);
      while (ly >= 0 && (G.board[ly][g.x] || pieceAt(g.x, ly))) ly--;
      if (ly >= 0) {
        G.board[ly][g.x] = 8;
        S.sand();
        changed = true;
      }
      G.sky.splice(i, 1);
    }
  }
  G.sandTimer += dt;
  if (G.sandTimer > 60) {
    G.sandTimer = 0;
    for (let y = ROWS - 2; y >= 0; y--)
      for (let x = 0; x < COLS; x++)
        if (G.board[y][x] === 8 && !G.board[y + 1][x] && !pieceAt(x, y + 1)) {
          G.board[y + 1][x] = 8;
          G.board[y][x] = 0;
          changed = true;
        }
  }
  if (changed) resolveLines(false);
}
function randomEvent() {
  if (Math.random() > 0.3 + G.level * 0.05) return;
  if (Math.random() < 0.5) {
    G.reversedUntil = G.clock + 6000;
    S.warn();
    boardFx('shake-m');
    showNotice('声东击西!\n좌우가 바뀌어요', '#ff6b6b');
  } else {
    S.quake();
    boardFx('shake-l');
    showNotice('天崩地裂!\n지진이에요', '#9b7bff');
    const start = ROWS - 4;
    let count = 0;
    for (let y = start; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (G.board[y][x]) {
          count++;
          G.board[y][x] = 0;
        }
    const slots = [];
    for (let y = start; y < ROWS; y++) for (let x = 0; x < COLS; x++) slots.push([x, y]);
    shuffle(slots)
      .slice(0, count)
      .forEach(([x, y]) => (G.board[y][x] = 9));
    unstickPiece();
    resolveLines(false);
  }
}
function startFever() {
  G.feverUntil = G.clock + FEVER_MS;
  S.fever();
  const run = G.runId;
  setTimeout(() => run === G.runId && showNotice('점수 2배!', '#ffb800'), 900);
}
function generateObstacles() {
  const h = G.diff.garbage;
  for (let y = ROWS - h; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (Math.random() < 0.38) G.board[y][x] = 9;
    if (G.board[y].every((v) => v)) G.board[y][Math.floor(Math.random() * COLS)] = 0;
  }
}

/* ---------------- 7. 퀴즈 ---------------- */
const QUIZ_TYPES = {
  pair: '짝꿍어휘',
  kr2cn: '한 → 중',
  cn2kr: '중 → 한',
  listen: '듣기',
};
function startQuiz() {
  G.state = 'QUIZ';
  G.softDrop = false;
  G.touchSoft = false;
  BGM.setDuck(0.3);
  const q = pickQuizWord();
  const practice = G.mode === 'PRACTICE';

  const types = ['kr2cn', 'kr2cn', 'cn2kr', 'pair', 'pair'];
  if (TTS.available && settings.tts && !settings.muted) types.push('listen', 'listen');
  const type = types[Math.floor(Math.random() * types.length)];

  // 오답 후보: 연습 모드는 같은 구간 단어에서 먼저 (비슷한 단어끼리 헷갈리게)
  const base = sectionWords(G.section);
  let pool = shuffle(base.filter((v) => v.cn !== q.cn && v.kr !== q.kr));
  if (pool.length < 4) pool = shuffle(VOCAB_LIST.filter((v) => v.cn !== q.cn && v.kr !== q.kr));
  let options, correct, say, promptKr, pr;
  if (type === 'pair') {
    pr = q.pairs[Math.floor(Math.random() * q.pairs.length)];
    const wrongs = [];
    for (const v of pool) {
      const c = v.pairs[Math.floor(Math.random() * v.pairs.length)];
      if (c.cn !== pr.cn && c.kr !== pr.kr && !wrongs.some((w) => w.cn === c.cn)) wrongs.push(c);
      if (wrongs.length === 2) break;
    }
    options = shuffle([pr, ...wrongs]);
    correct = options.indexOf(pr);
    say = pr.cn;
    promptKr = pr.kr;
  } else {
    // 비슷한 길이의 오답을 우선 (너무 쉽지 않게)
    pool.sort((a, b) => Math.abs(a.cn.length - q.cn.length) - Math.abs(b.cn.length - q.cn.length));
    const wrongs = shuffle(pool.slice(0, 6)).slice(0, 2);
    options = shuffle([q, ...wrongs]);
    correct = options.indexOf(q);
    say = q.cn;
  }

  G.quiz = { q, pr, say, type, options, correct, start: performance.now(), dur: G.diff.quizTime, answered: false, lastTick: 99 };

  $('quiz-type').textContent = QUIZ_TYPES[type];
  $('quiz-streak').textContent = G.streak > 0 ? `连对 ×${G.streak}` : '';
  const word = $('quiz-word');
  const sub = $('quiz-sub');
  word.className = '';
  $('quiz-listen').classList.toggle('hidden', type === 'kr2cn' || type === 'pair');
  if (type === 'pair') {
    word.textContent = promptKr;
    sub.textContent = `「${q.cn}」 짝꿍어휘를 고르세요`;
  } else if (type === 'kr2cn') {
    word.textContent = q.kr;
    sub.textContent = '알맞은 중국어를 고르세요';
  } else if (type === 'cn2kr') {
    word.textContent = q.cn;
    word.className = 'cn';
    sub.textContent = q.py;
  } else {
    word.innerHTML = icon('sound');
    word.className = 'listen';
    sub.textContent = '잘 듣고 뜻을 고르세요';
  }

  const box = $('quiz-options');
  box.innerHTML = '';
  options.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'opt';
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = i + 1;
    const main = document.createElement('span');
    main.className = 'main';
    if (type === 'kr2cn' || type === 'pair') {
      main.classList.add('cn');
      main.textContent = o.cn;
      const py = document.createElement('span');
      py.className = 'py';
      py.textContent = o.py;
      main.appendChild(py);
    } else {
      main.textContent = o.kr;
    }
    b.append(num, main);
    b.addEventListener('click', () => answerQuiz(i));
    box.appendChild(b);
  });
  $('quiz-timer-fill').style.width = '100%';
  showOverlay('quiz-ui');
  S.quiz();
  if (type === 'cn2kr' || type === 'listen') setTimeout(() => G.state === 'QUIZ' && TTS.speak(say), 300);
}
function pickQuizWord() {
  // 이 스테이지에서 아직 못 맞힌 단어만 출제 (틀리면 2문제 뒤에 다시)
  if (!G.qQueue.length) return sectionWords(G.section)[Math.floor(Math.random() * sectionWords(G.section).length)];
  return G.qQueue.shift();
}
function updateQuiz(now) {
  const z = G.quiz;
  if (!z || z.answered) return;
  const left = Math.max(0, z.dur - (now - z.start));
  $('quiz-timer-fill').style.width = (left / z.dur) * 100 + '%';
  const sec = Math.ceil(left / 1000);
  if (sec <= 3 && sec < z.lastTick && left > 0) {
    z.lastTick = sec;
    S.tick();
  }
  if (left <= 0) answerQuiz(-1);
}
function answerQuiz(i) {
  const z = G.quiz;
  if (G.state !== 'QUIZ' || !z || z.answered) return;
  z.answered = true;
  const ok = i === z.correct;
  const btns = document.querySelectorAll('#quiz-options .opt');
  btns.forEach((b, k) => b.classList.add(k === z.correct ? 'correct' : k === i ? 'wrong' : 'dim'));
  if (z.type === 'pair') {
    $('quiz-sub').textContent = `${z.pr.cn} (${z.pr.py})`;
  }
  if (z.type === 'listen') {
    $('quiz-word').textContent = z.q.cn;
    $('quiz-word').className = 'cn';
    $('quiz-sub').textContent = z.q.py;
  }
  G.quizTotal++;
  G.lvQuizTotal++;
  const practice = G.mode === 'PRACTICE';
  if (ok) {
    S.correct();
    G.quizRight++;
    G.lvQuizRight++;
    G.streak++;
    markCorrect(z.q);
    if (!G.qQueue.length && !G.levelUpPending) G.levelUpPending = true; // 스테이지 단어 전부 정답 → 클리어
    const frac = Math.max(0, 1 - (performance.now() - z.start) / z.dur);
    let pts = Math.round((50 + 150 * frac) * G.level);
    if (isFever()) pts *= 2;
    addScore(pts);
    showNotice('答对! +' + pts, '#22c384');
    G.gauge++;
    if (G.streak % 3 === 0) startFever();
    if (G.gauge >= 5) {
      G.gauge = 0;
      grantItem();
    }
  } else {
    S.wrong();
    buzz([40, 50, 40]);
    G.streak = 0;
    if (!practice) G.gauge = 0;
    G.missed.set(z.q.cn, z.q);
    G.qQueue.splice(Math.min(2, G.qQueue.length), 0, z.q);
    showNotice(i < 0 ? '超时!' : '答错!', '#ff6b6b');
  }
  setTimeout(() => TTS.speak(z.say), 200);
  updateHUD();
  const run = G.runId;
  setTimeout(
    () => {
      if (run !== G.runId || G.state !== 'QUIZ') return;
      hideOverlay('quiz-ui');
      BGM.setDuck(1);
      if (!ok && !practice) addPenaltyLine();
      if (G.state !== 'GAME_OVER') finishTurn();
    },
    ok ? 950 : practice ? 2400 : 1600,
  );
}

/* ---------------- 8. 그리기 ---------------- */
const cv = $('tetris');
const ctx = cv.getContext('2d');
const fx = $('fx').getContext('2d');
const nextCtx = $('next-canvas').getContext('2d');
const boardWrap = $('board-wrap');

function drawCell(c, v, x, y, size = BS, alpha = 1) {
  const k = c.canvas._k || 1;
  c.globalAlpha = alpha;
  c.drawImage(sprite(v, Math.max(8, Math.round(size * k))), x, y, size, size);
  c.globalAlpha = 1;
}
function render(now) {
  ctx.setTransform(cv._k || 1, 0, 0, cv._k || 1, 0, 0);
  ctx.clearRect(0, 0, 400, 800);
  // 격자
  ctx.strokeStyle = G.mode === 'HELL' ? 'rgba(255,107,107,0.12)' : 'rgba(59,168,245,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < COLS; x++) {
    ctx.moveTo(x * BS + 0.5, 0);
    ctx.lineTo(x * BS + 0.5, ROWS * BS);
  }
  for (let y = 1; y < ROWS; y++) {
    ctx.moveTo(0, y * BS + 0.5);
    ctx.lineTo(COLS * BS, y * BS + 0.5);
  }
  ctx.stroke();

  if (!G.board) return;
  const p = G.piece;
  const playing = G.state === 'PLAYING';

  // 현재 블록 아래 세로 가이드
  if (p && playing) {
    let minX = 99, maxX = -1;
    eachCell(p, (x) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    });
    const g = ctx.createLinearGradient(0, 0, 0, ROWS * BS);
    g.addColorStop(0, 'rgba(59,168,245,0)');
    g.addColorStop(1, 'rgba(59,168,245,0.09)');
    ctx.fillStyle = g;
    ctx.fillRect(minX * BS, 0, (maxX - minX + 1) * BS, ROWS * BS);
  }

  // 위험 구역 표시
  ctx.fillStyle = 'rgba(255,107,107,0.08)';
  ctx.fillRect(0, 0, COLS * BS, 2 * BS);
  ctx.strokeStyle = 'rgba(255,107,107,0.35)';
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(0, 2 * BS);
  ctx.lineTo(COLS * BS, 2 * BS);
  ctx.stroke();
  ctx.setLineDash([]);

  // 쌓인 블록
  const clearRows = G.clearing ? G.clearing.rows : null;
  const k = G.clearing ? G.clearing.t / CLEAR_MS : 0;
  const greyUntil = G.state === 'GAME_OVER' ? ROWS - Math.floor(G.overT / 35) : ROWS + 1;
  const pulse = 0.75 + 0.25 * Math.sin(now / 150);
  for (let y = 0; y < ROWS; y++) {
    const isClr = clearRows && clearRows.includes(y);
    for (let x = 0; x < COLS; x++) {
      const v = G.board[y][x];
      if (!v) continue;
      if (isClr) drawCell(ctx, v, x * BS, y * BS, BS, 1 - k);
      else if (y >= greyUntil) drawCell(ctx, 9, x * BS, y * BS, BS, 0.8);
      else drawCell(ctx, v, x * BS, y * BS, BS, isItem(v) ? pulse : 1);
    }
    if (isClr) {
      ctx.fillStyle = `rgba(255,224,90,${0.95 * (1 - k)})`;
      const w = COLS * BS * (1 - k);
      ctx.fillRect((COLS * BS - w) / 2, y * BS + BS * 0.1 * k, w, BS * (1 - 0.2 * k));
    }
  }

  // 고스트
  if (p && playing && settings.ghost) {
    const gy = ghostY(p);
    if (gy !== p.y) {
      const col = COLORS[p.matrix.flat().find((v) => v)];
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.fillStyle = col;
      p.matrix.forEach((row, r) =>
        row.forEach((v, c) => {
          if (!v) return;
          const x = (p.x + c) * BS, y = (gy + r) * BS;
          if (y < 0) return;
          ctx.globalAlpha = 0.18;
          rrect(ctx, x + 4, y + 4, BS - 8, BS - 8, 9);
          ctx.fill();
          ctx.globalAlpha = 0.7;
          ctx.setLineDash([6, 5]);
          ctx.stroke();
        }),
      );
      ctx.restore();
    }
  }

  // 현재 블록
  if (p && (playing || G.state === 'PAUSED')) {
    const lockFade = collide(p, 0, 1) ? 1 - 0.35 * (G.lockAcc / G.diff.lock) : 1;
    eachCell(p, (x, y, v) => {
      if (y >= 0) drawCell(ctx, v, x * BS, y * BS, BS, isItem(v) ? pulse : lockFade);
    });
  }
  // 낙석
  G.sky.forEach((g) => {
    if (g.y > -1) drawCell(ctx, 8, g.x * BS, g.y * BS);
  });

  renderFx();
}
function renderFx() {
  const fk = fx.canvas._k || 1;
  fx.setTransform(fk, 0, 0, fk, 0, 0);
  fx.clearRect(0, 0, 400, 800);
  G.trails.forEach((t) => {
    const a = t.life / t.max;
    const g = fx.createLinearGradient(0, t.y0 * BS, 0, t.y1 * BS + BS);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, t.color);
    fx.globalAlpha = a * 0.5;
    fx.fillStyle = g;
    fx.fillRect(t.x * BS + 6, Math.max(0, t.y0 * BS), BS - 12, (t.y1 - t.y0) * BS + BS);
  });
  G.particles.forEach((q) => {
    fx.globalAlpha = Math.max(0, q.life / q.max);
    fx.fillStyle = q.color;
    fx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  });
  fx.globalAlpha = 1;
  fx.textAlign = 'center';
  fx.font = '34px Jua, "Apple SD Gothic Neo", sans-serif';
  fx.lineJoin = 'round';
  G.popups.forEach((q) => {
    const a = q.life / q.max;
    fx.globalAlpha = Math.min(1, a * 2);
    const y = q.y - (1 - a) * 50;
    fx.lineWidth = 9;
    fx.strokeStyle = '#fff';
    fx.strokeText(q.text, q.x, y);
    fx.lineWidth = 2.5;
    fx.strokeStyle = INK;
    fx.strokeText(q.text, q.x, y);
    fx.fillStyle = q.color;
    fx.fillText(q.text, q.x, y);
  });
  fx.globalAlpha = 1;
  if (G.flash > 0) {
    fx.fillStyle = G.flashColor || '#fff3b0';
    fx.globalAlpha = G.flash * 0.5;
    fx.fillRect(0, 0, 400, 800);
    fx.globalAlpha = 1;
  }
}
function updateFx(dt) {
  const f = dt / 16.7;
  G.particles = G.particles.filter((q) => {
    q.x += q.vx * f;
    q.y += q.vy * f;
    q.vy += 0.35 * f;
    q.life -= dt;
    return q.life > 0;
  });
  G.popups = G.popups.filter((q) => (q.life -= dt) > 0);
  G.trails = G.trails.filter((q) => (q.life -= dt) > 0);
  if (G.flash > 0) G.flash = Math.max(0, G.flash - dt / 250);
}
function burst(x, y, v, n) {
  const color = COLORS[v] || '#fff';
  for (let i = 0; i < n; i++) {
    G.particles.push({
      x: x * BS + Math.random() * BS,
      y: y * BS + Math.random() * BS,
      vx: (Math.random() - 0.5) * 7,
      vy: -Math.random() * 6 - 1,
      life: 500 + Math.random() * 400,
      max: 900,
      color,
      size: 4 + Math.random() * 5,
    });
  }
}
function flash(color) {
  G.flash = 1;
  G.flashColor = color || '#fff3b0';
}
function boardFx(cls) {
  boardWrap.classList.remove('shake-s', 'shake-m', 'shake-l', 'thump');
  void boardWrap.offsetWidth;
  boardWrap.classList.add(cls);
}

function drawPieceIn(c, type, cx, cy, size, alpha = 1) {
  const m = SHAPES[type];
  let minR = 9, maxR = -1, minC = 9, maxC = -1;
  m.forEach((row, r) =>
    row.forEach((v, cc) => {
      if (!v) return;
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
      minC = Math.min(minC, cc);
      maxC = Math.max(maxC, cc);
    }),
  );
  const w = (maxC - minC + 1) * size, h = (maxR - minR + 1) * size;
  m.forEach((row, r) =>
    row.forEach((v, cc) => {
      if (v) drawCell(c, v, Math.round(cx - w / 2 + (cc - minC) * size), Math.round(cy - h / 2 + (r - minR) * size), size, alpha);
    }),
  );
}
function drawPreviews() {
  const nk = nextCtx.canvas._k || 1;
  nextCtx.setTransform(nk, 0, 0, nk, 0, 0);
  nextCtx.clearRect(0, 0, 160, 330);
  (G.queue || []).slice(0, 3).forEach((p, i) => {
    drawPieceIn(nextCtx, p.type, 80, 55 + i * 110, i === 0 ? 32 : 26, i === 0 ? 1 : 0.75);
  });
}

/* ---------------- HUD ---------------- */
function updateHUD() {
  if (!G.board) return;
  $('score').textContent = (G.score || 0).toLocaleString();
  $('score-m').textContent = $('score').textContent;
  $('level').textContent = G.level;
  const total = sectionWords(G.section).length;
  $('lines-left').textContent = G.qQueue ? G.qQueue.length : total;
  $('level-fill').style.width = (((total - (G.qQueue ? G.qQueue.length : total)) / total) * 100).toFixed(1) + '%';
  document.querySelectorAll('#gauge-slots .slot').forEach((s, i) => s.classList.toggle('filled', i < G.gauge));
  $('streak-num').textContent = G.streak;
  $('combo').textContent = Math.max(0, G.combo);
  $('accuracy').textContent = G.quizTotal ? Math.round((G.quizRight / G.quizTotal) * 100) + '%' : '-';
  const fever = isFever();
  $('streak-card').classList.toggle('fever', fever);
  boardWrap.classList.toggle('fever', fever);
  $('fever-fill').style.width = (fever ? ((G.feverUntil - G.clock) / FEVER_MS) * 100 : ((G.streak % 3) / 3) * 100) + '%';
  $('fever-hint').textContent = fever ? `점수 2배! ${Math.ceil((G.feverUntil - G.clock) / 1000)}초 남았어요` : '3개 연속 맞히면 점수 2배';
  let danger = false;
  for (let y = 0; y < 4 && !danger; y++) danger = G.board[y].some((v) => v);
  boardWrap.classList.toggle('danger', danger && G.state !== 'GAME_OVER' && !fever);
  // 상태 칩
  const chips = [];
  if (G.reversedUntil > G.clock) chips.push(`<span class="chip" style="color:#e5484d">좌우 반전 ${Math.ceil((G.reversedUntil - G.clock) / 1000)}</span>`);
  if (fever) chips.push(`<span class="chip" style="color:#d99a00">점수 2배</span>`);
  if (G.section) chips.push(`<span class="chip" style="color:${G.mode === 'HELL' ? '#e5484d' : '#1f8fe0'}">STAGE ${G.section} 단어 ${sectionWords(G.section).length - G.qQueue.length}/${sectionWords(G.section).length}</span>`);
  const html = chips.join('');
  const box = $('status-chips');
  if (box.innerHTML !== html) box.innerHTML = html;
}

let actionTimer = null;
function showAction(main, sub, color) {
  const el = $('action-text');
  el.innerHTML = '';
  el.append(document.createTextNode(main));
  if (sub) {
    const s = document.createElement('small');
    s.textContent = sub;
    el.appendChild(s);
  }
  el.style.color = color;
  el.classList.remove('hidden', 'pop-anim');
  void el.offsetWidth;
  el.classList.add('pop-anim');
  clearTimeout(actionTimer);
  actionTimer = setTimeout(() => el.classList.add('hidden'), 1300);
}
let noticeTimer = null;
function showNotice(text, color) {
  const el = $('notice-text');
  el.textContent = text;
  el.style.color = color;
  el.classList.remove('hidden', 'pop-anim');
  void el.offsetWidth;
  el.classList.add('pop-anim');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => el.classList.add('hidden'), 1300);
}

/* ---------------- 9. 메인 루프 ---------------- */
const keys = { left: false, right: false };
let dasDir = 0, dasT = 0, arrT = 0;
let lastFrame = performance.now();
let hudT = 0;

function updatePlaying(dt) {
  G.clock += dt;
  if (G.diff.sky) {
    G.skyTimer += dt;
    if (G.skyTimer > G.diff.sky) {
      G.skyTimer = 0;
      spawnSky();
    }
  }
  if (G.diff.eventMs) {
    G.eventTimer += dt;
    if (G.eventTimer > G.diff.eventMs) {
      G.eventTimer = 0;
      randomEvent();
    }
  }
  if (G.reversedUntil && G.clock > G.reversedUntil) {
    G.reversedUntil = 0;
    showNotice('拨云见日!\n원래대로', '#22c384');
  }
  updateSky(dt);
  if (G.state !== 'PLAYING' || !G.piece) return;

  // 좌우 자동 반복 (DAS / ARR)
  if (dasDir) {
    dasT += dt;
    if (dasT > DAS) {
      arrT += dt;
      while (arrT >= ARR) {
        arrT -= ARR;
        if (!tryMove(dasDir)) break;
      }
    }
  }
  const p = G.piece;
  if (G.touchSoft) G.touchSoftT += dt;
  const touchSoftOn = G.touchSoft && G.touchSoftT >= TOUCH_SOFT_DELAY;
  const softOn = G.softDrop || touchSoftOn;
  const interval = G.softDrop ? Math.min(SOFT_MS, G.dropInterval) : touchSoftOn ? Math.min(touchSoftMs(), G.dropInterval) : G.dropInterval;
  if (!collide(p, 0, 1)) {
    G.lockAcc = 0;
    G.dropAcc += dt;
    while (G.dropAcc >= interval) {
      G.dropAcc -= interval;
      if (collide(p, 0, 1)) break;
      p.y++;
      if (softOn) {
        addScore(1, true);
        S.soft();
      }
    }
  } else {
    G.dropAcc = 0;
    G.lockAcc += dt;
    if (G.lockAcc >= G.diff.lock) lockPiece();
  }
}
function loop(now) {
  const dt = Math.min(50, now - lastFrame);
  lastFrame = now;
  if (G.state === 'PLAYING') updatePlaying(dt);
  else if (G.state === 'CLEARING') {
    G.clearing.t += dt;
    if (G.clearing.t >= CLEAR_MS) {
      S.collapse(G.clearing.rows.length);
      removeRows(G.clearing.rows);
      G.clearing = null;
      if (G.board.every((r) => r.every((v) => !v))) {
        const bonus = 2000 * G.level;
        addScore(bonus);
        S.allClear();
        showAction('全清!', '+' + bonus, '#ffb800');
      }
      updateHUD();
      finishTurn();
    }
  } else if (G.state === 'QUIZ') updateQuiz(now);
  else if (G.state === 'GAME_OVER') G.overT += dt;

  if (G.state !== 'PAUSED') updateFx(dt);
  hudT += dt;
  if (hudT > 200) {
    hudT = 0;
    if (G.state === 'PLAYING') updateHUD();
  }
  render(now);
  requestAnimationFrame(loop);
}

/* ---------------- 키 입력 ---------------- */
function anyOpen(id) {
  return !$(id).classList.contains('hidden');
}
document.addEventListener('keydown', (e) => {
  const code = e.code;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) e.preventDefault();
  if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text') {
    if (code === 'Enter') $('save-rank-btn').click();
    return;
  }
  if (anyOpen('intro-ui')) return closeIntro();

  if (code === 'KeyM' && !e.repeat) return toggleMute();

  // 설정 / 방법 / 랭킹 창 닫기
  if (anyOpen('section-ui')) {
    if (code === 'Escape') $('btn-section-back').click();
    if (code === 'Enter') $('btn-map-continue').click();
    return;
  }
  for (const id of ['settings-ui', 'howto-ui', 'ranking-ui']) {
    if (anyOpen(id)) {
      if (code === 'Escape' || (code === 'Enter' && id !== 'ranking-ui')) hideOverlay(id);
      return;
    }
  }

  if (G.state === 'IDLE' && anyOpen('lobby-ui')) {
    const m = { Digit1: 'NORMAL', Digit2: 'HELL' }[code];
    if (m) startGame(m, continueStage(m));
    return;
  }
  if (G.state === 'QUIZ') {
    const idx = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[code];
    if (idx !== undefined) answerQuiz(idx);
    if (code === 'KeyR' && G.quiz && (G.quiz.type === 'listen' || G.quiz.type === 'cn2kr')) TTS.speak(G.quiz.say);
    return;
  }
  if (G.state === 'LEVEL_CLEAR') {
    if ((code === 'Enter' || code === 'Space') && anyOpen('level-clear-ui')) nextLevel();
    return;
  }
  if (code === 'KeyP' || code === 'Escape') {
    if (!e.repeat) togglePause();
    return;
  }
  if (G.state !== 'PLAYING' || !G.piece) return;

  switch (code) {
    case 'ArrowLeft':
      if (e.repeat) return;
      keys.left = true;
      dasDir = -1;
      dasT = arrT = 0;
      tryMove(-1);
      break;
    case 'ArrowRight':
      if (e.repeat) return;
      keys.right = true;
      dasDir = 1;
      dasT = arrT = 0;
      tryMove(1);
      break;
    case 'ArrowDown':
      if (e.repeat) return;
      G.softDrop = true;
      G.dropAcc = Math.max(G.dropAcc, SOFT_MS);
      break;
    case 'ArrowUp':
    case 'KeyX':
      if (!e.repeat) rotate(1);
      break;
    case 'KeyZ':
    case 'ControlLeft':
      if (!e.repeat) rotate(-1);
      break;
    case 'Space':
      if (!e.repeat) hardDrop();
      break;
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft') {
    keys.left = false;
    if (dasDir === -1) dasDir = keys.right ? 1 : 0;
    dasT = arrT = 0;
  } else if (e.code === 'ArrowRight') {
    keys.right = false;
    if (dasDir === 1) dasDir = keys.left ? -1 : 0;
    dasT = arrT = 0;
  } else if (e.code === 'ArrowDown') G.softDrop = false;
});
window.addEventListener('blur', () => {
  keys.left = keys.right = false;
  dasDir = 0;
  G.softDrop = false;
  if (G.state === 'PLAYING') togglePause();
});

/* ---------------- 10. 화면 전환 ---------------- */
const OVERLAYS = ['intro-ui', 'lobby-ui', 'section-ui', 'howto-ui', 'quiz-ui', 'pause-ui', 'level-clear-ui', 'game-over-ui', 'ranking-ui', 'settings-ui'];
function showOverlay(id) {
  $(id).classList.remove('hidden');
}
function hideOverlay(id) {
  $(id).classList.add('hidden');
}
function hideAll() {
  OVERLAYS.forEach(hideOverlay);
}
function setModeLook(mode) {
  document.body.dataset.mode = mode;
  $('mode-badge').textContent = mode === 'LOBBY' ? '모드 고르기' : `${MODE_CFG[mode].label.split(' ')[0]} STAGE ${G.section}`;
}

function closeIntro() {
  if (!anyOpen('intro-ui')) return;
  Sound.init();
  BGM.attach(Sound.ctx());
  TTS.unlock();
  TTS.choose();
  S.ui();
  hideOverlay('intro-ui');
  showLobby();
}
function showLobby() {
  G.runId++;
  G.state = 'IDLE';
  G.piece = null;
  if (window.speechSynthesis) speechSynthesis.cancel();
  hideAll();
  setModeLook('LOBBY');
  boardWrap.className = '';
  $('status-chips').innerHTML = '';
  $('countdown').classList.add('hidden');
  renderLobby();
  showOverlay('lobby-ui');
  BGM.setDuck(1);
  BGM.play('lobby');
}
function startGame(mode, section) {
  if (!section) return openSections(mode);
  if (section > continueStage(mode)) return; // 잠긴 스테이지
  if (document.activeElement) document.activeElement.blur();
  hideAll();
  resetGame(mode, section);
  generateObstacles();
  setModeLook(mode);
  boardWrap.className = '';
  updateHUD();
  drawPreviews();
  G.levelStart = performance.now();
  BGM.setDuck(1);
  BGM.play(mode);
  countdown(() => spawnNext());
}
function countdown(done) {
  G.state = 'COUNTDOWN';
  const el = $('countdown');
  const run = G.runId;
  const steps = ['3', '2', '1', 'GO!'];
  el.classList.remove('hidden');
  steps.forEach((s, i) => {
    setTimeout(() => {
      if (run !== G.runId) return;
      el.innerHTML = `<span>${s}</span>`;
      S.count(i === 3);
      if (i === 3) TTS.speak('开始！', 1);
    }, i * 650);
  });
  setTimeout(() => {
    if (run !== G.runId) return;
    el.classList.add('hidden');
    lastFrame = performance.now();
    done();
  }, steps.length * 650);
}
function togglePause() {
  if (G.state === 'PAUSED') {
    hideOverlay('pause-ui');
    G.state = G.prevState;
    lastFrame = performance.now();
    BGM.resume();
  } else if (G.state === 'PLAYING' || G.state === 'CLEARING') {
    G.prevState = G.state;
    G.state = 'PAUSED';
    G.softDrop = false;
    dasDir = 0;
    showOverlay('pause-ui');
    BGM.pause();
  }
}
function showLevelClear() {
  G.state = 'LEVEL_CLEAR';
  G.sky = [];
  G.stagesCleared++;
  const total = secCount(G.mode);
  const last = G.level >= total;
  const newly = unlockStage(G.mode, G.level + 1);
  S.levelUp();
  TTS.speak(last ? '全部通关！' : '过关！', 1);
  const sec = Math.floor((performance.now() - G.levelStart) / 1000);
  $('clear-level').textContent = G.level;
  $('level-time').textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  $('level-combo').textContent = G.maxCombo;
  $('level-score').textContent = (G.score - G.levelScoreStart).toLocaleString();
  $('level-quiz').textContent = `${G.lvQuizRight}/${G.lvQuizTotal}`;
  $('clear-big').textContent = last ? '全部通关!' : '过关!';
  $('unlock-msg').textContent = last
    ? `${G.mode === 'HELL' ? '헬' : '노멀'} 모드 모든 스테이지를 클리어했어요!`
      : `${newly ? '새 스테이지가 열렸어요! STAGE ' + (G.level + 1) : '다음은 STAGE ' + (G.level + 1)} (단어 ${pad4(sectionWords(G.level + 1)[0].no)}–${pad4(sectionWords(G.level + 1).slice(-1)[0].no)})`;
  $('next-level-btn').innerHTML = last ? `${icon('trophy')}기록 남기기` : `${icon('play')}STAGE ${G.level + 1} 시작 <kbd>Enter</kbd>`;
  const run = G.runId;
  setTimeout(() => run === G.runId && showOverlay('level-clear-ui'), 700);
}
function nextLevel() {
  if (G.state !== 'LEVEL_CLEAR') return;
  hideOverlay('level-clear-ui');
  if (G.level >= secCount(G.mode)) {
    G.allClear = true;
    G.board = createBoard();
    G.state = 'PLAYING';
    return gameOver();
  }
  G.level++;
  G.section = G.level;
  G.diff = difficulty(G.mode, G.level);
  G.qQueue = shuffle(sectionWords(G.section).slice());
  G.levelUpPending = false;
  G.quizPending = false;
  G.placed = 0;
  G.maxCombo = 0;
  G.combo = -1;
  G.lvQuizRight = G.lvQuizTotal = 0;
  G.levelScoreStart = G.score;
  G.levelStart = performance.now();
  G.reversedUntil = 0;
  G.eventTimer = 0;
  G.skyTimer = 0;
  G.board = createBoard();
  generateObstacles();
  G.dropInterval = G.diff.speed;
  setModeLook(G.mode);
  updateHUD();
  BGM.play(G.mode);
  countdown(() => spawnNext());
}
function gameOver() {
  if (G.state === 'GAME_OVER') return;
  G.state = 'GAME_OVER';
  G.overT = 0;
  G.piece = null;
  G.sky = [];
  hideOverlay('quiz-ui');
  BGM.setDuck(1);
  if (G.allClear) {
    S.allClear();
    BGM.play('lobby');
  } else {
    S.over();
    BGM.play('over');
    boardFx('shake-l');
  }
  $('over-title').textContent = G.allClear ? '全部通关' : '游戏结束';
  $('over-title').classList.toggle('red', !G.allClear);
  $('over-sub').textContent =
    `STAGE ${G.startStage}에서 시작해서 STAGE ${G.level}까지 왔어요. 이번 판에 ${G.stagesCleared}개 클리어!` +
    (G.allClear ? '' : ` 다음엔 STAGE ${continueStage(G.mode)}부터 이어서 할 수 있어요.`);
  $('final-score').textContent = G.score.toLocaleString();
  $('final-level').textContent = G.level;
  $('final-lines').textContent = G.lines;
  $('final-acc').textContent = G.quizTotal ? Math.round((G.quizRight / G.quizTotal) * 100) + '%' : '-';
  const list = $('review-list');
  list.innerHTML = '';
  if (!G.missed.size) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = G.quizTotal ? '틀린 단어가 하나도 없어요! 完美!' : '이번 판에는 퀴즈가 없었어요.';
    list.appendChild(li);
  }
  G.missed.forEach((q) => {
    const li = document.createElement('li');
    li.title = '발음 듣기';
    const left = document.createElement('div');
    const cn = document.createElement('div');
    cn.className = 'rv-cn';
    cn.innerHTML = icon('sound');
    cn.append(q.cn);
    const py = document.createElement('div');
    py.className = 'rv-py';
    py.textContent = q.py;
    left.append(cn, py);
    const kr = document.createElement('div');
    kr.className = 'rv-kr';
    kr.textContent = q.kr;
    li.append(left, kr);
    li.addEventListener('click', () => TTS.speak(q.cn));
    list.appendChild(li);
  });
  const canRank = true;
  const best = progress[G.mode].best;
  if (!best || G.level > best.stage || (G.level === best.stage && G.score > best.score)) {
    progress[G.mode].best = { stage: G.level, score: G.score, clear: G.allClear };
    saveProgress();
  }
  $('save-row').classList.toggle('hidden', !canRank);
  $('player-name').value = loadJSON('cntetris_lastname', '');
  const run = G.runId;
  setTimeout(() => {
    if (run !== G.runId) return;
    showOverlay('game-over-ui');
    if (canRank && !isTouch) $('player-name').focus(); // 휴대폰은 자동으로 키보드를 띄우지 않음
  }, 1000);
}

/* ---------------- 스테이지 맵 (노멀 25단어×40 · 헬 100단어×10) ---------------- */
let mapMode = 'NORMAL';
function openSections(mode = 'NORMAL') {
  mapMode = mode;
  hideAll();
  const grid = $('section-grid');
  grid.innerHTML = '';
  grid.dataset.mode = mode;
  const total = secCount(mode);
  const cur = continueStage(mode);
  $('section-title').textContent = (mode === 'HELL' ? '헬 모드' : '노멀 모드') + ' 스테이지';
  $('section-summary').textContent = `스테이지마다 ${secSize(mode)}단어, 지금까지 ${Math.min(progress[mode].unlocked - 1, total)}개 클리어 (전체 ${total}개)`;
  for (let st = 1; st <= total; st++) {
    const words = sectionWords(st, mode);
    const cleared = isCleared(mode, st);
    const locked = st > cur;
    const b = document.createElement('button');
    b.className = 'sec-tile' + (cleared ? ' done' : locked ? ' locked' : ' rec');
    b.innerHTML =
      `<span class="sec-no">${locked ? icon('lock') : cleared ? icon('star') : st}</span>` +
      `<span class="sec-range">STAGE ${st}</span>` +
      `<span class="sec-cn"></span><span class="sec-bar"><i></i></span>`;
    b.querySelector('.sec-cn').textContent = locked ? `${pad4(words[0].no)}–${pad4(words[words.length - 1].no)}` : `${words[0].cn} … ${words[words.length - 1].cn}`;
    b.style.setProperty('--p', cleared ? 1 : 0);
    b.disabled = locked;
    b.dataset.sec = st;
    if (!locked) b.addEventListener('click', () => startGame(mode, st));
    grid.appendChild(b);
  }
  $('btn-map-continue').innerHTML = `${icon('play')}STAGE ${cur} ${cur > 1 ? '이어하기' : '시작'}`;
  setModeLook('LOBBY');
  showOverlay('section-ui');
  const curTile = grid.querySelector(`[data-sec="${cur}"]`);
  if (curTile) curTile.scrollIntoView({ block: 'nearest' });
}
$('btn-map-continue').addEventListener('click', () => startGame(mapMode, continueStage(mapMode)));
$('btn-section-back').addEventListener('click', () => {
  hideOverlay('section-ui');
  renderLobby();
  showOverlay('lobby-ui');
});

/* ---------------- 랭킹 ---------------- */
const rankKey = (m) => `cikuai_hsk4_rank_${m}`;
const rankSort = (a, b) => b.stage - a.stage || b.score - a.score;
function getRankings(mode) {
  const r = loadJSON(rankKey(mode), []);
  return Array.isArray(r) ? r : [];
}
function renderRankings(mode, highlight = -1) {
  $('tab-normal').classList.toggle('active', mode === 'NORMAL');
  $('tab-hell').classList.toggle('active', mode === 'HELL');
  const list = $('rank-list');
  list.innerHTML = '';
  const ranks = getRankings(mode);
  if (!ranks.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '아직 기록이 없어요. 첫 번째 주인공이 되어 보세요!';
    list.appendChild(li);
    return;
  }
  ranks.forEach((r, i) => {
    const li = document.createElement('li');
    if (i === highlight) li.className = 'me';
    [
      ['rk', i + 1],
      ['nm', r.name],
      ['lv', 'STAGE ' + r.stage, r.clear],
      ['sc', Number(r.score).toLocaleString()],
    ].forEach(([cls, txt, star]) => {
      const s = document.createElement('span');
      s.className = cls;
      if (star) s.innerHTML = icon('star');
      s.append(txt);
      li.appendChild(s);
    });
    list.appendChild(li);
  });
}
$('save-rank-btn').addEventListener('click', () => {
  const name = $('player-name').value.trim().slice(0, 6) || '무명';
  saveJSON('cntetris_lastname', name);
  const ranks = getRankings(G.mode);
  const rec = { name, score: G.score, stage: G.level, clear: G.allClear, cleared: G.stagesCleared, date: new Date().toLocaleDateString(), t: Date.now() };
  ranks.push(rec);
  ranks.sort(rankSort);
  const top = ranks.slice(0, 10);
  saveJSON(rankKey(G.mode), top);
  $('save-row').classList.add('hidden');
  renderRankings(G.mode, top.indexOf(rec));
  showOverlay('ranking-ui');
  S.correct();
});
$('tab-normal').addEventListener('click', () => renderRankings('NORMAL'));
$('tab-hell').addEventListener('click', () => renderRankings('HELL'));
$('close-rank-btn').addEventListener('click', () => hideOverlay('ranking-ui'));
$('btn-open-rank').addEventListener('click', () => {
  renderRankings('NORMAL');
  showOverlay('ranking-ui');
});

/* ---------------- 설정 ---------------- */
function fillVoiceSelect() {
  const sel = $('set-voice');
  sel.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = '자동 선택 (Tingting 우선)';
  sel.appendChild(auto);
  TTS.voices.forEach((v) => {
    const o = document.createElement('option');
    o.value = v.name;
    o.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(o);
  });
  sel.value = settings.voice || '';
  const note = $('voice-note');
  const v = TTS.voice;
  if (!v) {
    note.textContent = '이 기기에서 중국어 음성을 찾지 못했어요. Chrome(아이폰은 Safari도 OK)에서 열고 인터넷 연결을 확인해 주세요. (듣기 문제는 자동으로 빠져요)';
  } else if (/ting/i.test(v.name)) {
    note.textContent = `지금 음성: ${v.name}`;
  } else {
    note.textContent = `지금 음성: ${v.name}\nTingting은 Mac·iPhone에 들어 있는 음성이라, Windows에서는 가장 비슷한 중국어 여성 음성을 자동으로 써요.`;
  }
}
function openSettings() {
  if (G.state === 'PLAYING' || G.state === 'CLEARING') togglePause();
  $('set-bgm').value = settings.bgm;
  $('set-sfx').value = settings.sfx;
  $('set-tts').checked = settings.tts;
  $('set-rate').value = settings.rate;
  $('set-ghost').checked = settings.ghost;
  $('set-soft').value = settings.soft || 5;
  $('soft-val').textContent = settings.soft || 5;
  TTS.choose();
  fillVoiceSelect();
  showOverlay('settings-ui');
}
$('set-bgm').addEventListener('input', (e) => {
  settings.bgm = +e.target.value;
  BGM.refresh();
  saveSettings();
});
$('set-sfx').addEventListener('input', (e) => {
  settings.sfx = +e.target.value;
  Sound.setVolume();
  saveSettings();
});
$('set-sfx').addEventListener('change', () => S.correct());
$('set-tts').addEventListener('change', (e) => {
  settings.tts = e.target.checked;
  saveSettings();
});
$('set-rate').addEventListener('input', (e) => {
  settings.rate = +e.target.value;
  saveSettings();
});
$('set-rate').addEventListener('change', () => TTS.speak('你好，我们一起学中文吧！'));
$('set-soft').addEventListener('input', (e) => {
  settings.soft = +e.target.value;
  $('soft-val').textContent = settings.soft;
  saveSettings();
});
$('set-ghost').addEventListener('change', (e) => {
  settings.ghost = e.target.checked;
  saveSettings();
});
$('set-voice').addEventListener('change', (e) => {
  settings.voice = e.target.value;
  saveSettings();
  TTS.choose();
  fillVoiceSelect();
  TTS.speak('你好！');
});
$('btn-test-voice').addEventListener('click', () => TTS.speak('你好，我们一起学中文吧！'));

function toggleMute() {
  settings.muted = !settings.muted;
  saveSettings();
  Sound.setVolume();
  BGM.refresh();
  if (settings.muted && window.speechSynthesis) speechSynthesis.cancel();
  $('btn-mute').innerHTML = icon(settings.muted ? 'mute' : 'sound');
}

/* ---------------- 버튼 연결 ---------------- */
document.querySelectorAll('.mode-card').forEach((card) => {
  const mode = card.dataset.mode;
  card.querySelector('.mc-play').addEventListener('click', () => startGame(mode, continueStage(mode)));
  card.querySelector('.mc-map').addEventListener('click', () => openSections(mode));
});
function renderLobby() {
  document.querySelectorAll('.mode-card').forEach((card) => {
    const mode = card.dataset.mode;
    const total = secCount(mode);
    const cleared = Math.min(progress[mode].unlocked - 1, total);
    const cur = continueStage(mode);
    card.querySelector('.mc-unlocked').textContent = `${cleared} / ${total}`;
    card.querySelector('.mc-bar i').style.width = (cleared / total) * 100 + '%';
    const best = progress[mode].best;
    card.querySelector('.mc-best').textContent = best ? `최고 기록: STAGE ${best.stage}${best.clear ? ' 모두 클리어' : ''}, ${Number(best.score).toLocaleString()}점` : '최고 기록 없음';
    card.querySelector('.mc-play').innerHTML = cleared >= total ? `${icon('play')}STAGE ${cur} 다시 도전` : `${icon('play')}STAGE ${cur} ${cur > 1 ? '이어하기' : '시작'}`;
  });
}
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => hideOverlay(b.dataset.close)));
$('btn-open-howto').addEventListener('click', () => showOverlay('howto-ui'));
$('btn-open-settings').addEventListener('click', openSettings);
$('btn-settings').addEventListener('click', openSettings);
$('btn-pause-settings').addEventListener('click', openSettings);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-pause').addEventListener('click', togglePause);
$('btn-resume').addEventListener('click', togglePause);
$('btn-quit').addEventListener('click', showLobby);
$('btn-home').addEventListener('click', () => {
  if (G.state === 'PLAYING' || G.state === 'CLEARING') togglePause();
  else if (G.state !== 'PAUSED' && G.state !== 'QUIZ') showLobby();
});
$('next-level-btn').addEventListener('click', nextLevel);
$('retry-btn').addEventListener('click', () => startGame(G.mode, G.section));
$('restart-btn').addEventListener('click', showLobby);
$('quiz-listen').addEventListener('click', () => G.quiz && TTS.speak(G.quiz.say));
$('intro-ui').addEventListener('click', closeIntro);
document.querySelectorAll('button').forEach((b) => b.addEventListener('mousedown', () => S.ui()));

/* ---------------- 화면 맞춤 · 브라우저 안내 ---------------- */
function isChrome() {
  const brands = navigator.userAgentData && navigator.userAgentData.brands;
  if (brands) return brands.some((b) => b.brand === 'Google Chrome');
  const ua = navigator.userAgent;
  if (/CriOS\//.test(ua)) return true; // 아이폰 Chrome
  return /Chrome\//.test(ua) && !/Edg\/|OPR\/|Whale\/|SamsungBrowser|KAKAOTALK|NAVER|; ?wv\)/.test(ua);
}
function buzz(pattern) {
  if (navigator.vibrate && !settings.muted) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {}
  }
}

/* 레이아웃: desktop(키보드) / portrait(세로 터치) / landscape(가로 터치) */
const LAYOUT_SIZE = { desktop: [960, 930], landscape: [1400, 930], portrait: [476, 900] };
let isTouch =
  (window.matchMedia && matchMedia('(pointer: coarse)').matches) ||
  (navigator.maxTouchPoints > 0 && window.matchMedia && matchMedia('(hover: none)').matches);
let layout = '';

function sizeCanvas(c, lw, lh) {
  const r = c.getBoundingClientRect();
  if (!r.width) return;
  const k = Math.max(1, Math.min(3, (r.width * (window.devicePixelRatio || 1)) / lw));
  const w = Math.round(lw * k), h = Math.round(lh * k);
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  c._k = w / lw;
}
// 휴대폰 키보드가 떠 있는 동안(입력칸 사용 중)은 화면 배치를 그대로 유지
// → 키보드 때문에 화면 높이가 줄어도 '가로 화면'으로 착각하지 않음
const isTyping = () => {
  const a = document.activeElement;
  return isTouch && !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
};
function fit() {
  if (isTyping()) return;
  const body = document.body;
  body.classList.toggle('touch', isTouch);
  const probe = $('safe-probe').getBoundingClientRect();
  const bannerOn = !$('browser-banner').classList.contains('hidden');
  const banner = bannerOn ? $('browser-banner').offsetHeight : 0;
  const W = probe.width || window.innerWidth;
  const H = (probe.height || window.innerHeight) - banner;

  const next = !isTouch ? 'desktop' : H > W ? 'portrait' : 'landscape';
  if (next !== layout) {
    layout = next;
    body.classList.toggle('portrait', layout === 'portrait');
    body.classList.toggle('landscape', layout === 'landscape');
  }
  // 휴대폰을 가로로 눕힌 경우 → 세로로 돌리기 안내
  const phoneLandscape = isTouch && W > H && H < 520;
  $('rotate-hint').classList.toggle('hidden', !phoneLandscape);
  if (phoneLandscape && G.state === 'PLAYING') togglePause();

  const [dw, dh] = LAYOUT_SIZE[layout];
  const scale = Math.max(0.3, Math.min(W / dw, H / dh));
  const stage = $('stage');
  stage.style.setProperty('--scale', scale.toFixed(4));
  stage.style.left = probe.left + W / 2 + 'px';
  stage.style.top = probe.top + banner + H / 2 + 'px';

  // 휴대폰 세로: '다음 블록'을 왼쪽 열 맨 위로 옮김 (오른쪽 패널은 숨김)
  const nextCard = document.querySelector('.next-card');
  const home = layout === 'portrait' ? $('left-panel') : $('right-panel');
  if (nextCard && nextCard.parentElement !== home) home.prepend(nextCard);
  sizeCanvas(cv, 400, 800);
  sizeCanvas($('fx'), 400, 800);
  sizeCanvas($('next-canvas'), 160, 330);
  drawPreviews();
  $('intro-hint').textContent = isTouch ? '화면을 터치해서 시작하세요' : '아무 키나 누르거나 클릭하세요';
}

document.addEventListener('focusin', (e) => {
  if (isTouch && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) document.body.classList.add('typing');
});
document.addEventListener('focusout', (e) => {
  if (!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  document.body.classList.remove('typing');
  setTimeout(() => {
    window.scrollTo(0, 0);
    fit();
  }, 350);
});

/* ---------------- 터치 조작 ---------------- */
const canPlay = () => G.state === 'PLAYING' && !!G.piece;
function pressMove(dir) {
  if (dir < 0) keys.left = true;
  else keys.right = true;
  dasDir = dir;
  dasT = arrT = 0;
  if (canPlay()) tryMove(dir);
}
function releaseMove(dir) {
  if (dir < 0) keys.left = false;
  else keys.right = false;
  if (dasDir === dir) dasDir = dir < 0 ? (keys.right ? 1 : 0) : keys.left ? -1 : 0;
  dasT = arrT = 0;
}
const TOUCH_ACTS = {
  left: { down: () => pressMove(-1), up: () => releaseMove(-1) },
  right: { down: () => pressMove(1), up: () => releaseMove(1) },
  down: {
    down: () => {
      G.touchSoft = true;
      G.touchSoftT = 0;
      // 탭하면 딱 한 칸
      const p = G.piece;
      if (canPlay() && p && !collide(p, 0, 1)) {
        p.y++;
        G.dropAcc = 0;
        addScore(1, true);
        S.soft();
      }
    },
    up: () => (G.touchSoft = false),
  },
  cw: { down: () => canPlay() && rotate(1) },
  ccw: { down: () => canPlay() && rotate(-1) },
  drop: { down: () => canPlay() && hardDrop() },
};
document.querySelectorAll('.tc-btn').forEach((btn) => {
  const act = TOUCH_ACTS[btn.dataset.act];
  let held = null;
  const release = (e) => {
    if (held === null || (e && e.pointerId !== held)) return;
    held = null;
    btn.classList.remove('pressed');
    if (act.up) act.up();
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sound.init();
    held = e.pointerId;
    try {
      btn.setPointerCapture(e.pointerId);
    } catch (err) {}
    btn.classList.add('pressed');
    buzz(6);
    act.down();
  });
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', release);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});

/* 보드 위 제스처: 탭=회전 · 좌우로 끌기=이동 · 아래로 끌기=소프트드롭 · 아래로 휙=하드드롭 */
let gest = null;
boardWrap.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || !canPlay()) return;
  e.preventDefault();
  Sound.init();
  const cell = boardWrap.getBoundingClientRect().width / COLS;
  gest = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, t0: performance.now(), ax: 0, ay: 0, moved: false, cell };
  try {
    boardWrap.setPointerCapture(e.pointerId);
  } catch (err) {}
});
boardWrap.addEventListener('pointermove', (e) => {
  if (!gest || e.pointerId !== gest.id || !canPlay()) return;
  const step = gest.cell * 0.85;
  gest.ax += e.clientX - gest.lx;
  gest.lx = e.clientX;
  while (Math.abs(gest.ax) >= step) {
    const d = gest.ax > 0 ? 1 : -1;
    tryMove(d);
    gest.ax -= d * step;
    gest.moved = true;
  }
  const dy = e.clientY - gest.ly;
  gest.ly = e.clientY;
  if (dy > 0 && Math.abs(e.clientY - gest.y0) > Math.abs(e.clientX - gest.x0)) {
    gest.ay += dy;
    while (gest.ay >= gest.cell) {
      gest.ay -= gest.cell;
      const p = G.piece;
      if (p && !collide(p, 0, 1)) {
        p.y++;
        addScore(1, true);
        S.soft();
      }
      gest.moved = true;
    }
  }
});
function endGesture(e) {
  if (!gest || e.pointerId !== gest.id) return;
  const g = gest;
  gest = null;
  if (!canPlay() || e.type === 'pointercancel') return;
  const dt = performance.now() - g.t0;
  const dx = g.lx - g.x0;
  const dy = g.ly - g.y0;
  const vy = dy / Math.max(dt, 1);
  if (dy > g.cell * 2.5 && vy > 0.45 && dy > Math.abs(dx) * 1.5) hardDrop();
  else if (!g.moved && Math.hypot(dx, dy) < 14 && dt < 320) rotate(1);
}
boardWrap.addEventListener('pointerup', endGesture);
boardWrap.addEventListener('pointercancel', endGesture);

/* 확대 · 스크롤 · 길게 누르기 메뉴 막기 */
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1 || !e.target.closest('.scrollable, .modal')) e.preventDefault();
  },
  { passive: false },
);
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 300 && !e.target.closest('button, input, select, .opt')) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);
// 글자 선택·끌기 시작 자체를 막음 (입력칸 제외)
const isField = (t) => t && t.closest && t.closest('input, textarea, select');
document.addEventListener('selectstart', (e) => {
  if (!isField(e.target)) e.preventDefault();
});
document.addEventListener('dragstart', (e) => e.preventDefault());
// 조작 버튼·보드에서 길게 눌러도 iOS 메뉴/돋보기가 안 뜨게 (포인터 이벤트는 그대로 동작)
['touch-controls', 'board-wrap'].forEach((id) =>
  $(id).addEventListener('touchstart', (e) => e.preventDefault(), { passive: false }),
);
document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('input')) e.preventDefault();
});
// 터치스크린 노트북 등: 처음 터치하는 순간 터치 레이아웃으로 전환
window.addEventListener(
  'touchstart',
  () => {
    if (!isTouch) {
      isTouch = true;
      fit();
    }
  },
  { passive: true },
);
// 앱 전환·화면 꺼짐 → 자동 일시정지
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (G.state === 'PLAYING' || G.state === 'CLEARING')) togglePause();
  if (!document.hidden) Sound.init();
});
if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
// 소리 지킴이: 아이폰에서 소리가 끊겨도 1초 안에 자동 복구
setInterval(() => {
  if (document.hidden) return;
  Sound.ensure();
  if (G.state !== 'PAUSED') BGM.keepAlive();
}, 1000);
document.addEventListener(
  'pointerdown',
  () => {
    Sound.ensure();
    if (G.state !== 'PAUSED') BGM.keepAlive();
  },
  true,
);
window.addEventListener('orientationchange', () => setTimeout(fit, 250));

// PC에서 Chrome이 아닐 때만 안내 (휴대폰·태블릿은 기본 브라우저로도 잘 동작)
if (!isChrome() && !isTouch) {
  if (/^https?:$/.test(location.protocol)) $('banner-text').textContent = 'Chrome으로 열면 효과음과 중국어 음성이 가장 잘 나와요.';
  $('browser-banner').classList.remove('hidden');
}
$('banner-close').addEventListener('click', () => {
  $('browser-banner').classList.add('hidden');
  fit();
});
window.addEventListener('resize', fit);
fit();
$('btn-mute').innerHTML = icon(settings.muted ? 'mute' : 'sound');
requestAnimationFrame(loop);
