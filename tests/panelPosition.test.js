import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clampPanelPosition,
  layoutPanelPositions,
  readPanelPosition,
  viewportHostWidth,
  writePanelPosition,
} from '../src/panelPosition.js'

function memory() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  }
}

test('viewport host width is the space to the right of the stage', () => {
  assert.equal(viewportHostWidth(64, 1280), 1216)
  assert.equal(viewportHostWidth(-20, 800), 800)
  assert.equal(viewportHostWidth(900, 800), 0)
})

test('clamp keeps a panel inside the host with a visible strip', () => {
  assert.deepEqual(clampPanelPosition(-30, -12, { width: 320, hostWidth: 900 }), { x: 0, y: 0 })
  assert.deepEqual(clampPanelPosition(2000, 40, { width: 320, hostWidth: 900 }), { x: 836, y: 40 })
  assert.deepEqual(clampPanelPosition(10, 50000, { width: 200, hostWidth: 600, maxY: 1500 }), { x: 10, y: 1500 })
  assert.deepEqual(clampPanelPosition(Number.NaN, Number.NaN, { width: 100, hostWidth: 400 }), { x: 0, y: 0 })
})

test('a panel narrower than the visible strip stays fully in the host', () => {
  assert.deepEqual(clampPanelPosition(500, 0, { width: 40, hostWidth: 300, visible: 64 }), { x: 260, y: 0 })
  assert.deepEqual(clampPanelPosition(80, 0, { width: 400, hostWidth: 50, visible: 64 }), { x: 0, y: 0 })
})

test('panel positions persist per key', () => {
  const store = memory()
  writePanelPosition('group-list:g-arcade', { x: 24, y: 180 }, store)
  writePanelPosition('device-list:d-flipper', { x: 8, y: 40 }, store)
  assert.deepEqual(readPanelPosition('group-list:g-arcade', store), { x: 24, y: 180 })
  assert.deepEqual(readPanelPosition('device-list:d-flipper', store), { x: 8, y: 40 })
  assert.equal(readPanelPosition('missing', store), null)
  writePanelPosition('group-list:g-arcade', { x: Number.NaN, y: 1 }, store)
  assert.deepEqual(readPanelPosition('group-list:g-arcade', store), { x: 24, y: 180 })
})

test('broken panel positions are ignored', () => {
  const store = memory()
  store.setItem('gameorama-panel-pos:bad', '{')
  store.setItem('gameorama-panel-pos:empty', 'null')
  store.setItem('gameorama-panel-pos:partial', JSON.stringify({ x: 12 }))
  store.setItem('gameorama-panel-pos:text', JSON.stringify({ x: '12', y: 4 }))
  assert.equal(readPanelPosition('bad', store), null)
  assert.equal(readPanelPosition('empty', store), null)
  assert.equal(readPanelPosition('partial', store), null)
  assert.equal(readPanelPosition('text', store), null)
})

test('unpinned panels stack from the top and stored panels keep their place', () => {
  const stacked = layoutPanelPositions([
    { key: 'a', width: 400, height: 100, stored: null, live: null },
    { key: 'b', width: 400, height: 80, stored: null, live: null },
  ], { hostWidth: 800, gap: 16 })
  assert.deepEqual(stacked.positions, [
    { key: 'a', x: 0, y: 0, pinned: false },
    { key: 'b', x: 0, y: 116, pinned: false },
  ])
  assert.equal(stacked.height, 196)

  const mixed = layoutPanelPositions([
    { key: 'a', width: 400, height: 100, stored: { x: 30, y: 240 }, live: null },
    { key: 'b', width: 400, height: 50, stored: null, live: null },
  ], { hostWidth: 800, gap: 16 })
  assert.deepEqual(mixed.positions[0], { key: 'a', x: 30, y: 240, pinned: true })
  assert.deepEqual(mixed.positions[1], { key: 'b', x: 0, y: 356, pinned: false })
  assert.equal(mixed.height, 406)
})

test('a pinned live position wins over the stored one and is clamped', () => {
  const layout = layoutPanelPositions([
    {
      key: 'list',
      width: 300,
      height: 120,
      stored: { x: 0, y: 0 },
      live: { x: 900, y: -20, pinned: true },
    },
  ], { hostWidth: 500, gap: 16 })
  assert.deepEqual(layout.positions, [
    { key: 'list', x: 436, y: 0, pinned: true },
  ])
})
