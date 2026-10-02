import { useState } from 'react'

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)

  async function submit(event) {
    event.preventDefault()
    const message = await onLogin(username, password)
    setError(message)
  }

  return (
    <div className="login-page">
      <section className="login-hero">
        <p className="eyebrow">Spielhalle</p>
        <h1>Gameorama</h1>
        <p className="hero-lead">Wartungstool für Geräte, Termine und Dokumentation.</p>
        <ul className="legend">
          <li><i className="swatch ok" /> Nächste Wartung</li>
          <li><i className="swatch soon" /> In 1 Woche fällig</li>
          <li><i className="swatch overdue" /> Überfällig</li>
        </ul>
      </section>

      <section className="login-card">
        <h2>Anmelden</h2>
        <p className="muted">
          Standard Benutzer markieren Wartungen als durchgeführt. Super Benutzer verwalten Geräte, Wartungen und Benutzer.
        </p>
        <form onSubmit={submit}>
          <label>
            Benutzername
            <input
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            Passwort
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn primary">Anmelden</button>
        </form>
        <div className="demo-accounts">
          <p>Demozugänge</p>
          <ul>
            <li><code>anna</code> / <code>wartung</code> — Standard Benutzer</li>
            <li><code>admin</code> / <code>super</code> — Super Benutzer</li>
          </ul>
        </div>
      </section>
    </div>
  )
}
