import { bookViews, type BookView } from "./shell";

interface ShellActivityBarProps {
  activeView: BookView;
  onViewChange: (view: BookView) => void;
}

export function ShellActivityBar(props: ShellActivityBarProps) {
  const primaryViews = bookViews.filter((view) => view.id !== "settings");

  return (
    <aside className="shell-activity-bar">
      <nav className="shell-activity-nav" aria-label="Book sections">
        {primaryViews.map((view) => (
          <button
            key={view.id}
            className={`shell-activity-button${props.activeView === view.id ? " active" : ""}`}
            type="button"
            onClick={() => props.onViewChange(view.id)}
          >
            {view.shortLabel}
          </button>
        ))}
      </nav>
      <button
        className={`shell-activity-settings${props.activeView === "settings" ? " active" : ""}`}
        type="button"
        onClick={() => props.onViewChange("settings")}
      >
        ST
      </button>
    </aside>
  );
}
