import { useState } from 'react'
import { generateClaims } from './data/generateClaims'
import './App.css'

// Generate the dataset once, outside the component, so it isn't rebuilt on every render.
const ALL_CLAIMS = generateClaims(50000)

const currency = (n) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

function App() {
  const [query, setQuery] = useState('')

  // NAIVE on purpose: this re-filters 50k rows on every keystroke (no debounce,
  // no memoization) AND renders every matching row as a real DOM node.
  // Phase 2 will fix all of this. Type in the box and watch it lag.
  const filtered = ALL_CLAIMS.filter((c) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      c.id.toLowerCase().includes(q) ||
      c.policyNumber.toLowerCase().includes(q) ||
      c.lineOfBusiness.toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q)
    )
  })

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
        <table className="grid">
          <thead>
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
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default App
