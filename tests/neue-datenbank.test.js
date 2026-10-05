import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { loginUser, openDatabase } from '../server/db.js'
import { verifyPassword } from '../server/passwords.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(root, 'scripts', 'neue-datenbank.mjs')
const realDatabase = path.join(root, 'data', 'gameorama.sqlite')
const uploadsDirectory = path.join(root, 'data', 'uploads')

function run(args, cwd = root) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' })
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function uploadsSnapshot() {
  return readdirSync(uploadsDirectory).sort()
}

test('neue-datenbank creates only superuser and user', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gameorama-neue-'))
  const file = path.join(dir, 'gameorama.sqlite')
  const beforeUploads = uploadsSnapshot()
  const beforeReal = existsSync(realDatabase) ? sha256(realDatabase) : null
  try {
    const created = run([file], dir)
    assert.equal(created.status, 0, created.stderr)
    assert.match(created.stdout, /wurde neu angelegt/)
    assert.equal(created.stdout.includes('superuser') && created.stdout.includes('user'), true)
    assert.equal(created.stdout.includes('scrypt$'), false)

    const digest = sha256(file)
    const again = run([file], dir)
    assert.equal(again.status, 0, again.stderr)
    assert.match(again.stdout, /nicht verändert/)
    assert.match(again.stdout, /--force/)
    assert.equal(sha256(file), digest)
    assert.equal(existsSync(`${file}-wal`), false)
    assert.equal(existsSync(`${file}-shm`), false)

    const raw = new DatabaseSync(file)
    const users = raw.prepare('SELECT username, password_hash, name, role FROM users ORDER BY username').all()
    assert.deepEqual(
      users.map((row) => row.username),
      ['superuser', 'user'],
    )
    const superuser = users.find((row) => row.username === 'superuser')
    const standard = users.find((row) => row.username === 'user')
    assert.equal(superuser.role, 'super')
    assert.equal(standard.role, 'standard')
    assert.equal(superuser.password_hash.startsWith('scrypt$'), true)
    assert.equal(standard.password_hash.startsWith('scrypt$'), true)
    assert.equal(verifyPassword('superuser', superuser.password_hash), true)
    assert.equal(verifyPassword('user', standard.password_hash), true)
    assert.equal(verifyPassword('wartung', superuser.password_hash), false)
    assert.equal(verifyPassword('super', standard.password_hash), false)
    assert.equal(superuser.password_hash.includes('superuser'), false)
    assert.equal(standard.password_hash.includes('user'), false)
    const names = raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((row) => row.name)
    for (const table of [
      'groups',
      'devices',
      'maintenances',
      'documentation',
      'users',
      'sessions',
      'documents',
      'meta',
    ]) {
      assert.equal(names.includes(table), true, table)
    }
    raw.close()

    const database = openDatabase(file)
    assert.deepEqual(loginUser(database, 'superuser', 'superuser'), {
      username: 'superuser',
      name: 'Super Benutzer',
      role: 'super',
      comment: 'Super Benutzer. Darf Geräte, Gruppen, Wartungen und Benutzer verwalten.',
    })
    assert.deepEqual(loginUser(database, 'user', 'user'), {
      username: 'user',
      name: 'Standard Benutzer',
      role: 'standard',
      comment: 'Standard Benutzer. Darf Wartungen als durchgeführt markieren.',
    })
    assert.equal(loginUser(database, 'anna', 'wartung'), null)
    assert.equal(loginUser(database, 'admin', 'super'), null)
    assert.deepEqual(
      database.prepare('SELECT username FROM users ORDER BY username').all().map((row) => row.username),
      ['superuser', 'user'],
    )
    database.close()

    writeFileSync(file, 'alte-datenbank')
    writeFileSync(`${file}-wal`, 'alte-wal')
    writeFileSync(`${file}-shm`, 'alte-shm')
    const replaced = run(['--force', file], dir)
    assert.equal(replaced.status, 0, replaced.stderr)
    assert.equal(readFileSync(file, 'utf8').includes('alte-datenbank'), false)
    assert.equal(existsSync(`${file}-wal`) ? readFileSync(`${file}-wal`, 'utf8').includes('alte-wal') : false, false)
    assert.equal(existsSync(`${file}-shm`) ? readFileSync(`${file}-shm`, 'utf8').includes('alte-shm') : false, false)
    const afterForce = openDatabase(file, { seedDemoUsers: false })
    assert.deepEqual(
      afterForce
        .prepare('SELECT username, role FROM users ORDER BY username')
        .all()
        .map((row) => ({ username: row.username, role: row.role })),
      [
        { username: 'superuser', role: 'super' },
        { username: 'user', role: 'standard' },
      ],
    )
    assert.equal(loginUser(afterForce, 'superuser', 'superuser')?.role, 'super')
    assert.equal(loginUser(afterForce, 'user', 'user')?.role, 'standard')
    afterForce.close()

    const protectedFile = path.join(uploadsDirectory, 'neue-datenbank-test-ungueltig.sqlite')
    writeFileSync(protectedFile, 'KEEP-SQLITE')
    const refused = run(['--force', protectedFile], dir)
    assert.notEqual(refused.status, 0)
    assert.match(refused.stderr, /data\/uploads/)
    assert.equal(readFileSync(protectedFile, 'utf8'), 'KEEP-SQLITE')
    rmSync(protectedFile)

    assert.deepEqual(uploadsSnapshot(), beforeUploads)
    assert.equal(existsSync(realDatabase) ? sha256(realDatabase) : null, beforeReal)
  } finally {
    const leftover = path.join(uploadsDirectory, 'neue-datenbank-test-ungueltig.sqlite')
    if (existsSync(leftover)) rmSync(leftover)
    rmSync(dir, { recursive: true, force: true })
  }
})
