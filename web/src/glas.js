// Snemanje glasu za prepis (iPhonov narek na tipkovnici slovenščine ne zna).
// Posnamemo surov zvok, ga pretvorimo v WAV 16 kHz mono in pošljemo strežniku v prepis.
const HZ = 16000, NAJDLJE = 30; // sekund
export async function zacniSnemanje(obKoncu) {
  const tok = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const vir = ctx.createMediaStreamSource(tok);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const kosi = [];
  proc.onaudioprocess = (e) => kosi.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  vir.connect(proc); proc.connect(ctx.destination);
  let konec = false;
  const ustavi = () => {
    if (konec) return; konec = true; clearTimeout(t);
    proc.disconnect(); vir.disconnect(); tok.getTracks().forEach((x) => x.stop());
    const hz = ctx.sampleRate; ctx.close().catch(() => {});
    obKoncu(wav(kosi, hz));
  };
  const t = setTimeout(ustavi, NAJDLJE * 1000);
  return ustavi;
}
function wav(kosi, hz) {
  const dolz = kosi.reduce((a, k) => a + k.length, 0), korak = hz / HZ, n = Math.floor(dolz / korak);
  const vse = new Float32Array(dolz); let o = 0; for (const k of kosi) { vse.set(k, o); o += k.length; }
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const s = (p, t) => [...t].forEach((c, i) => v.setUint8(p + i, c.charCodeAt(0)));
  s(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); s(8, "WAVE"); s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, HZ, true); v.setUint32(28, HZ * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    // povprečje vzorcev v oknu (preprost filter pred zmanjšanjem frekvence)
    const a = Math.floor(i * korak), b = Math.min(dolz, Math.floor((i + 1) * korak)); let x = 0; for (let j = a; j < b; j++) x += vse[j]; x /= Math.max(1, b - a);
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 0x7fff, true);
  }
  let bin = ""; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return { b64: btoa(bin), sekund: n / HZ };
}
