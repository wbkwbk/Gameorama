import { useEffect, useState } from 'react'
import { documentHref, listDocuments } from './storage.js'

export function useDocuments(token) {
  const [documents, setDocuments] = useState(null)

  useEffect(() => {
    let active = true
    listDocuments(token)
      .then((rows) => {
        if (active) setDocuments(rows)
      })
      .catch(() => {
        if (active) setDocuments([])
      })
    return () => {
      active = false
    }
  }, [token])

  return documents
}

export default function DocumentLinks({ ownerId, documents, token }) {
  if (documents == null) return <span className="doc-empty">…</span>
  const mine = documents.filter((doc) => doc.ownerId === ownerId)
  if (mine.length === 0) return <span className="doc-empty">Keine Dokumente</span>
  return (
    <ul className="doc-list">
      {mine.map((doc) => (
        <li key={doc.id} className="doc-row">
          <a href={documentHref(doc.id, token)} target="_blank" rel="noopener noreferrer">
            {doc.originalName}
          </a>
        </li>
      ))}
    </ul>
  )
}
