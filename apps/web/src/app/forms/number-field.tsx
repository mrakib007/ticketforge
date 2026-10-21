'use client';

import { useField } from 'formik';

export function NumberField({
  name,
  label,
  min,
  max,
}: {
  name: string;
  label: string;
  min: number;
  max: number;
}) {
  const [field, meta] = useField<number>(name);
  return (
    <>
      <label htmlFor={name}>{label}</label>
      <input
        {...field}
        id={name}
        type="number"
        min={min}
        max={max}
        step="1"
        aria-invalid={meta.touched && !!meta.error}
        aria-describedby={
          meta.touched && meta.error ? `${name}-error` : undefined
        }
      />
      {meta.touched && meta.error && (
        <p id={`${name}-error`} role="alert">
          {meta.error}
        </p>
      )}
    </>
  );
}
