// On phones, a secondary section folds to one button that names it and says whether it
// is open. The button is a real control with aria-expanded and aria-controls, and the
// hidden region is removed from the accessibility tree while folded. On wider screens
// the children are returned unchanged, so the desktop markup is not altered.
export function CollapsibleSection({ phone, id, label, open, onToggle, children }) {
  if (!phone) return children;

  return (
    <div className="collapsible">
      <button
        type="button"
        className="collapsible-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onToggle(!open)}
      >
        <span>{label}</span>
        <span className="collapsible-state">{open ? "Hide" : "Show"}</span>
      </button>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
