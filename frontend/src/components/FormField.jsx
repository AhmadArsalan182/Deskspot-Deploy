import { useId } from "react";

export default function FormField({ label, error, hint, trailing, className, ...inputProps }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`field${className ? ` ${className}` : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className={trailing ? "field__control field__control--trailing" : "field__control"}>
        <input id={id} aria-invalid={error ? "true" : "false"} aria-describedby={describedBy} {...inputProps} />
        {trailing}
      </div>
      {hint && <div id={hintId} className="field__hint">{hint}</div>}
      {error && <div id={errorId} className="field__error">{error}</div>}
    </div>
  );
}
