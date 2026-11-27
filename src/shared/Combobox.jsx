import { useEffect, useId, useMemo, useRef, useState } from 'react';

// Type-or-pick input. Replaces the native <datalist>, whose popup is drawn by the browser
// (black box under the arrow) and can't be styled. This one opens directly below the field,
// matches the site design, and still submits through the normal form (it renders a real <input name=...>).
export default function Combobox({ name, options = [], defaultValue = '', placeholder, maxLength, onChange }) {
  const [value, setValue] = useState(defaultValue || '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef(null);
  const id = useId();

  // remove duplicates that differ only by letter case (Birthday / birthday), keep the first spelling
  const items = useMemo(() => {
    const seen = new Set();
    return options.filter((o) => {
      const k = String(o).trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [options]);

  const q = value.trim().toLowerCase();
  const shown = items.filter((o) => !q || o.toLowerCase().includes(q));
  // when the typed text already equals an option, show everything so the person can switch
  const list = shown.length && !(shown.length === 1 && shown[0].toLowerCase() === q) ? shown : items;

  useEffect(() => {
    const away = (e) => wrap.current && !wrap.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
    };
  }, []);

  const set = (v) => {
    setValue(v);
    onChange && onChange(v);
  };
  const pick = (v) => {
    set(v);
    setOpen(false);
    setActive(-1);
  };

  const key = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActive((a) => Math.min(a + 1, list.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open && active >= 0 && list[active]) {
      e.preventDefault();
      pick(list[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="combo" ref={wrap}>
      <input
        name={name}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={id}
        aria-autocomplete="list"
        onChange={(e) => {
          set(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={key}
      />
      <button type="button" className="combo-btn" tabIndex={-1} aria-label="Show options" onClick={() => setOpen((o) => !o)}>
        <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && list.length > 0 && (
        <ul className="combo-list" id={id} role="listbox">
          {list.map((o, i) => (
            <li
              key={o}
              role="option"
              aria-selected={o.toLowerCase() === q}
              className={(i === active ? 'on ' : '') + (o.toLowerCase() === q ? 'sel' : '')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              onMouseEnter={() => setActive(i)}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
