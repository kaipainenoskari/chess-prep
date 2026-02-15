"use client";

import { useState, useCallback } from "react";

const DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export interface FenInputProps {
  value: string;
  onChange: (fen: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

export default function FenInput({
  value,
  onChange,
  placeholder = "Paste FEN or leave blank for starting position",
  error,
  disabled,
  "aria-label": ariaLabel = "Position FEN",
}: FenInputProps) {
  const [touched, setTouched] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
      setTouched(true);
    },
    [onChange],
  );

  const handleBlur = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      onChange(DEFAULT_FEN);
    }
    setTouched(true);
  }, [value, onChange]);

  const showError = touched && error;

  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={!!showError}
        aria-describedby={showError ? "fen-error" : undefined}
        className="w-full px-4 py-3 rounded-lg bg-chess-card border border-chess-border text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-chess-accent focus:border-transparent font-mono text-sm"
      />
      {showError && (
        <p id="fen-error" className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
