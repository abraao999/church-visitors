import { useEffect, useId, useRef, useState } from 'react';
import { AppIcon } from './AppIcon';
import {
  filterMunicipalities,
  loadMunicipalities,
  type Municipality,
} from '../utils/citySuggest';
import './CitySuggestField.css';

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  required?: boolean;
}

export function CitySuggestField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  disabled,
  required,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [catalog, setCatalog] = useState<readonly Municipality[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestions = filterMunicipalities(catalog, value);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  const showList = open && suggestions.length > 0 && !disabled;

  useEffect(() => {
    let cancelled = false;
    loadMunicipalities()
      .then((list) => {
        if (!cancelled) setCatalog(list);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  function selectSuggestion(index: number) {
    const item = suggestions[index];
    if (!item) return;
    onChange(item.name.toLocaleUpperCase('pt-BR'));
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`city-suggest${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="city-suggest-control">
        <input
          id={id}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${activeIndex}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          aria-required={required}
          value={value}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={100}
          placeholder="Digite a cidade"
          className="visitor-input-uppercase"
          onChange={(event) => {
            onChange(event.target.value.toLocaleUpperCase('pt-BR'));
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => (current + 1) % Math.max(suggestions.length, 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((current) =>
                current <= 0 ? Math.max(suggestions.length - 1, 0) : current - 1
              );
            } else if (event.key === 'Enter' && showList) {
              event.preventDefault();
              selectSuggestion(activeIndex);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        <AppIcon name="search" />
      </div>
      {showList && (
        <ul id={listId} role="listbox" className="city-suggest-list">
          {suggestions.map((item, index) => (
            <li
              key={`${item.name}-${item.uf}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'is-active' : undefined}
              onMouseDown={(event) => {
                event.preventDefault();
                selectSuggestion(index);
              }}
            >
              <AppIcon name="pin" />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p id={errorId} className="city-suggest-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="city-suggest-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
