import './App.css'

import { useMemo, useState } from 'react'

type MealLine = { id: string; label: string; amount: string }
type Family = { id: string; name: string; meals: MealLine[] }

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function parseMoney(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, '').trim()
  if (!cleaned) return 0
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

function money(n: number): string {
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100
  return rounded.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function App() {
  const [families, setFamilies] = useState<Family[]>(() =>
    Array.from({ length: 4 }, (_, i) => ({
      id: uid(),
      name: `Family #${i + 1}`,
      meals: [{ id: uid(), label: '', amount: '' }],
    })),
  )

  const [activeFamilyCount, setActiveFamilyCount] = useState(4)
  const [taxPercent, setTaxPercent] = useState('8.25')
  const [feesAmount, setFeesAmount] = useState('')
  const [tipPercent, setTipPercent] = useState('18')

  const activeFamilies = useMemo(
    () => families.slice(0, Math.min(Math.max(activeFamilyCount, 1), 4)),
    [families, activeFamilyCount],
  )

  const perFamily = useMemo(() => {
    const subtotals = activeFamilies.map((f) =>
      f.meals.reduce((sum, m) => sum + parseMoney(m.amount), 0),
    )
    const mealsTotal = subtotals.reduce((a, b) => a + b, 0)
    const tax = mealsTotal * (parseMoney(taxPercent) / 100)
    const tip = mealsTotal * (parseMoney(tipPercent) / 100)
    const fees = parseMoney(feesAmount)
    const shared = tax + tip + fees
    const shareEach = activeFamilies.length ? shared / activeFamilies.length : 0

    return {
      subtotals,
      mealsTotal,
      tax,
      tip,
      fees,
      shared,
      shareEach,
      grandTotal: mealsTotal + shared,
    }
  }, [activeFamilies, taxPercent, feesAmount, tipPercent])

  function updateFamilyName(familyId: string, name: string) {
    setFamilies((prev) => prev.map((f) => (f.id === familyId ? { ...f, name } : f)))
  }

  function addMealLine(familyId: string) {
    setFamilies((prev) =>
      prev.map((f) =>
        f.id === familyId ? { ...f, meals: [...f.meals, { id: uid(), label: '', amount: '' }] } : f,
      ),
    )
  }

  function removeMealLine(familyId: string, mealId: string) {
    setFamilies((prev) =>
      prev.map((f) => {
        if (f.id !== familyId) return f
        const nextMeals = f.meals.filter((m) => m.id !== mealId)
        return { ...f, meals: nextMeals.length ? nextMeals : [{ id: uid(), label: '', amount: '' }] }
      }),
    )
  }

  function updateMealLine(
    familyId: string,
    mealId: string,
    patch: Partial<Pick<MealLine, 'label' | 'amount'>>,
  ) {
    setFamilies((prev) =>
      prev.map((f) => {
        if (f.id !== familyId) return f
        return {
          ...f,
          meals: f.meals.map((m) => (m.id === mealId ? { ...m, ...patch } : m)),
        }
      }),
    )
  }

  function clearAll() {
    setFamilies((prev) =>
      prev.map((f, idx) => ({
        ...f,
        name: `Family #${idx + 1}`,
        meals: [{ id: uid(), label: '', amount: '' }],
      })),
    )
    setTaxPercent('8.25')
    setTipPercent('18')
    setFeesAmount('')
    setActiveFamilyCount(4)
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Restaurant Bill Split</h1>
          <p className="subtle">
            Enter each family’s items and prices. Tax, fees, and tip are shared evenly across the active
            families.
          </p>
        </div>
        <div className="headerActions">
          <button className="secondary" onClick={clearAll} type="button">
            Clear
          </button>
        </div>
      </header>

      <section className="settings card">
        <div className="field">
          <label>Families</label>
          <select
            value={activeFamilyCount}
            onChange={(e) => setActiveFamilyCount(Number(e.target.value))}
          >
            <option value={1}>1 family</option>
            <option value={2}>2 families</option>
            <option value={3}>3 families</option>
            <option value={4}>4 families</option>
          </select>
        </div>
        <div className="field">
          <label>Tax %</label>
          <input inputMode="decimal" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
        </div>
        <div className="field">
          <label>Fees $</label>
          <input inputMode="decimal" value={feesAmount} onChange={(e) => setFeesAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Tip %</label>
          <input inputMode="decimal" value={tipPercent} onChange={(e) => setTipPercent(e.target.value)} />
        </div>
      </section>

      <main className="grid">
        {activeFamilies.map((family, idx) => {
          const subtotal = perFamily.subtotals[idx] ?? 0
          const share = perFamily.shareEach
          return (
            <section key={family.id} className="card family">
              <div className="familyHeader">
                <input
                  className="familyName"
                  value={family.name}
                  onChange={(e) => updateFamilyName(family.id, e.target.value)}
                />
                <div className="familyTotals">
                  <div className="kv">
                    <div className="k">Meals</div>
                    <div className="v">{money(subtotal)}</div>
                  </div>
                  <div className="kv">
                    <div className="k">Shared</div>
                    <div className="v">{money(share)}</div>
                  </div>
                  <div className="kv big">
                    <div className="k">Grand total</div>
                    <div className="v">{money(subtotal + share)}</div>
                  </div>
                </div>
              </div>

              <div className="table">
                <div className="thead">
                  <div>Item</div>
                  <div className="amount">Price</div>
                  <div className="actions" />
                </div>
                {family.meals.map((meal) => (
                  <div className="row" key={meal.id}>
                    <input
                      placeholder="e.g. Burger + fries"
                      value={meal.label}
                      onChange={(e) => updateMealLine(family.id, meal.id, { label: e.target.value })}
                    />
                    <input
                      className="amount"
                      placeholder="0.00"
                      inputMode="decimal"
                      value={meal.amount}
                      onChange={(e) => updateMealLine(family.id, meal.id, { amount: e.target.value })}
                    />
                    <button
                      className="iconButton"
                      type="button"
                      onClick={() => removeMealLine(family.id, meal.id)}
                      aria-label="Remove item"
                      title="Remove item"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="familyFooter">
                <button className="primary" type="button" onClick={() => addMealLine(family.id)}>
                  + Add item
                </button>
              </div>
            </section>
          )
        })}
      </main>

      <aside className="summary card">
        <h2>Summary</h2>
        <div className="summaryGrid">
          <div className="kv">
            <div className="k">Meals total</div>
            <div className="v">{money(perFamily.mealsTotal)}</div>
          </div>
          <div className="kv">
            <div className="k">Tax</div>
            <div className="v">{money(perFamily.tax)}</div>
          </div>
          <div className="kv">
            <div className="k">Fees</div>
            <div className="v">{money(perFamily.fees)}</div>
          </div>
          <div className="kv">
            <div className="k">Tip</div>
            <div className="v">{money(perFamily.tip)}</div>
          </div>
          <div className="kv big">
            <div className="k">Grand total</div>
            <div className="v">{money(perFamily.grandTotal)}</div>
          </div>
          <div className="kv">
            <div className="k">Shared per family</div>
            <div className="v">{money(perFamily.shareEach)}</div>
          </div>
        </div>
        <p className="subtle small">
          Note: shared = tax + fees + tip, split evenly across the selected families.
        </p>
      </aside>
    </div>
  )
}

export default App
