import { useEffect, useRef, useState } from "react";
import "./MultiSelect.css";

/**
 * Accessible multi-select dropdown built from a disclosure button + checkbox
 * list (native <select multiple> has poor UX — it requires Ctrl/Cmd-click
 * and no visible checkmarks). Closes on outside click or Escape.
 */
export default function MultiSelect({ id, label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const toggleOption = (option) => {
    if (selected.includes(option)) {
      onChange(selected.filter((v) => v !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const summary =
    selected.length === 0
      ? `All ${label.toLowerCase()}s`
      : selected.length === 1
      ? selected[0]
      : `${selected.length} ${label.toLowerCase()}s selected`;

  return (
    <div className="multi-select" ref={rootRef}>
      <span className="filter-bar__label" id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        id={id}
        className="multi-select__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="multi-select__summary">{summary}</span>
        <span aria-hidden="true" className="multi-select__chevron">
          ▾
        </span>
      </button>
      {open && (
        <div className="multi-select__panel" role="listbox" aria-multiselectable="true" aria-labelledby={`${id}-label`}>
          {selected.length > 0 && (
            <button type="button" className="multi-select__clear" onClick={() => onChange([])}>
              Clear selection
            </button>
          )}
          {options.map((option) => {
            const checked = selected.includes(option);
            return (
              <label key={option} className="multi-select__option">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleOption(option)}
                />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
