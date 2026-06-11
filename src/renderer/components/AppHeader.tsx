import './AppHeader.css'

interface Props {
  showControls?: boolean
}

function AppHeader({ showControls = true }: Props) {
  return (
    <div className="app-header drag-region">
      <div className="app-title">RLR P2P Chat</div>
      {showControls && (
        <div className="header-window-controls no-drag">
          <button
            className="header-btn"
            onClick={() => window.electronAPI.minimizeWindow()}
            aria-label="Minimize window"
            title="Minimize"
          >
            −
          </button>
          <button
            className="header-btn close"
            onClick={() => window.electronAPI.closeWindow()}
            aria-label="Close window"
            title="Close"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

export default AppHeader
