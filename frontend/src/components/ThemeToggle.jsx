import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeContext.jsx';

const options = [
  { value: 'light', label: 'Light', icon: '☼' },
  { value: 'dark', label: 'Dark', icon: '☾' },
  { value: 'system', label: 'System', icon: '◐' },
];

export default function ThemeToggle({ compact = false }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const selected = options.find((item) => item.value === theme) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return <div className={`theme-toggle${compact ? ' theme-toggle-compact' : ''}`} ref={root}>
    <button type="button" className="theme-toggle-trigger" aria-label={`Appearance: ${selected.label}`} aria-haspopup="true" aria-expanded={open} title={`Appearance: ${selected.label}`} onClick={() => setOpen((value) => !value)}>
      <span aria-hidden="true">{theme === 'dark' ? '☾' : theme === 'system' ? '◐' : '☼'}</span><span className="theme-toggle-label">Appearance</span>
    </button>
    {open && <div className="theme-toggle-popover" role="radiogroup" aria-label="Color theme">{options.map((option) => <button type="button" key={option.value} role="radio" aria-checked={theme === option.value} className={`theme-toggle-option${theme === option.value ? ' is-selected' : ''}`} onClick={() => { setTheme(option.value); setOpen(false); }}><span aria-hidden="true">{option.icon}</span>{option.label}{theme === option.value && <span className="theme-toggle-check" aria-hidden="true">✓</span>}</button>)}</div>}
  </div>;
}
