import { bookViews, type BookView } from "./shell";
import type { Icon } from "@phosphor-icons/react";

interface ShellActivityBarProps {
  activeView: BookView;
  onViewChange: (view: BookView) => void;
}

function ActivityButton(props: {
  activeView: BookView;
  buttonClassName: string;
  viewId: BookView;
  viewLabel: string;
  viewIcon: Icon;
  onViewChange: (view: BookView) => void;
}) {
  const isActive = props.activeView === props.viewId;

  return (
    <button
      className={`${props.buttonClassName}${isActive ? " active" : ""}`}
      type="button"
      title={props.viewLabel}
      onClick={() => props.onViewChange(props.viewId)}
    >
      <props.viewIcon size={20} weight={isActive ? "regular" : "light"} />
    </button>
  );
}

export function ShellActivityBar(props: ShellActivityBarProps) {
  const primaryViews = bookViews.filter((view) => view.id !== "settings");
  const settingsView = bookViews.find((view) => view.id === "settings");

  return (
    <aside className="shell-activity-bar">
      <nav className="shell-activity-nav" aria-label="Book sections">
        {primaryViews.map((view) => (
          <ActivityButton
            key={view.id}
            activeView={props.activeView}
            buttonClassName="shell-activity-button"
            viewId={view.id}
            viewLabel={view.label}
            viewIcon={view.icon}
            onViewChange={props.onViewChange}
          />
        ))}
      </nav>
      {settingsView ? (
        <ActivityButton
          activeView={props.activeView}
          buttonClassName="shell-activity-settings"
          viewId={settingsView.id}
          viewLabel={settingsView.label}
          viewIcon={settingsView.icon}
          onViewChange={props.onViewChange}
        />
      ) : null}
    </aside>
  );
}
