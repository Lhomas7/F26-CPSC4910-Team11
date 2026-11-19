import '../Sponsors.css';

/** Choose sponsors to apply to. `selected` is an array of sponsor ids. */
export default function SponsorCheckboxList({
  legend,
  hint,
  sponsors,
  selected,
  onChange,
  disabled = false,
}) {
  const toggle = (id, checked) =>
    onChange(checked ? [...selected, id] : selected.filter((chosen) => chosen !== id));

  return (
    <fieldset className="sponsor-checkboxes" disabled={disabled}>
      <legend>{legend}</legend>
      {hint && <p className="sponsor-checkboxes-hint">{hint}</p>}
      <ul>
        {sponsors.map((sponsor) => (
          <li key={sponsor.id}>
            <label>
              <input
                type="checkbox"
                checked={selected.includes(sponsor.id)}
                onChange={(event) => toggle(sponsor.id, event.target.checked)}
              />
              <span>{sponsor.name}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
