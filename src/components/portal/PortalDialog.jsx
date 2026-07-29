import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export default function PortalDialog({
  open,
  title,
  description,
  dirty = false,
  busy = false,
  onClose,
  children
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const [confirmClose, setConfirmClose] = useState(false);

  function requestClose() {
    if (busy) return;
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  useEffect(() => {
    if (!open) return undefined;

    restoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const firstControl = dialogRef.current?.querySelector(focusableSelector);
      (firstControl || dialogRef.current)?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) setConfirmClose(false);
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (confirmClose) setConfirmClose(false);
      else requestClose();
      return;
    }

    if (event.key !== "Tab") return;
    const controls = [...dialogRef.current.querySelectorAll(focusableSelector)];
    if (!controls.length) {
      event.preventDefault();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      className="portal-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        ref={dialogRef}
        className="portal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="portal-dialog-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            className="portal-icon-button"
            type="button"
            aria-label={`Close ${title}`}
            title="Close"
            disabled={busy}
            onClick={requestClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        {typeof children === "function" ? children({ requestClose }) : children}
        {confirmClose ? (
          <div className="portal-dialog-confirm-layer">
            <div className="portal-dialog-confirm" role="alertdialog" aria-modal="true" aria-labelledby={`${titleId}-discard`}>
              <h3 id={`${titleId}-discard`}>Discard unsaved changes?</h3>
              <p>Your changes have not been saved.</p>
              <div className="portal-dialog-actions">
                <button className="button button-secondary" type="button" onClick={() => setConfirmClose(false)}>Keep Editing</button>
                <button className="button button-primary" type="button" onClick={onClose}>Discard Changes</button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>,
    document.body
  );
}
