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
let typingId = 0
let runId = 0
let audioContext: AudioContext | undefined
const audioBuffers = new Map<string, Promise<AudioBuffer>>()
const activeSounds = new Map<string, number>()
const activeSources = new Set<AudioBufferSourceNode>()
const playedOnce = new Set<string>()
const playCounts = new Map<string, number>()
const playLimits = new Map<string, number>()

const distractionSounds = [
  { name: 'microwave', chance: 1 / 22.5 },
  { name: 'bell', chance: 6 / 30 },
  { name: 'marker', chance: 4 / 30 },
  { name: 'chair', chance: 2 / 30 },
  { name: 'phone', chance: 0.06, limit: 1 },
  { name: 'printer', chance: 0.06, limit: 1 },
  { name: 'twenty to ninety', chance: 0.06, limit: 1 },
  { name: 'one to ten', chance: 0.06, limit: 1 },
  { name: 'fifteen', chance: 0.18, variableLimit: true },
  { name: 'twenty', chance: 0.18, variableLimit: true },
]

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

function loadSound(name: string) {
  audioContext ??= new AudioContext()
  let buffer = audioBuffers.get(name)
  if (!buffer) {
    buffer = fetch(`/${name}.aac`)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ${name}.aac`)
        return response.arrayBuffer()
      })
      .then((data) => audioContext!.decodeAudioData(data))
    audioBuffers.set(name, buffer)
  }
  return buffer
}

async function playSound(name: string, currentRun: number, onEnded?: () => void) {
  if (activeSounds.has(name)) return
  activeSounds.set(name, currentRun)

  try {
    const buffer = await loadSound(name)
    if (state !== 'running' || currentRun !== runId) return

    const ctx = audioContext!
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    const now = ctx.currentTime
    const fadeDuration = Math.min(0.15, buffer.duration / 3)

    source.buffer = buffer
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.55, now + fadeDuration)
    gain.gain.setValueAtTime(0.55, now + Math.max(fadeDuration, buffer.duration - fadeDuration))
    gain.gain.linearRampToValueAtTime(0, now + buffer.duration)
    source.connect(gain).connect(ctx.destination)
    activeSources.add(source)
    source.addEventListener('ended', () => {
      activeSources.delete(source)
      if (activeSounds.get(name) === currentRun) activeSounds.delete(name)
      if (state === 'running' && currentRun === runId) onEnded?.()
    })
    source.start()
  } catch (error) {
    if (activeSounds.get(name) === currentRun) activeSounds.delete(name)
    console.error(error)
  } finally {
    if (
      (state !== 'running' || currentRun !== runId)
      && activeSounds.get(name) === currentRun
    ) activeSounds.delete(name)
  }
}

function rollDistractions(currentRun: number) {
  for (const sound of distractionSounds) {
    if (activeSounds.has(sound.name)) continue
    const limit = playLimits.get(sound.name)
    if (limit !== undefined && (playCounts.get(sound.name) ?? 0) >= limit) continue
    if (Math.random() >= sound.chance) continue
    playCounts.set(sound.name, (playCounts.get(sound.name) ?? 0) + 1)
    void playSound(sound.name, currentRun)
  }

  if (!playedOnce.has('happy-birthday') && Math.random() < 0.04) {
    playedOnce.add('happy-birthday')
    void playSound('surprise', currentRun, () => {
      void playSound('happy-birthday', currentRun)
    })
  }
}

function startDistractions() {
  const currentRun = runId
  playedOnce.clear()
  playCounts.clear()
  playLimits.clear()
  for (const sound of distractionSounds) {
    if (sound.limit !== undefined) playLimits.set(sound.name, sound.limit)
    if (sound.variableLimit) playLimits.set(sound.name, 1 + Math.floor(Math.random() * 3))
  }
  rollDistractions(currentRun)
  distractionId = window.setInterval(() => {
    if (state === 'running' && currentRun === runId) rollDistractions(currentRun)
  }, 1000)
  typingId = window.setTimeout(() => {
    if (state === 'running' && currentRun === runId) void playSound('typing', currentRun)
  }, Math.random() * 5000)
}

function stopDistractions() {
  window.clearInterval(distractionId)
  window.clearTimeout(typingId)
  runId += 1
  activeSounds.clear()
  for (const source of activeSources) {
    try {
      source.stop()
    } catch {
      // A source that has just ended is already stopped.
    }
  }
  activeSources.clear()
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
  stopDistractions()
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
    runId += 1
    startedAt = performance.now()
    lcd.classList.add('lcd--fading')
    message.textContent = ''
    buttonLabel.textContent = 'STOP'
    redButton.setAttribute('aria-label', 'Stop timer and reveal result')
    audioContext ??= new AudioContext()
    void audioContext.resume()
    render()
    startDistractions()
  } else if (state === 'running') {
    state = 'stopped'
    stoppedAt = performance.now() - startedAt
    cancelAnimationFrame(animationId)
    stopDistractions()
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
