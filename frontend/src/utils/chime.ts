// Âm báo đơn mới (I2) bằng Web Audio — không cần file âm thanh.
// Trình duyệt chỉ cho phát tiếng sau khi người dùng đã bấm vào trang: gọi unlockChime() trong một sự kiện click.

let ctx: AudioContext | null = null;

const getContext = () => {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
};

/** Gọi trong sự kiện click để trình duyệt cho phép phát âm thanh */
export async function unlockChime() {
  const c = getContext();
  if (c && c.state === 'suspended') await c.resume();
  return c?.state === 'running';
}

export const chimeReady = () => ctx?.state === 'running';

/** "Ding-dong" 3 lần cho dễ nghe trong bếp ồn */
export function playChime(times = 3) {
  const c = getContext();
  if (!c || c.state !== 'running') return false;

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
  return true;
}
