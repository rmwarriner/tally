import { bookViews, type BookView } from "./shell";

interface ShellActivityBarProps {
  activeView: BookView;
  onViewChange: (view: BookView) => void;
}

export function ShellActivityBar(props: ShellActivityBarProps) {
  return (
    <aside className="shell-activity-bar">
      <nav className="shell-activity-nav" aria-label="Book sections">
        {bookViews.map((view) => (
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
      <button className="shell-activity-settings" type="button">
        ST
      </button>
    </aside>
  );
}
