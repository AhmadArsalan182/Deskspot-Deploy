import { useEffect, useId, useRef, useState } from "react";

/**
 * Accessible application dialog for confirmations and optional reason input.
 * Replaces native browser confirm / prompt popups.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  requireReason = false,
  reasonLabel = "Reason",
  reasonPlaceholder = "",
  reasonMinLength = 3,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <DialogPanel
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      danger={danger}
      requireReason={requireReason}
      reasonLabel={reasonLabel}
      reasonPlaceholder={reasonPlaceholder}
      reasonMinLength={reasonMinLength}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

function DialogPanel({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  requireReason,
  reasonLabel,
  reasonPlaceholder,
  reasonMinLength,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const messageId = useId();
  const reasonId = useId();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");

  useEffect(() => {
    const previous = document.activeElement;
    const focusTarget = requireReason
      ? dialogRef.current?.querySelector("textarea")
      : cancelRef.current;
    focusTarget?.focus();

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel?.();
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onCancel, requireReason]);

  function handleConfirm() {
    if (requireReason) {
      const trimmed = reason.trim();
      if (trimmed.length < reasonMinLength) {
        setReasonError(`Enter at least ${reasonMinLength} characters.`);
        return;
      }
      onConfirm?.(trimmed);
      return;
    }
    onConfirm?.();
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="dialog__title">
          {title}
        </h2>
        <p id={messageId} className="dialog__message">
          {message}
        </p>
        {requireReason && (
          <div className="field">
            <label htmlFor={reasonId}>{reasonLabel}</label>
            <textarea
              id={reasonId}
              rows={3}
              value={reason}
              placeholder={reasonPlaceholder}
              aria-invalid={reasonError ? "true" : undefined}
              onChange={(event) => {
                setReason(event.target.value);
                if (reasonError) setReasonError("");
              }}
            />
            {reasonError && <p className="field__error">{reasonError}</p>}
          </div>
        )}
        <div className="dialog__actions">
          <button ref={cancelRef} type="button" className="btn btn--secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? "btn btn--danger" : "btn btn--primary"}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
