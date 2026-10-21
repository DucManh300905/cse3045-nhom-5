// Âm báo đơn mới (I2): phát file frontend/public/sounds/ambao.mp3 bằng Web Audio.
// File không tải được -> dùng tiếng "ding-dong" tổng hợp như trước (quán không bị lỡ đơn).
// Trình duyệt chỉ cho phát tiếng sau khi người dùng đã bấm vào trang: gọi unlockChime() trong một sự kiện click.

const CHIME_URL = '/sounds/ambao.mp3';
/** File dài hơn mức này thì chỉ phát 1 lần (không lặp `times` lần) */
const REPEAT_MAX_SECONDS = 3;

let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let loading: Promise<AudioBuffer | null> | null = null;
let playing: AudioBufferSourceNode[] = [];

const getContext = () => {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
};

/** Tải + giải mã file âm báo một lần (lỗi -> null, dùng tiếng dự phòng) */
const loadBuffer = (c: AudioContext) => {
  loading ??= fetch(CHIME_URL)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then(data => c.decodeAudioData(data))
    .then(decoded => (buffer = decoded))
    .catch(err => {
      console.warn('[chime] không tải được', CHIME_URL, '- dùng âm báo mặc định:', err);
      loading = null; // lần mở khóa sau thử tải lại
      return null;
    });
  return loading;
};

/** Gọi trong sự kiện click để trình duyệt cho phép phát âm thanh (đồng thời tải sẵn file âm báo) */
export async function unlockChime() {
  const c = getContext();
  if (!c) return false;
  if (c.state === 'suspended') await c.resume();
  await loadBuffer(c);
  return c.state === 'running';
}

export const chimeReady = () => ctx?.state === 'running';

/** Tiếng "ding-dong" tổng hợp — dự phòng khi chưa có / lỗi file */
const playSynth = (c: AudioContext, times: number) => {
  const note = (freq: number, start: number, dur: number) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + dur);
  };

  const t = c.currentTime;
  for (let i = 0; i < times; i++) {
    note(988, t + i * 0.9, 0.35); // B5
    note(784, t + i * 0.9 + 0.3, 0.5); // G5
  }
};

/**
 * Phát âm báo. `times`: số lần lặp với âm ngắn; file dài (> 3 giây) chỉ phát 1 lần.
 * Đơn mới đến khi chuông đang kêu -> phát lại từ đầu (không chồng nhiều tiếng).
 */
export function playChime(times = 3) {
  const c = getContext();
  if (!c || c.state !== 'running') return false;

  if (!buffer) {
    loadBuffer(c); // lần sau sẽ có file
    playSynth(c, times);
    return true;
  }

  stopChime();
  const repeat = buffer.duration > REPEAT_MAX_SECONDS ? 1 : Math.max(1, times);
  const start = c.currentTime;
  for (let i = 0; i < repeat; i++) {
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(c.destination);
    source.start(start + i * (buffer.duration + 0.2));
    source.onended = () => { playing = playing.filter(s => s !== source); };
    playing.push(source);
  }
  return true;
}

/** Tắt chuông đang kêu (vd chủ quán đã thấy đơn) */
export function stopChime() {
  playing.forEach(s => {
    try { s.stop(); } catch { /* đã dừng */ }
  });
  playing = [];
}
