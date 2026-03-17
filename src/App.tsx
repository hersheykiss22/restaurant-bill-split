import './App.css'

import { useMemo, useState } from 'react'
import Tesseract from 'tesseract.js'

type MealLine = { id: string; label: string; amount: string }
type Family = { id: string; name: string; meals: MealLine[] }
type TipMode = 'amount' | 'percent'
type AppMode = 'manual' | 'upload'
type ReceiptItem = { id: string; label: string; amount: string; familyIndex: number | null }

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
    Array.from({ length: 6 }, (_, i) => ({
      id: uid(),
      name: `Family #${i + 1}`,
      meals: [{ id: uid(), label: '', amount: '' }],
    })),
  )

  const [mode, setMode] = useState<AppMode>('manual')
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null)
  const [ocrStatus, setOcrStatus] = useState<{ stage: 'idle' | 'running' | 'done' | 'error'; progress: number; message?: string }>({
    stage: 'idle',
    progress: 0,
  })
  const [ocrText, setOcrText] = useState('')
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([])

  const [activeFamilyCount, setActiveFamilyCount] = useState(4)
  const [useReceiptTotals, setUseReceiptTotals] = useState(true)
  const [receiptMealsTotal, setReceiptMealsTotal] = useState('')
  const [receiptGrandTotal, setReceiptGrandTotal] = useState('')
  const [taxAmount, setTaxAmount] = useState('')
  const [feesAmount, setFeesAmount] = useState('')
  const [tipAmount, setTipAmount] = useState('')
  const [tipMode, setTipMode] = useState<TipMode>('percent')
  const [tipPercent, setTipPercent] = useState('18')

  const activeFamilies = useMemo(
    () => families.slice(0, Math.min(Math.max(activeFamilyCount, 1), 6)),
    [families, activeFamilyCount],
  )

  const perFamily = useMemo(() => {
    const subtotals = activeFamilies.map((f) =>
      f.meals.reduce((sum, m) => sum + parseMoney(m.amount), 0),
    )
    const mealsTotalFromFamilies = subtotals.reduce((a, b) => a + b, 0)
    const mealsTotal = useReceiptTotals
      ? parseMoney(receiptMealsTotal) || mealsTotalFromFamilies
      : mealsTotalFromFamilies
    const tax = parseMoney(taxAmount)
    const tip = tipMode === 'percent' ? mealsTotal * (parseMoney(tipPercent) / 100) : parseMoney(tipAmount)
    const fees = parseMoney(feesAmount)
    const shared = tax + tip + fees
    const shareEach = activeFamilies.length ? shared / activeFamilies.length : 0

    return {
      subtotals,
      mealsTotalFromFamilies,
      mealsTotal,
      tax,
      tip,
      fees,
      shared,
      shareEach,
      grandTotal: mealsTotal + shared,
    }
  }, [activeFamilies, taxAmount, feesAmount, tipAmount, tipMode, tipPercent, receiptMealsTotal, useReceiptTotals])

  const receiptCheck = useMemo(() => {
    const entered = parseMoney(receiptGrandTotal)
    if (entered <= 0) return { entered: 0, hasEntered: false, diff: 0, matches: false }
    const diff = perFamily.grandTotal - entered
    const matches = Math.abs(diff) < 0.01
    return { entered, hasEntered: true, diff, matches }
  }, [perFamily.grandTotal, receiptGrandTotal])

  const receiptSubtotalFromItems = useMemo(() => {
    return receiptItems.reduce((sum, it) => sum + parseMoney(it.amount), 0)
  }, [receiptItems])

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
    setUseReceiptTotals(true)
    setReceiptMealsTotal('')
    setReceiptGrandTotal('')
    setTaxAmount('')
    setTipAmount('')
    setTipMode('percent')
    setTipPercent('18')
    setFeesAmount('')
    setActiveFamilyCount(4)
    setMode('manual')
    setReceiptImageUrl(null)
    setOcrStatus({ stage: 'idle', progress: 0 })
    setOcrText('')
    setReceiptItems([])
  }

  function printReceipt() {
    window.print()
  }

  function parseReceiptItemsFromText(text: string): ReceiptItem[] {
    const lines = text
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean)

    const items: ReceiptItem[] = []
    for (const line of lines) {
      const m = line.match(/(-?\d{1,6}(?:[.,]\d{2})?)\s*$/)
      if (!m) continue
      const amountRaw = m[1].replace(',', '.')
      const amount = parseMoney(amountRaw)
      if (amount <= 0) continue
      if (amount > 1000) continue
      const label = line.slice(0, m.index).trim() || 'Item'
      items.push({ id: uid(), label, amount: amount.toFixed(2), familyIndex: null })
    }
    return items
  }

  async function onUploadReceipt(file: File) {
    const nextUrl = URL.createObjectURL(file)
    setReceiptImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return nextUrl
    })

    setOcrStatus({ stage: 'running', progress: 0 })
    setOcrText('')
    setReceiptItems([])

    try {
      const result = await Tesseract.recognize(file, 'eng', {
        logger: (m) => {
          if (typeof m?.progress === 'number') {
            setOcrStatus({ stage: 'running', progress: m.progress, message: m.status })
          } else if (typeof m?.status === 'string') {
            setOcrStatus((prev) => ({ ...prev, message: m.status }))
          }
        },
      })
      const text = result?.data?.text ?? ''
      setOcrText(text)
      const items = parseReceiptItemsFromText(text)
      setReceiptItems(items)
      setOcrStatus({ stage: 'done', progress: 1 })

      const subtotal = items.reduce((sum, it) => sum + parseMoney(it.amount), 0)
      if (!receiptMealsTotal) {
        setUseReceiptTotals(true)
        setReceiptMealsTotal(subtotal ? subtotal.toFixed(2) : '')
      }
    } catch (e) {
      setOcrStatus({ stage: 'error', progress: 0, message: e instanceof Error ? e.message : 'OCR failed' })
    }
  }

  function applyReceiptItemsToFamilies() {
    const assigned = receiptItems.filter((it) => typeof it.familyIndex === 'number')
    if (!assigned.length) return

    setFamilies((prev) => {
      const next = [...prev]
      for (let fi = 0; fi < 6; fi++) {
        const lines = assigned
          .filter((it) => it.familyIndex === fi)
          .map((it) => ({ id: uid(), label: it.label, amount: it.amount }))
        if (!lines.length) continue
        next[fi] = { ...next[fi], meals: lines }
      }
      return next
    })

    const maxAssigned = Math.max(...assigned.map((it) => it.familyIndex ?? 0))
    setActiveFamilyCount((c) => Math.max(c, maxAssigned + 1))
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
          <div className="modeToggle" role="group" aria-label="Mode">
            <button
              type="button"
              className={mode === 'manual' ? 'primary' : 'secondary'}
              onClick={() => setMode('manual')}
            >
              Manual
            </button>
            <button
              type="button"
              className={mode === 'upload' ? 'primary' : 'secondary'}
              onClick={() => setMode('upload')}
            >
              Upload receipt
            </button>
          </div>
          <button className="secondary" onClick={printReceipt} type="button">
            Print / Save PDF
          </button>
          <button className="secondary" onClick={clearAll} type="button">
            Clear
          </button>
        </div>
      </header>

      {mode === 'upload' && (
        <section className="upload card">
          <div className="uploadHeader">
            <h2>Upload receipt photo</h2>
            <div className="subtle small">
              Tip: take a straight, well-lit photo. You can edit items after it reads.
            </div>
          </div>

          <div className="uploadGrid">
            <div className="uploadLeft">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void onUploadReceipt(f)
                }}
              />

              {receiptImageUrl && (
                <div className="previewWrap">
                  <img className="preview" src={receiptImageUrl} alt="Receipt preview" />
                </div>
              )}

              {ocrStatus.stage === 'running' && (
                <div className="ocrProgress">
                  <div className="ocrRow">
                    <div className="k">Reading…</div>
                    <div className="v">{Math.round(ocrStatus.progress * 100)}%</div>
                  </div>
                  <div className="bar">
                    <div className="fill" style={{ width: `${Math.round(ocrStatus.progress * 100)}%` }} />
                  </div>
                  {ocrStatus.message && <div className="subtle small">{ocrStatus.message}</div>}
                </div>
              )}

              {ocrStatus.stage === 'error' && (
                <div className="ocrError">
                  <strong>Couldn’t read receipt.</strong> {ocrStatus.message}
                </div>
              )}
            </div>

            <div className="uploadRight">
              <div className="uploadActions">
                <div className="subtle small">
                  Detected items: <strong>{receiptItems.length}</strong> · Subtotal: <strong>{money(receiptSubtotalFromItems)}</strong>
                </div>
                <button className="primary" type="button" onClick={applyReceiptItemsToFamilies} disabled={!receiptItems.length}>
                  Apply to families
                </button>
              </div>

              {receiptItems.length ? (
                <div className="itemsTable">
                  <div className="itemsHead">
                    <div>Item</div>
                    <div className="amount">Price</div>
                    <div>Family</div>
                    <div />
                  </div>
                  {receiptItems.map((it) => (
                    <div className="itemsRow" key={it.id}>
                      <input
                        value={it.label}
                        onChange={(e) =>
                          setReceiptItems((prev) =>
                            prev.map((x) => (x.id === it.id ? { ...x, label: e.target.value } : x)),
                          )
                        }
                      />
                      <input
                        className="amount"
                        inputMode="decimal"
                        value={it.amount}
                        onChange={(e) =>
                          setReceiptItems((prev) =>
                            prev.map((x) => (x.id === it.id ? { ...x, amount: e.target.value } : x)),
                          )
                        }
                      />
                      <select
                        value={it.familyIndex ?? ''}
                        onChange={(e) => {
                          const v = e.target.value === '' ? null : Number(e.target.value)
                          setReceiptItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, familyIndex: v } : x)))
                        }}
                      >
                        <option value="">Unassigned</option>
                        {Array.from({ length: 6 }, (_, i) => (
                          <option key={i} value={i}>
                            {activeFamilies[i]?.name ?? `Family #${i + 1}`}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="iconButton"
                        aria-label="Remove detected item"
                        title="Remove"
                        onClick={() => setReceiptItems((prev) => prev.filter((x) => x.id !== it.id))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="subtle small">Upload a receipt to see detected items here.</div>
              )}

              {!!ocrText && (
                <details className="rawText">
                  <summary>Show raw OCR text</summary>
                  <pre>{ocrText}</pre>
                </details>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="receiptTop card">
        <div className="receiptTopHeader">
          <h2>Receipt totals (type what’s on the receipt)</h2>
          <label className="toggle">
            <input
              type="checkbox"
              checked={useReceiptTotals}
              onChange={(e) => setUseReceiptTotals(e.target.checked)}
            />
            <span>Use receipt meals total</span>
          </label>
        </div>
        <div className="receiptTopGrid">
          <div className="field">
            <label>Grand total $</label>
            <input
              inputMode="decimal"
              value={receiptGrandTotal}
              onChange={(e) => setReceiptGrandTotal(e.target.value)}
              placeholder={money(perFamily.grandTotal).replace('$', '')}
            />
          </div>
          <div className="field">
            <label>Subtotal $</label>
            <input
              inputMode="decimal"
              value={receiptMealsTotal}
              onChange={(e) => setReceiptMealsTotal(e.target.value)}
              placeholder={money(perFamily.mealsTotalFromFamilies).replace('$', '')}
              disabled={!useReceiptTotals}
            />
          </div>
          <div className="field">
            <label>Tax $</label>
            <input inputMode="decimal" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} />
          </div>
          <div className="field">
            <label>Fees $</label>
            <input inputMode="decimal" value={feesAmount} onChange={(e) => setFeesAmount(e.target.value)} />
          </div>
          <div className="field">
            <label>Tip</label>
            <div className="tipControls">
              <select value={tipMode} onChange={(e) => setTipMode(e.target.value as TipMode)}>
                <option value="percent">Percent</option>
                <option value="amount">Amount ($)</option>
              </select>
              {tipMode === 'percent' ? (
                <select value={tipPercent} onChange={(e) => setTipPercent(e.target.value)}>
                  <option value="15">15%</option>
                  <option value="18">18%</option>
                  <option value="20">20%</option>
                </select>
              ) : (
                <input
                  inputMode="decimal"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  placeholder="0.00"
                />
              )}
            </div>
          </div>
        </div>
        {receiptCheck.hasEntered && (
          <div className={`receiptCheck ${receiptCheck.matches ? 'ok' : 'bad'}`}>
            <div className="receiptCheckTitle">
              {receiptCheck.matches ? 'Matches receipt' : 'Does not match receipt'}
            </div>
            <div className="receiptCheckMeta">
              <div>
                Calculated: <strong>{money(perFamily.grandTotal)}</strong>
              </div>
              <div>
                Receipt: <strong>{money(receiptCheck.entered)}</strong>
              </div>
              <div>
                Difference: <strong>{money(receiptCheck.diff)}</strong>
              </div>
            </div>
          </div>
        )}
        {useReceiptTotals && parseMoney(receiptMealsTotal) > 0 && (
          <p className="subtle small">
            Heads up: sum of family subtotals is {money(perFamily.mealsTotalFromFamilies)} but receipt subtotal is{' '}
            {money(perFamily.mealsTotal)}.
          </p>
        )}
      </section>

      <section className="topTotal card">
        <div className="topTotalInner">
          <div>
            <div className="topTotalLabel">Grand total</div>
            <div className="topTotalValue">{money(perFamily.grandTotal)}</div>
          </div>
          <div className="topTotalMeta">
            <div className="kv">
              <div className="k">Subtotal</div>
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
          </div>
        </div>
      </section>

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
            <option value={5}>5 families</option>
            <option value={6}>6 families</option>
          </select>
        </div>
        <div className="field">
          <label>Tax $</label>
          <input inputMode="decimal" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Fees $</label>
          <input inputMode="decimal" value={feesAmount} onChange={(e) => setFeesAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Tip</label>
          <div className="tipControls">
            <select value={tipMode} onChange={(e) => setTipMode(e.target.value as TipMode)}>
              <option value="percent">Percent</option>
              <option value="amount">Amount ($)</option>
            </select>
            {tipMode === 'percent' ? (
              <select value={tipPercent} onChange={(e) => setTipPercent(e.target.value)}>
                <option value="15">15%</option>
                <option value="18">18%</option>
                <option value="20">20%</option>
              </select>
            ) : (
              <input
                inputMode="decimal"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                placeholder="0.00"
              />
            )}
          </div>
        </div>
      </section>

      <main className="grid">
        {activeFamilies.map((family, idx) => {
          const subtotal = perFamily.subtotals[idx] ?? 0
          const share = perFamily.shareEach
          const familyClass = `family family${idx + 1}`
          return (
            <section key={family.id} className={`card ${familyClass}`}>
              <div className="familyHeader">
                <input
                  className="familyName"
                  value={family.name}
                  onChange={(e) => updateFamilyName(family.id, e.target.value)}
                />
                <div className="familyTotals">
                  <div className="kv">
                    <div className="k">Subtotal</div>
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
            <div className="k">Subtotal</div>
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

      <section className="breakdown card">
        <h2>Totals</h2>
        <div className="breakdownList">
          <div className="breakdownRow big">
            <div className="label">Grand total</div>
            <div className="value">{money(perFamily.grandTotal)}</div>
          </div>
          {activeFamilies.map((f, idx) => {
            const subtotal = perFamily.subtotals[idx] ?? 0
            const rowClass = `breakdownRow family${idx + 1}`
            return (
              <div key={f.id} className={rowClass}>
                <div className="label">{f.name}</div>
                <div className="value">{money(subtotal + perFamily.shareEach)}</div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default App
