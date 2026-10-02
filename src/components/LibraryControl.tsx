import { useEffect, useState } from 'react'
import { Cloud, CloudOff } from 'lucide-react'
import { startLibrarySync, syncLibraryNow, useLibraryStatus, type LibraryStatus } from '../lib/librarySync'
import {
  getLibraryAuthor,
  getLibraryPassphrase,
  library,
  LibraryError,
  setLibraryAuthor,
  setLibraryPassphrase,
} from '../lib/sharedLibrary'

const STATUS_LABEL: Record<LibraryStatus, string> = {
  off: 'LIBRARY: CONNECT',
  syncing: 'LIBRARY: SYNCING',
  synced: 'LIBRARY: SYNCED',
  offline: 'LIBRARY: OFFLINE',
  locked: 'LIBRARY: LOCKED',
  unavailable: 'LIBRARY: NOT SET UP',
  error: 'LIBRARY: ERROR',
}

/** Header chip for the shared team library: shows sync status, opens the passphrase dialog. */
export function LibraryControl() {
  const { status, message, lastSyncedAt } = useLibraryStatus()
  const [open, setOpen] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [author, setAuthor] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    startLibrarySync()
  }, [])

  const openDialog = () => {
    setPassphrase(getLibraryPassphrase())
    setAuthor(getLibraryAuthor())
    setFeedback('')
    setOpen(true)
  }

  const connect = async () => {
    if (!passphrase.trim() || !author.trim()) {
      setFeedback('Enter the team passphrase and your name.')
      return
    }
    setBusy(true)
    try {
      await library.ping(passphrase.trim())
      setLibraryPassphrase(passphrase)
      setLibraryAuthor(author)
      setOpen(false)
      void syncLibraryNow()
    } catch (error) {
      setFeedback(error instanceof LibraryError ? error.message : 'Could not connect.')
    } finally {
      setBusy(false)
    }
  }

  const connected = status === 'synced' || status === 'syncing'
  return (
    <>
      <button
        type="button"
        className={`badge library-chip library-chip--${status}`}
        aria-label={STATUS_LABEL[status]}
        title={`${message}${lastSyncedAt ? ` Last sync ${new Date(lastSyncedAt).toLocaleTimeString()}.` : ''}`}
        onClick={openDialog}
      >
        {connected ? <Cloud size={13} /> : <CloudOff size={13} />}
        <span className="library-chip__text">{STATUS_LABEL[status]}</span>
      </button>

      {open ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <form
            className="modal"
            role="dialog"
            aria-label="Team library"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false)
            }}
            onSubmit={(event) => {
              event.preventDefault()
              void connect()
            }}
          >
            <div className="panel-title">Team Library</div>
            <p className="panel-subtitle">
              Custom templates, media and fonts are shared with everyone who has the team passphrase. Each browser asks once.
            </p>
            <label className="field-label">
              Team passphrase
              <input type="password" autoFocus autoComplete="off" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
            </label>
            <label className="field-label">
              Your name (shown on changes and versions)
              <input value={author} placeholder="e.g. Paul" onChange={(event) => setAuthor(event.target.value)} />
            </label>
            {feedback || (status !== 'off' && message) ? <div className="library-dialog__message mono">{feedback || message}</div> : null}
            <div className="new-template-dialog__actions">
              {getLibraryPassphrase() ? (
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  onClick={() => {
                    setLibraryPassphrase('')
                    setOpen(false)
                    void syncLibraryNow()
                  }}
                >
                  Disconnect this browser
                </button>
              ) : null}
              <button type="button" className="btn btn--small btn--ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--small btn--accent" disabled={busy}>
                {busy ? 'Checking…' : 'Connect'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  )
}
