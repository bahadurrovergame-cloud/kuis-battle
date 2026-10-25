'use client';

import React, { useState, useEffect } from 'react';

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  fallback?: number;
  className?: string;
  disabled?: boolean;
}

/**
 * Komponen Input Angka Bersih (Biasa):
 * 1. Tanpa panah/spinner browser yang mengganggu.
 * 2. Angka depan (seperti 0 atau 1) dapat dihapus sepenuhnya dengan tombol Backspace tanpa nyangkut.
 * 3. Tetap responsif membuka numeric pad di ponsel via inputMode="numeric".
 */
export default function NumericInput({
  value,
  onChange,
  min,
  max,
  placeholder,
  fallback,
  className,
  disabled,
  ...props
}: NumericInputProps) {
  const [text, setText] = useState<string>(
    value !== undefined && value !== null && !isNaN(value) ? String(value) : ''
  );

  useEffect(() => {
    setText(value !== undefined && value !== null && !isNaN(value) ? String(value) : '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setText(raw);
    if (raw !== '') {
      let num = parseInt(raw, 10);
      if (max !== undefined && num > max) num = max;
      onChange(num);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    props.onBlur?.(e);
    if (text === '' || isNaN(Number(text))) {
      const def = fallback !== undefined ? fallback : (min !== undefined ? min : 0);
      setText(String(def));
      onChange(def);
    } else {
      let num = parseInt(text, 10);
      if (min !== undefined && num < min) num = min;
      if (max !== undefined && num > max) num = max;
      setText(String(num));
      onChange(num);
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      {...props}
    />
  );
}

