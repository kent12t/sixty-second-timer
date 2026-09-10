import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="timer">
    <div class="lcd" aria-live="polite">
      <div class="digits" id="digits">0:00<span class="hundredths">.00</span></div>
      <div class="message" id="message">PRESS THE RED BUTTON</div>
    </div>
    <button class="red-button" id="red-button" type="button" aria-label="Start timer">
      <span id="button-label">START</span>
    </button>
  </main>
`

const lcd = document.querySelector<HTMLDivElement>('.lcd')!
const digits = document.querySelector<HTMLDivElement>('#digits')!
const message = document.querySelector<HTMLDivElement>('#message')!
const redButton = document.querySelector<HTMLButtonElement>('#red-button')!
const buttonLabel = document.querySelector<HTMLSpanElement>('#button-label')!
type State = 'ready' | 'running' | 'stopped'

let state: State = 'ready'
let startedAt = 0
let stoppedAt = 0
let animationId = 0
let resetId = 0
let distractionId = 0
let audioContext: AudioContext | undefined

function formatTime(milliseconds: number) {
  const totalHundredths = Math.floor(milliseconds / 10)
  const minutes = Math.floor(totalHundredths / 6000)
  const seconds = Math.floor(totalHundredths / 100) % 60
  const hundredths = totalHundredths % 100
  return `${minutes}:${seconds.toString().padStart(2, '0')}<span class="hundredths">.${hundredths.toString().padStart(2, '0')}</span>`
}

function render() {
  const elapsed = state === 'running' ? performance.now() - startedAt : stoppedAt
  digits.innerHTML = formatTime(elapsed)
  if (state === 'running') animationId = requestAnimationFrame(render)
}

function kitchenSound() {
  audioContext ??= new AudioContext()
  const ctx = audioContext
  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.13, now + 0.02)
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.8)
  master.connect(ctx.destination)
  const sound = Math.floor(Math.random() * 4)

  if (sound === 0) {
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(720, now)
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.35)
    osc.connect(master)
    osc.start(now)
    osc.stop(now + 0.4)
  } else if (sound === 1) {
    for (let i = 0; i < 3; i += 1) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = 110 + Math.random() * 40
      gain.gain.setValueAtTime(0.12, now + i * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.06)
      osc.connect(gain).connect(master)
      osc.start(now + i * 0.18)
      osc.stop(now + i * 0.18 + 0.07)
    }
  } else {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
    const source = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    filter.type = sound === 2 ? 'highpass' : 'bandpass'
    filter.frequency.value = sound === 2 ? 3500 : 900
    filter.Q.value = 4
    source.buffer = buffer
    source.connect(filter).connect(master)
    source.start(now)
  }
}

function scheduleDistraction() {
  window.clearTimeout(distractionId)
  distractionId = window.setTimeout(() => {
    if (state !== 'running') return
    kitchenSound()
    scheduleDistraction()
  }, 2500 + Math.random() * 4000)
}

function resultMessage(milliseconds: number) {
  const difference = Math.abs(30000 - milliseconds)
  if (difference < 50) return 'PERFECT.'
  if (difference < 250) return 'ICE COLD.'
  if (difference < 1000) return 'SO CLOSE.'
  if (difference < 3000) return milliseconds < 30000 ? 'A LITTLE EARLY.' : 'A LITTLE LATE.'
  return milliseconds < 30000 ? 'TOO SOON.' : 'TOO LATE.'
}

function reset() {
  window.clearTimeout(resetId)
  window.clearTimeout(distractionId)
  state = 'ready'
  stoppedAt = 0
  lcd.classList.remove('lcd--fading')
  digits.innerHTML = formatTime(0)
  message.textContent = 'PRESS THE RED BUTTON'
  buttonLabel.textContent = 'START'
  redButton.setAttribute('aria-label', 'Start timer')
}

function input() {
  if (state === 'ready') {
    state = 'running'
    startedAt = performance.now()
    lcd.classList.add('lcd--fading')
    message.textContent = ''
    buttonLabel.textContent = 'STOP'
    redButton.setAttribute('aria-label', 'Stop timer and reveal result')
    audioContext ??= new AudioContext()
    void audioContext.resume()
    render()
    scheduleDistraction()
  } else if (state === 'running') {
    state = 'stopped'
    stoppedAt = performance.now() - startedAt
    cancelAnimationFrame(animationId)
    window.clearTimeout(distractionId)
    lcd.classList.remove('lcd--fading')
    render()
    message.textContent = resultMessage(stoppedAt)
    buttonLabel.textContent = 'RESTART'
    redButton.setAttribute('aria-label', 'Reset timer')
    resetId = window.setTimeout(reset, 30000)
  } else {
    reset()
  }
}

redButton.addEventListener('click', input)

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat) return
  if (event.target === redButton) return
  event.preventDefault()
  input()
})
