import { useEffect, useState } from 'react'

const STORAGE_KEY = 'injester-demo-key'

// The password isn't a secret — it's friction against casual abuse of our
// Nebius + Tavily + Playwright budget. Anyone with the password can demo.
const EXPECTED_KEY = import.meta.env.VITE_DEMO_KEY || 'injester'

export function getDemoKey() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEY) || ''
}

export default function PasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    if (getDemoKey() === EXPECTED_KEY) setUnlocked(true)
  }, [])

  if (unlocked) return children

  const submit = (e) => {
    e.preventDefault()
    if (input.trim().toLowerCase() === EXPECTED_KEY) {
      localStorage.setItem(STORAGE_KEY, EXPECTED_KEY)
      setUnlocked(true)
    } else {
      setError(true)
      setInput('')
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#050507',
        color: '#ececec',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: "Inter, -apple-system, system-ui, sans-serif",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          maxWidth: '420px',
          width: '100%',
          padding: '40px 32px',
          background: '#111114',
          border: '1px solid #1a1a1e',
          borderRadius: '16px',
          display: 'grid',
          gap: '16px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: '0.72rem',
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            color: '#00f2ff',
            fontWeight: 700,
          }}
        >
          Injester · Demo
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: '1.6rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          Password required.
        </h1>
        <p
          style={{
            margin: 0,
            color: '#888',
            fontSize: '0.92rem',
            lineHeight: 1.55,
          }}
        >
          The interactive demo calls live Nebius + Tavily APIs. Enter the
          workshop password to continue.
        </p>
        <input
          type="password"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setError(false)
          }}
          autoFocus
          placeholder="Password"
          style={{
            padding: '12px 14px',
            fontSize: '1rem',
            background: '#0a0a0b',
            border: `1px solid ${error ? '#ff4d4d' : '#1f1f24'}`,
            borderRadius: '10px',
            color: '#ececec',
            outline: 'none',
            textAlign: 'center',
            letterSpacing: '0.08em',
          }}
        />
        {error && (
          <div
            style={{
              color: '#ff4d4d',
              fontSize: '0.82rem',
              margin: '-6px 0',
            }}
          >
            Nope. Try again.
          </div>
        )}
        <button
          type="submit"
          style={{
            padding: '12px 14px',
            fontSize: '0.95rem',
            fontWeight: 600,
            background: '#00f2ff',
            color: '#050507',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          Unlock demo
        </button>
        <div
          style={{
            fontSize: '0.78rem',
            color: '#555',
            marginTop: '4px',
          }}
        >
          Don&apos;t have it? Email{' '}
          <a
            href="mailto:founders@injester.com"
            style={{ color: '#00f2ff', textDecoration: 'none' }}
          >
            founders@injester.com
          </a>
        </div>
      </form>
    </div>
  )
}
