import { useState, useCallback, useRef, type KeyboardEvent } from 'react';
import { type Mahalle } from '../veriKaynagi';

interface MahalleAramaProps {
  mahalleler: Mahalle[];
  onSecim: (ad: string) => void;
}

export default function MahalleArama({ mahalleler, onSecim }: MahalleAramaProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered =
    query.length > 0
      ? mahalleler.filter((m) =>
          m.ad.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))
        )
      : [];

  const handleFocus = useCallback(() => {
    if (query.length > 0) {
      setOpen(true);
    }
  }, [query]);

  const handleBlur = useCallback(() => {
    setOpen(false);
  }, []);

  const handleSelect = useCallback(
    (ad: string) => {
      onSecim(ad);
      setQuery(ad);
      setOpen(false);
      inputRef.current?.blur();
    },
    [onSecim]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      } else if (e.key === 'Enter' && open && filtered.length > 0) {
        handleSelect(filtered[0].ad);
      }
    },
    [open, filtered, handleSelect]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setOpen(value.length > 0);
  }, []);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        placeholder="Mahalle ara…"
        value={query}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        aria-label="Mahalle ara"
        className="w-48 focus:w-64 transition-all duration-150 ease-out rounded-full bg-page text-kurum px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-page/50"
      />
      {open && query.length > 0 && (
        <div className="absolute left-0 top-full mt-1 w-full bg-page border border-contur rounded-lg shadow-lg z-50 overflow-hidden">
          {filtered.length > 0 ? (
            filtered.map((m) => (
              <button
                key={m.ad}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(m.ad)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-panel transition-colors"
              >
                {m.ad}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted">
              Eşleşen mahalle bulunamadı
            </div>
          )}
        </div>
      )}
    </div>
  );
}
