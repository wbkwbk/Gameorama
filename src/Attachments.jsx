import { useState } from 'react'
import { deleteDocumentRequest, documentHref, uploadDocument } from './storage.js'

export default function Attachments({ ownerId, documents, token, isSuper, onChange }) {
  const mine = documents.filter((doc) => doc.ownerId === ownerId)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await uploadDocument(token, ownerId, file)
      await onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dokument konnte nicht hochgeladen werden.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id) {
    setError(null)
    try {
      await deleteDocumentRequest(token, id)
      await onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dokument konnte nicht gelöscht werden.')
    }
  }

  if (!isSuper && mine.length === 0) return null

  return (
    <div className="attachments">
      {mine.length > 0 && (
        <ul className="doc-list">
          {mine.map((doc) => (
            <li key={doc.id} className="doc-row">
              <a href={documentHref(doc.id, token)} target="_blank" rel="noopener noreferrer">
                {doc.originalName}
              </a>
              {isSuper && (
                <button type="button" className="btn tiny danger" onClick={() => remove(doc.id)}>
                  Löschen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isSuper && (
        <label className="upload-row">
          Dokument hinzufügen
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xlsx"
            onChange={upload}
            disabled={busy}
          />
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
