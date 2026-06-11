import './UserSelection.css'

interface Props {
  onSelect: (identity: 'RLRJupiter' | 'Ripster') => void
}

function UserSelection({ onSelect }: Props) {
  return (
    <div className="user-selection glass">
      <h1 className="title">Select Your Identity</h1>
      <p className="subtitle">Click your name to continue</p>

      <div className="user-options" role="radiogroup" aria-label="User identity selection">
        <div
          className="user-card clickable"
          onClick={() => onSelect('RLRJupiter')}
          onKeyPress={(e) => e.key === 'Enter' && onSelect('RLRJupiter')}
          tabIndex={0}
          role="button"
          aria-label="RLRJupiter - Connector"
        >
          <div className="user-avatar rlr" aria-hidden="true">RJ</div>
          <div className="user-name">RLRJupiter</div>
          <div className="user-role">Connector</div>
        </div>

        <div
          className="user-card clickable"
          onClick={() => onSelect('Ripster')}
          onKeyPress={(e) => e.key === 'Enter' && onSelect('Ripster')}
          tabIndex={0}
          role="button"
          aria-label="Ripster - Listener"
        >
          <div className="user-avatar ripster" aria-hidden="true">R</div>
          <div className="user-name">Ripster</div>
          <div className="user-role">Listener</div>
        </div>
      </div>
    </div>
  )
}

export default UserSelection
