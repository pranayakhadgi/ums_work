interface Props {
  onClick: () => void;
}

export default function CommandBar({ onClick }: Props) {
  return (
    <div className="command-bar-wrapper">
      <button className="command-bar" onClick={onClick}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <span>Search monitors, apps, or run commands...</span>
        <kbd className="command-kbd">⌘K</kbd>
      </button>
    </div>
  );
}