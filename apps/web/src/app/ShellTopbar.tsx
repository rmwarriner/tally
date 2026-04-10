import { useEffect, useRef, useState, type KeyboardEvent } from "react";

interface ShellTopbarProps {
  currentPeriodLabel: string;
  isPeriodInputOpen: boolean;
  onPeriodClick: () => void;
  onPeriodSubmit: (text: string) => void;
  onPeriodCancel: () => void;
  onCommandPaletteClick: () => void;
}

function handlePillKeyDown(event: KeyboardEvent<HTMLDivElement>, onClick: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onClick();
  }
}

export function ShellTopbar(props: ShellTopbarProps) {
  const [periodText, setPeriodText] = useState(props.currentPeriodLabel);
  const periodInputRef = useRef<HTMLInputElement | null>(null);
  const ignoreBlurSubmitRef = useRef(false);

  useEffect(() => {
    if (!props.isPeriodInputOpen) {
      setPeriodText(props.currentPeriodLabel);
      ignoreBlurSubmitRef.current = false;
      return;
    }

    setPeriodText(props.currentPeriodLabel);
    window.setTimeout(() => {
      periodInputRef.current?.focus();
      periodInputRef.current?.select();
    }, 0);
  }, [props.currentPeriodLabel, props.isPeriodInputOpen]);

  return (
    <header className="shell-topbar">
      <div className="window-controls" aria-hidden="true">
        <span className="window-dot red" />
        <span className="window-dot amber" />
        <span className="window-dot green" />
      </div>
      <div className="shell-app-name">tally</div>
      <div className="shell-topbar-actions">
        {props.isPeriodInputOpen ? (
          <input
            ref={periodInputRef}
            className="topbar-period-input"
            placeholder="e.g. April 2026 or 2026-04"
            value={periodText}
            onBlur={() => {
              if (ignoreBlurSubmitRef.current) {
                ignoreBlurSubmitRef.current = false;
                return;
              }
              props.onPeriodSubmit(periodText);
            }}
            onChange={(event) => setPeriodText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                props.onPeriodSubmit(periodText);
                return;
              }

              if (event.key === "Escape") {
                event.preventDefault();
                ignoreBlurSubmitRef.current = true;
                props.onPeriodCancel();
              }
            }}
          />
        ) : (
          <div
            className="topbar-pill"
            role="button"
            tabIndex={0}
            onClick={props.onPeriodClick}
            onKeyDown={(event) => handlePillKeyDown(event, props.onPeriodClick)}
          >
            {props.currentPeriodLabel}
          </div>
        )}
        <div
          className="topbar-pill muted"
          role="button"
          tabIndex={0}
          onClick={props.onCommandPaletteClick}
          onKeyDown={(event) => handlePillKeyDown(event, props.onCommandPaletteClick)}
        >
          {"> cmd..."}
        </div>
      </div>
    </header>
  );
}
