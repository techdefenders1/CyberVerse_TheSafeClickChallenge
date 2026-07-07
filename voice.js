/**
 * VoiceManager
 * -------------------------------------------------------------------------
 * Adds spoken narration to CyberVerse using the browser's built-in
 * Web Speech API (SpeechSynthesis) — no external audio files or API keys
 * needed, works fully offline once voices are cached by the OS/browser.
 *
 * What it speaks:
 *   1. The level's question / instruction, followed by the clickable
 *      options, as soon as a level loads.
 *   2. A warm, enthusiastic praise line when the player picks the SAFE /
 *      correct action.
 *   3. A gentle, encouraging line when the player picks the wrong action.
 *   4. The "Tech Defender Rule" tip, every single time (win or lose), so
 *      the player always hears the lesson read aloud.
 *
 * Voice selection:
 *   Prefers a FEMALE voice matching the current language (English or
 *   Hindi). Falls back gracefully if the browser/OS has no female voice
 *   installed for that language.
 *
 * Usage:
 *   const voice = new VoiceManager();
 *   voice.speak("Hello!", "en");
 *   voice.toggle(); // mute/unmute, returns new enabled state
 */
class VoiceManager {
  constructor() {
    this.enabled = true;
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.voices = [];
    this.femaleVoiceEN = null;
    this.femaleVoiceHI = null;

    if (this.supported) {
      this._loadVoices();
      // Voice lists load asynchronously in most browsers.
      window.speechSynthesis.onvoiceschanged = () => this._loadVoices();
    }
  }

  _loadVoices() {
    if (!this.supported) return;
    this.voices = window.speechSynthesis.getVoices() || [];

    // Known female voice names across Chrome/Edge/Safari/Android/iOS/Windows.
    const femalePattern = /female|woman|girl|zira|susan|samantha|victoria|karen|moira|tessa|fiona|serena|kate|allison|ava|emma|joanna|salli|kendra|kimberly|ivy|heera|lekha|kalpana|veena|neel|swara|priya/i;

    const hiVoices = this.voices.filter(v => /^hi(-|$)/i.test(v.lang));
    const enVoices = this.voices.filter(v => /^en(-|$)/i.test(v.lang));

    this.femaleVoiceHI =
      hiVoices.find(v => femalePattern.test(v.name)) ||
      hiVoices[0] ||
      null;

    this.femaleVoiceEN =
      enVoices.find(v => femalePattern.test(v.name) && /en-IN/i.test(v.lang)) ||
      enVoices.find(v => femalePattern.test(v.name)) ||
      enVoices.find(v => /en-IN/i.test(v.lang)) ||
      enVoices[0] ||
      null;
  }

  /** Speak a line of text in the given language ("en" | "hi"). */
  speak(text, lang = 'en') {
    if (!this.supported || !this.enabled || !text) return;

    window.speechSynthesis.cancel(); // don't overlap with previous lines

    const utter = new SpeechSynthesisUtterance(text);
    const voice = lang === 'hi' ? this.femaleVoiceHI : this.femaleVoiceEN;

    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    } else {
      utter.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    }

    // A touch higher pitch + slightly relaxed rate reads as a warm,
    // friendly female narrator even on fallback/default system voices.
    utter.pitch = 1.12;
    utter.rate = 0.98;
    utter.volume = 1;

    window.speechSynthesis.speak(utter);
  }

  /** Convenience: speak several strings joined with a natural pause. */
  speakParts(parts, lang = 'en') {
    const text = (parts || []).filter(Boolean).join('.  ');
    this.speak(text, lang);
  }

  stop() {
    if (this.supported) window.speechSynthesis.cancel();
  }

  /** Mute/unmute narration. Returns the new enabled state. */
  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.stop();
    return this.enabled;
  }
}
