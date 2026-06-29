import { useState, useMemo, useEffect } from 'react'
import { generateRawClaims } from './data/generateRawClaims'
import './App.css'

import { TableVirtuoso } from 'react-virtuoso';
import { normalizeClaim } from './data/normalize';

// Generate the dataset once, outside the component, so it isn't rebuilt on every render.
const ALL_CLAIMS = generateRawClaims().map(normalizeClaim);

const currency = (n) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

function App() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // Debounce: copy `query` into `debouncedQuery` only after the user pauses
  // typing for 300ms. The cleanup cancels the pending timer on each keystroke,
  // so the expensive filter below runs once per pause, not once per character.
  useEffect(() => {
    const sto = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)

    return () => clearTimeout(sto)
  }, [query])

  // Memoized filtering: only recomputes when `debouncedQuery` changes, not on
  // every render. The input stays driven by `query` for instant responsiveness.
  const filtered = useMemo(
    () =>
      ALL_CLAIMS.filter((c) => {
        if (!debouncedQuery) return true
        const q = debouncedQuery.toLowerCase()
        return (
          c.id.toLowerCase().includes(q) ||
          c.policyNumber.toLowerCase().includes(q) ||
          c.lineOfBusiness.toLowerCase().includes(q) ||
          c.state.toLowerCase().includes(q) ||
          c.claimStatus.toLowerCase().includes(q)
        )
      }),
    [debouncedQuery]
  )

  return (
    <div className="app">
      <header className="app__header">
        <h1>Actuarial Data Explorer</h1>
        <p className="muted">
          {ALL_CLAIMS.length.toLocaleString()} claims loaded ·{' '}
          {filtered.length.toLocaleString()} shown
        </p>
      </header>

      <div className="toolbar">
        <input
          className="search"
          type="text"
          placeholder="Filter by claim id, policy, line of business, state…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="table-wrap">
        <TableVirtuoso
        className="grid"
          style={{height: 600}}
          data={filtered}
          fixedHeaderContent={() => (
            <tr>
              <th>Claim ID</th>
              <th>Policy</th>
              <th>Line of Business</th>
              <th>State</th>
              <th>Accident Yr</th>
              <th>Dev Lag</th>
              <th className="num">Earned Premium</th>
              <th className="num">Paid Loss</th>
              <th className="num">Reserve</th>
              <th className="num">Incurred Loss</th>
              <th>Status</th>
            </tr>)
          }
          itemContent={(i, c) => (
            <>
                <td>{c.id}</td>
                <td>{c.policyNumber}</td>
                <td>{c.lineOfBusiness}</td>
                <td>{c.state}</td>
                <td>{c.accidentYear}</td>
                <td>{c.developmentLag}</td>
                <td className="num">{currency(c.earnedPremium)}</td>
                <td className="num">{currency(c.paidLoss)}</td>
                <td className="num">{currency(c.reserve)}</td>
                <td className="num">{currency(c.incurredLoss)}</td>
                <td>{c.claimStatus}</td>
            </>
          )}

        />        
      </div>
    </div>
  )
}

export default App
