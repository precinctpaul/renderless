import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const relayScript = path.resolve(projectRoot, 'scripts', 'transport-relay.mjs')
const viteBin = path.resolve(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')

const childEnv = { ...process.env }

const relay = spawn(process.execPath, [relayScript], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: childEnv,
})

const vite = spawn(process.execPath, [viteBin], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: childEnv,
})

let shuttingDown = false

const shutdown = (signal) => {
  if (shuttingDown) {
    return
  }
  shuttingDown = true

  if (relay && !relay.killed) {
    relay.kill(signal)
  }

  if (vite && !vite.killed) {
    vite.kill(signal)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

relay.on('exit', (code, signal) => {
  if (shuttingDown) {
    return
  }

  if (code !== 0) {
    console.warn(`[RenderLess] transport relay exited (${code ?? signal}). Dev server will continue without relay.`)
  }
})

vite.on('exit', (code) => {
  shutdown('SIGTERM')
  process.exit(code ?? 0)
})
