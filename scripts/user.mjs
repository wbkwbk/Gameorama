import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deleteUser, listUsers, openDatabase, saveUser, setComment, setPassword } from '../server/db.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = process.env.GAMEORAMA_DB || path.join(root, 'data', 'gameorama.sqlite')
const [command, ...args] = process.argv.slice(2)

function flag(name) {
  const index = args.indexOf(`--${name}`)
  if (index === -1) return ''
  return args[index + 1] ?? ''
}

function usage() {
  console.log(`Benutzer in ${dbPath}

  npm run user -- list
  npm run user -- add <benutzer> <passwort> --name "Name" --role standard|super --comment "Notiz"
  npm run user -- passwd <benutzer> <neues-passwort>
  npm run user -- comment <benutzer> "Notiz"
  npm run user -- delete <benutzer>`)
}

const database = openDatabase(dbPath)

try {
  if (command === 'list') {
    for (const user of listUsers(database)) {
      console.log(`${user.username}\t${user.role}\t${user.name}\t${user.comment}`)
    }
  } else if (command === 'add') {
    saveUser(database, {
      username: args[0],
      password: args[1],
      name: flag('name'),
      role: flag('role') || 'standard',
      comment: flag('comment'),
    })
    console.log(`Benutzer ${args[0]} gespeichert`)
  } else if (command === 'passwd') {
    setPassword(database, args[0], args[1])
    console.log(`Passwort für ${args[0]} geändert`)
  } else if (command === 'comment') {
    setComment(database, args[0], args.slice(1).join(' '))
    console.log(`Kommentar für ${args[0]} gespeichert`)
  } else if (command === 'delete') {
    deleteUser(database, args[0])
    console.log(`Benutzer ${args[0]} gelöscht`)
  } else {
    usage()
    process.exitCode = command ? 1 : 0
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  database.close()
}
