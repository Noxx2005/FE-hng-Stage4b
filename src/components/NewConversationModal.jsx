import { X } from 'lucide-react';

export default function NewConversationModal({ open, users, loading, searchQuery, onClose, onSearch, onPickUser }) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-conversation-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-card__header">
          <div>
            <h3 id="new-conversation-title">Start a secure chat</h3>
            <p>Choose a user to generate an encrypted conversation.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-card__body">
          <label className="search-field search-field--modal">
            <input
              value={searchQuery}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search users by name"
              autoFocus
            />
          </label>
          {loading ? <div className="thread-placeholder thread-placeholder--compact">Loading users...</div> : null}
          {!loading && users.length === 0 ? <div className="thread-placeholder thread-placeholder--compact">No users available</div> : null}
          {!loading && users.length > 0
            ? users.map((user) => (
                <button key={user.id} type="button" className="user-pick" onClick={() => onPickUser(user)}>
                  <div className="conversation-item__avatar">{user.username.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <strong>{user.username}</strong>
                    <p>{user.id}</p>
                  </div>
                </button>
              ))
            : null}
        </div>
      </div>
    </div>
  );
}
