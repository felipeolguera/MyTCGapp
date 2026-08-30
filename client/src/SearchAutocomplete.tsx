import { useEffect, useId, useRef, useState } from "react";
import type { SearchSuggestion } from "./searchSuggest";

interface SearchAutocompleteProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: SearchSuggestion[];
  onPick: (suggestion: SearchSuggestion) => void;
  placeholder?: string;
  disabled?: boolean;
  enterKeyHint?: "search" | "enter" | "done" | "go" | "next" | "previous" | "send";
  "aria-label"?: string;
  className?: string;
  inputClassName?: string;
  minChars?: number;
  /** Collection toolbar opens upward (above keyboard); decks opens downward. */
  dropdown?: "above" | "below";
}

export function SearchAutocomplete({
  id,
  value,
  onChange,
  suggestions,
  onPick,
  placeholder,
  disabled,
  enterKeyHint = "search",
  "aria-label": ariaLabel,
  className,
  inputClassName,
  minChars = 1,
  dropdown = "above",
}: SearchAutocompleteProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-suggest`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const show =
    open &&
    !disabled &&
    value.trim().length >= minChars &&
    suggestions.length > 0;

  useEffect(() => {
    setActive(0);
  }, [value, suggestions]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(item: SearchSuggestion) {
    onPick(item);
    setOpen(false);
  }

  return (
    <div
      className={className ? `search-autocomplete ${className}` : "search-autocomplete"}
      ref={rootRef}
    >
      <input
        id={inputId}
        className={inputClassName}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint={enterKeyHint}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && suggestions[active]) {
            e.preventDefault();
            pick(suggestions[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {show && (
        <ul
          id={listId}
          className={
            dropdown === "below"
              ? "search-autocomplete__list search-autocomplete__list--below"
              : "search-autocomplete__list"
          }
          role="listbox"
          aria-label="Suggestions"
        >
          {suggestions.map((item, idx) => (
            <li key={item.id} role="presentation">
              <button
                type="button"
                id={`${listId}-${idx}`}
                role="option"
                aria-selected={idx === active}
                className={
                  idx === active
                    ? "search-autocomplete__option search-autocomplete__option--active"
                    : "search-autocomplete__option"
                }
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
                onMouseEnter={() => setActive(idx)}
              >
                <strong>{item.primary}</strong>
                {item.secondary ? <small>{item.secondary}</small> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
