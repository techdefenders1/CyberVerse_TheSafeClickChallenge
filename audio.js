/**
 * AudioManager
 * -------------------------------------------------------------------------
 * Lightweight, dependency-free audio engine for CyberVerse.
 *
 * All music and sound effects are generated procedurally with the Web Audio
 * API — there are no .mp3/.wav asset files. This keeps the whole game
 * offline-friendly (it already runs from a local Python server) and sidesteps
 * any licensing concerns around third-party music/SFX.
 *
 * Usage:
 *   const audio = new AudioManager();
 *   audio.init();        // call from inside a user click/tap handler
 *   audio.startMusic();  // begins the looping background pad
 *   audio.playClick();   // short UI blip
 *   audio.playCorrect(); // bright ascending chime
 *   audio.playIncorrect(); // low descending buzz
 *   audio.toggleMute();  // mutes/unmutes everything, returns new muted state
 */
class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;

    this.muted = false;
    this.musicStarted = false;
    this._chordIdx = 0;
    this._musicTimer = null;

    // Soft, moody Am-F-C-G progression — a "focused night-shift" atmosphere
    // that stays in the background rather than demanding attention.
    // Each entry is [root, third, fifth] in Hz.
    this.progression = [
      [220.00, 261.63, 329.63], // A minor  (A3, C4, E4)
      [174.61, 220.00, 261.63], // F major  (F3, A3, C4)
      [130.81, 164.81, 196.00], // C major  (C3, E3, G3)
      [196.00, 246.94, 293.66]  // G major  (G3, B3, D4)
    ];
  }

  /** Must be called from inside a user-gesture handler (click/tap). */
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // Web Audio unsupported — game still works, just silent

    this.ctx = new AC();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16; // deliberately light / background level
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.45;
    this.sfxGain.connect(this.masterGain);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  // ---------------------------------------------------------------- MUSIC --
  startMusic() {
    if (!this.ctx || this.musicStarted) return;
    this.musicStarted = true;
    this._chordIdx = 0;
    this._scheduleChord();
  }

  stopMusic() {
    this.musicStarted = false;
    if (this._musicTimer) clearTimeout(this._musicTimer);
  }

  _scheduleChord() {
    if (!this.musicStarted || !this.ctx) return;
    const chord = this.progression[this._chordIdx % this.progression.length];
    const now = this.ctx.currentTime;
    const chordLength = 4.2; // seconds per chord => ~16.8s full loop

    // Soft pad: each chord tone gets a slow swell-in / swell-out envelope
    // through a lowpass filter so it reads as an ambient pad, not a beep.
    chord.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;

      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + 1.4);
      gain.gain.linearRampToValueAtTime(0.85, now + chordLength - 1.6);
      gain.gain.linearRampToValueAtTime(0, now + chordLength);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);

      osc.start(now);
      osc.stop(now + chordLength + 0.05);
    });

    // A few quiet, sparkling arpeggio notes on top for a subtle "digital" texture.
    const arp = [chord[1] * 2, chord[2] * 2, chord[0] * 2];
    arp.forEach((freq, i) => {
      const start = now + 1.0 + i * 0.9;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.3, start + 0.05);
      gain.gain.linearRampToValueAtTime(0, start + 0.7);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(start);
      osc.stop(start + 0.75);
    });

    this._chordIdx++;
    this._musicTimer = setTimeout(() => this._scheduleChord(), chordLength * 1000);
  }

  // ------------------------------------------------------------------ SFX --
  _tone({ freq, start = 0, duration = 0.12, type = 'sine', peak = 0.5, glideTo = null }) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, now + duration);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /** Short UI blip — used for the Start button and general navigation clicks. */
  playClick() {
    if (!this.ctx) return;
    this._tone({ freq: 720, duration: 0.07, type: 'square', peak: 0.28 });
  }

  /** Bright ascending major arpeggio — correct / safe action. */
  playCorrect() {
    if (!this.ctx) return;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      this._tone({ freq: f, start: i * 0.09, duration: 0.16, type: 'triangle', peak: 0.4 });
    });
  }

  /** Low descending buzz — incorrect / unsafe action. */
  playIncorrect() {
    if (!this.ctx) return;
    this._tone({ freq: 220, duration: 0.28, type: 'sawtooth', peak: 0.32, glideTo: 110 });
    this._tone({ freq: 180, start: 0.05, duration: 0.3, type: 'square', peak: 0.18, glideTo: 90 });
  }
}
