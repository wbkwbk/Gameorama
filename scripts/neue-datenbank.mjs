import { existsSync, lstatSync, realpathSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listUsers, loginUser, openDatabase, saveUser } from '../server/db.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const USERS = [
  {
    username: 'superuser',
    password: 'superuser',
    name: 'Super Benutzer',
    role: 'super',
    comment: 'Super Benutzer. Darf Geräte, Gruppen, Wartungen und Benutzer verwalten.',
  },
  {
    username: 'user',
    password: 'user',
    name: 'Standard Benutzer',
    role: 'standard',
    comment: 'Standard Benutzer. Darf Wartungen als durchgeführt markieren.',
  },
]

function displayPath(filePath) {
  const relative = path.relative(root, filePath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return filePath
  return relative
}

function existingPath(filePath) {
  const resolved = path.resolve(filePath)
  try {
    return realpathSync(resolved)
  } catch {
    const parent = path.dirname(resolved)
    try {
      return path.join(realpathSync(parent), path.basename(resolved))
    } catch {
      return resolved
    }
  }
}

function uploadsDirectory() {
  const directory = path.resolve(root, 'data', 'uploads')
  try {
    return realpathSync(directory)
  } catch {
    return directory
  }
}

function assertOutsideUploads(filePath) {
  const candidate = existingPath(filePath)
  const uploads = uploadsDirectory()
  const relative = path.relative(uploads, candidate)
  const inside = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  if (inside) {
    throw new Error('Dateien in data/uploads werden nicht verändert.')
  }
}

function sqlitePaths(filePath) {
  return [filePath, `${filePath}-wal`, `${filePath}-shm`, `${filePath}-journal`]
}

function removeSqliteFile(filePath) {
  if (!existsSync(filePath)) return
  const stat = lstatSync(filePath)
  if (!stat.isFile()) {
    throw new Error(`${displayPath(filePath)} ist keine Datei und wurde nicht gelöscht.`)
  }
  unlinkSync(filePath)
}

function removeDatabaseFiles(filePath) {
  for (const candidate of sqlitePaths(filePath)) {
    assertOutsideUploads(candidate)
    removeSqliteFile(candidate)
  }
}

function parseArgs(argv) {
  let force = false
  const paths = []
  for (const arg of argv) {
    if (arg === '--force') {
      force = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log(`Legt data/gameorama.sqlite mit den Benutzern superuser und user an.

  node scripts/neue-datenbank.mjs [--force] [datenbankpfad]

Ohne --force bleibt eine vorhandene Datenbank unverändert.
--force ersetzt die SQLite-Datei einschließlich -wal und -shm.
data/uploads wird nicht gelöscht.`)
      process.exit(0)
    }
    if (arg.startsWith('-')) throw new Error(`Unbekannte Option: ${arg}`)
    paths.push(arg)
  }
  if (paths.length > 1) throw new Error('Es ist nur ein Datenbankpfad erlaubt.')
  const given = paths[0]
  const dbPath = given
    ? path.resolve(path.isAbsolute(given) ? given : path.join(root, given))
    : path.join(root, 'data', 'gameorama.sqlite')
  return { force, dbPath }
}

function leaveUnchanged(dbPath) {
  const shown = displayPath(dbPath)
  console.log(`Die Datenbank ${shown} ist bereits vorhanden und wurde nicht verändert.`)
  console.log(
    'Zum bewussten Anlegen einer neuen Datenbank die bestehende Datei zuerst verschieben oder das Skript mit --force starten.',
  )
  console.log(
    '--force ersetzt die SQLite-Datei einschließlich der Dateien -wal und -shm. Der Ordner data/uploads wird nicht gelöscht.',
  )
}

function createDatabase(dbPath) {
  let database
  try {
    database = openDatabase(dbPath, { seedDemoUsers: false })
    for (const user of USERS) saveUser(database, user)
    const rows = listUsers(database)
    if (rows.length !== USERS.length) throw new Error('Die Benutzer wurden nicht vollständig angelegt.')
    for (const user of USERS) {
      const session = loginUser(database, user.username, user.password)
      if (!session || session.role !== user.role) {
        throw new Error(`Der Benutzer ${user.username} konnte nicht geprüft werden.`)
      }
    }
    const unexpected = rows.filter((row) => !USERS.some((user) => user.username === row.username))
    if (unexpected.length > 0) throw new Error('Die Datenbank enthält weitere Benutzer.')
    database.close()
  } catch (error) {
    if (database) {
      try {
        database.close()
      } catch {
        // Die unvollständige Datei wird anschließend entfernt.
      }
    }
    try {
      removeDatabaseFiles(dbPath)
    } catch {
      // Die ursprüngliche Fehlermeldung bleibt maßgeblich.
    }
    throw error
  }
}

function main() {
  const { force, dbPath } = parseArgs(process.argv.slice(2))
  for (const candidate of sqlitePaths(dbPath)) assertOutsideUploads(candidate)

  if (existsSync(dbPath)) {
    const stat = lstatSync(dbPath)
    if (!stat.isFile()) {
      throw new Error(`${displayPath(dbPath)} ist keine Datei und wurde nicht verändert.`)
    }
    if (!force) {
      leaveUnchanged(dbPath)
      return
    }
    removeDatabaseFiles(dbPath)
  } else {
    for (const suffix of ['-wal', '-shm', '-journal']) removeSqliteFile(`${dbPath}${suffix}`)
  }

  createDatabase(dbPath)
  const shown = displayPath(dbPath)
  console.log(`Die Datenbank ${shown} wurde neu angelegt.`)
  console.log('Angelegte Benutzer: superuser (Super Benutzer), user (Standard Benutzer).')
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
