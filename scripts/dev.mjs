import { spawn } from 'node:child_process'
import process from 'node:process'

const children = [
  spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', '5173'], {
    stdio: 'inherit',
  }),
]

let stopping = false

function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(code), 50)
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (stopping) return
    shutdown(signal ? 0 : code ?? 0)
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
