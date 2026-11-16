const plans = [
  { key: 'starter', name: 'Starter', price: '₹3,000', cadence: '/ month', detail: '1 branch · 3 staff · 100 visits/month' },
  { key: 'team', name: 'Team', price: '₹6,500', cadence: '/ month', detail: 'Up to 5 branches · 20 staff · unlimited visits' },
  { key: 'business', name: 'Business', price: '₹13,000', cadence: '/ month', detail: 'Unlimited branches, staff, and visits' },
] as const

export function PlanSelector({ name = 'plan' }: { name?: string }) {
  return <fieldset className="plan-selector">
    <legend>Choose a required monthly plan</legend>
    <div className="plan-selector-grid">
      {plans.map(plan => <label className="plan-option" key={plan.key}>
        <input type="radio" name={name} value={plan.key} required />
        <span className="plan-option-copy"><strong>{plan.name}</strong><span className="plan-option-price">{plan.price}<small>{plan.cadence}</small></span><small>{plan.detail}</small></span>
      </label>)}
    </div>
    <small className="muted">Payment will be added later. Choosing a plan gives this workspace access now.</small>
  </fieldset>
}
