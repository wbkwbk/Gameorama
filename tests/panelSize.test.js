import assert from 'node:assert/strict'
import test from 'node:test'
import { boundsForRect, clampSize, readPanelSize, writePanelSize } from '../src/panelSize.js'

function memory() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  }
}

test('width stays inside the viewport and a readable minimum', () => {
  assert.deepEqual(boundsForRect(80, 1400), { min: 280, max: 1308 })
  const narrow = boundsForRect(16, 320)
  assert.equal(narrow.max, 292)
  assert.equal(narrow.min, 280)
  assert.ok(narrow.min <= narrow.max)
  const tiny = boundsForRect(40, 180)
  assert.equal(tiny.max, tiny.min)
  assert.ok(tiny.max <= 180)
})

test('clamp keeps a size between min and max', () => {
  assert.equal(clampSize(10, 280, 800), 280)
  assert.equal(clampSize(900, 280, 800), 800)
  assert.equal(clampSize(400, 280, 800), 400)
})

test('panel sizes persist per key without dropping the other axis', () => {
  const store = memory()
  writePanelSize('group-list:g-arcade', { width: 640 }, store)
  writePanelSize('group-list:g-arcade', { height: 220 }, store)
  assert.deepEqual(readPanelSize('group-list:g-arcade', store), { width: 640, height: 220 })
  writePanelSize('device-notes:d-flipper', { width: 480 }, store)
  assert.deepEqual(readPanelSize('group-list:g-arcade', store), { width: 640, height: 220 })
  assert.deepEqual(readPanelSize('missing', store), {})
})

test('broken panel-size values are ignored', () => {
  const store = memory()
  store.setItem('gameorama-panel-size:bad', '{')
  store.setItem('gameorama-panel-size:empty', 'null')
  store.setItem('gameorama-panel-size:partial', JSON.stringify({ width: 'wide', height: 180 }))
  assert.deepEqual(readPanelSize('bad', store), {})
  assert.deepEqual(readPanelSize('empty', store), {})
  assert.deepEqual(readPanelSize('partial', store), { height: 180 })
})
