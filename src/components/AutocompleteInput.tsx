import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Database } from 'lucide-react';

export interface AutocompleteOption<T> {
  id: string;
  label: string;
  sublabel?: string;
  metaRight?: string;
  searchText?: string;
  data: T;
}

interface AutocompleteInputProps<T> {
  value: string;
  onChange: (value: string) => void;
  onSelectOption: (option: AutocompleteOption<T>) => void;
  onCommitBlur?: (currentValue: string) => void;
  options: AutocompleteOption<T>[];
  placeholder?: string;
  inputClassName?: string;
  emptyHint?: string;
  maxVisible?: number;
}

export function AutocompleteInput<T>({
  value,
  onChange,
  onSelectOption,
  onCommitBlur,
  options,
  placeholder,
  inputClassName = '',
  emptyHint,
  maxVisible = 8,
}: AutocompleteInputProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const justSelectedRef = useRef(false);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) {
      return options.slice(0, maxVisible);
    }
    const startsWithMatches: AutocompleteOption<T>[] = [];
    const containsMatches: AutocompleteOption<T>[] = [];
    for (const opt of options) {
      const labelLow = opt.label.toLowerCase();
      const extraLow = (opt.searchText || opt.sublabel || '').toLowerCase();
      if (labelLow.startsWith(q)) {
        startsWithMatches.push(opt);
      } else if (labelLow.includes(q) || extraLow.includes(q)) {
        containsMatches.push(opt);
      }
    }
    return [...startsWithMatches, ...containsMatches].slice(0, maxVisible);
  }, [options, value, maxVisible]);

  useEffect(() => {
    setActiveIndex(0);
  }, [value, isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChoose = (opt: AutocompleteOption<T>) => {
    justSelectedRef.current = true;
    onSelectOption(opt);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' && filtered.length > 0) {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length > 0) {
        setActiveIndex((prev) => (prev + 1) % filtered.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length > 0) {
        setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      }
    } else if (e.key === 'Enter' && filtered.length > 0) {
      const chosen = filtered[activeIndex];
      if (chosen) {
        e.preventDefault();
        handleChoose(chosen);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      setIsOpen(false);
      if (justSelectedRef.current) {
        justSelectedRef.current = false;
        return;
      }
      if (onCommitBlur) {
        onCommitBlur(value);
      }
    }, 120);
  };

  const showDropdown = isOpen && (filtered.length > 0 || Boolean(emptyHint && value.trim().length >= 2));

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-40 rounded-md border border-slate-200 bg-white shadow-lg overflow-hidden">
          {filtered.length > 0 ? (
            <ul className="max-h-60 overflow-y-auto divide-y divide-slate-100">
              {filtered.map((opt, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleChoose(opt);
                      }}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full px-3 py-2 text-left flex items-start justify-between gap-2 transition-colors cursor-pointer ${
                        isActive ? 'bg-blue-50 text-slate-900' : 'bg-white hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {opt.label}
                        </div>
                        {opt.sublabel && (
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {opt.sublabel}
                          </div>
                        )}
                      </div>
                      {opt.metaRight && (
                        <span className="text-[11px] font-mono font-medium text-[#1D4ED8] whitespace-nowrap shrink-0 pt-0.5">
                          {opt.metaRight}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            emptyHint && (
              <div className="px-3 py-2 text-[11px] text-slate-500 flex items-center gap-1.5 bg-slate-50/70">
                <Database className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{emptyHint}</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
