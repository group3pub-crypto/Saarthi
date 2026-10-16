export class SpeechService {
  private static synth: SpeechSynthesis | null = typeof window !== 'undefined' ? window.speechSynthesis : null
  private static recognition: any = null

  static speak(text: string, lang = 'en-IN') {
    if (!this.synth) return
    this.synth.cancel() // Cancel ongoing speech

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.rate = 0.95 // Slightly slower for clarity
    utterance.pitch = 1.0

    // Try finding an appropriate language voice
    const voices = this.synth.getVoices()
    const voice = voices.find(v => v.lang.startsWith(lang.slice(0, 2)))
    if (voice) {
      utterance.voice = voice
    }

    this.synth.speak(utterance)
  }

  static stop() {
    if (this.synth) {
      this.synth.cancel()
    }
  }

  static startListening(onResult: (transcript: string) => void, onError?: (err: any) => void, lang = 'en-IN') {
    if (typeof window === 'undefined') return

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      if (onError) onError(new Error('Speech recognition not supported in this browser.'))
      return
    }

    if (this.recognition) {
      this.recognition.abort()
    }

    const rec = new SpeechRecognition()
    rec.lang = lang
    rec.continuous = false
    rec.interimResults = false

    rec.onresult = (event: any) => {
      const text = event.results[0][0].transcript
      onResult(text)
    }

    rec.onerror = (event: any) => {
      if (onError) onError(event)
    }

    this.recognition = rec
    rec.start()
  }

  static stopListening() {
    if (this.recognition) {
      this.recognition.stop()
      this.recognition = null
    }
  }
}
