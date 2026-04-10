interface ShellStatusBarProps {
  apiStatus: "online" | "offline" | "unknown";
  registerStatus: string | null;
}

export function ShellStatusBar(props: ShellStatusBarProps) {
  return (
    <>
      <div className="shell-status-left">
        <span className={`status-dot ${props.apiStatus}`} />
        <span>{props.apiStatus === "unknown" ? "loading" : props.apiStatus}</span>
      </div>
      <div className={`shell-status-right${props.registerStatus ? "" : " muted"}`}>
        {props.registerStatus ?? "No active register status"}
      </div>
    </>
  );
}
