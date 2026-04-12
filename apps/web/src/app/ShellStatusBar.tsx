interface ShellStatusBarProps {
  apiStatus: "online" | "offline" | "unknown";
  availableBalance: number | null;
  onCycleMode: () => void;
  runningBalance: number | null;
  statusBarMode: "total" | "available" | "both";
  totalCount: number;
  unclearedCount: number;
  unclearedTotal: number | null;
}

export function ShellStatusBar(props: ShellStatusBarProps) {
  const noAccount = props.runningBalance === null;

  function formatBalance(value: number): string {
    return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function renderStatus() {
    if (noAccount) {
      return <span className="muted">{props.totalCount} transactions</span>;
    }

    if (props.statusBarMode === "available") {
      return (
        <>
          <span>{props.totalCount - props.unclearedCount} cleared</span>
          <span className="status-bar-sep">·</span>
          <span>{formatBalance(props.availableBalance!)}</span>
        </>
      );
    }

    if (props.statusBarMode === "both") {
      return (
        <>
          <span>{props.totalCount} total</span>
          <span className="status-bar-sep">·</span>
          <span>{formatBalance(props.runningBalance!)}</span>
          {props.unclearedCount > 0 ? (
            <>
              <span className="status-bar-sep">·</span>
              <span className="muted">{props.unclearedCount} pending</span>
              <span className="status-bar-sep">·</span>
              <span className="muted">{formatBalance(props.unclearedTotal!)}</span>
            </>
          ) : null}
        </>
      );
    }

    return (
      <>
        <span>{props.totalCount} transactions</span>
        <span className="status-bar-sep">·</span>
        <span>{formatBalance(props.runningBalance!)}</span>
      </>
    );
  }

  return (
    <>
      <div className="shell-status-left">
        <span className={`status-dot ${props.apiStatus}`} />
        <span>{props.apiStatus === "unknown" ? "loading" : props.apiStatus}</span>
      </div>
      <button
        className="shell-status-right"
        title={`Display mode: ${props.statusBarMode} — click to cycle`}
        type="button"
        onClick={props.onCycleMode}
      >
        {renderStatus()}
      </button>
    </>
  );
}
