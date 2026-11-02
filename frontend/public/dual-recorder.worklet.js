// Both sources share one AudioContext clock. No source is a speaker identity.
class DualRecorder extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffers = [new Int16Array(sampleRate), new Int16Array(sampleRate), new Int16Array(sampleRate)]
    this.used = 0
    this.frame = 0
    this.running = true
    this.port.onmessage = e => {
      if (e.data === 'flush') {
        this.flush()
        this.running = false
        this.port.postMessage({ flushed: true })
      }
    }
  }
  flush() {
    if (!this.used) return
    const buffers = this.buffers.map(b => b.slice(0, this.used).buffer)
    this.port.postMessage({ startFrame: this.frame - this.used, sampleRate, buffers }, buffers)
    this.used = 0
  }
  process(inputs, outputs) {
    if (!this.running) return false
    const out = outputs[0][0]
    for (let i = 0; i < out.length; i++) {
      const values = inputs.map(channels => channels.length ? channels.reduce((v, ch) => v + (ch[i] || 0), 0) / channels.length : 0)
      const system = values[0] || 0
      const microphone = values[1] || 0
      // Fixed headroom avoids clipping when both sources are active.
      const mix = (system + microphone) * 0.5
      out[i] = mix
      ;[system, microphone, mix].forEach((v, track) => {
        const sample = Math.max(-1, Math.min(1, v))
        this.buffers[track][this.used] = Math.round(sample * (sample < 0 ? 32768 : 32767))
      })
      this.used++; this.frame++
      if (this.used === sampleRate) this.flush()
    }
    return true
  }
}
registerProcessor('dual-recorder', DualRecorder)
