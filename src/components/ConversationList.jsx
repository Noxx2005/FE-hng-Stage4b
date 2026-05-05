import { MessageCircle, Plus } from 'lucide-react';

export default function ConversationList({ conversations, activeConversationId, onSelectConversation, onNewConversation }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <div>
          <p className="sidebar__title">Chats</p>
          <p className="sidebar__subtitle">Secure inbox</p>
        </div>
        <button className="icon-button" onClick={onNewConversation} type="button" aria-label="New conversation">
          <Plus size={18} />
        </button>
      </div>

      <div className="conversation-list">
        {conversations.map((conversation) => {
          const active = conversation.participant.id === activeConversationId || conversation.id === activeConversationId;
          return (
            <button
              key={conversation.id}
              type="button"
              className={active ? 'conversation-item conversation-item--active' : 'conversation-item'}
              onClick={() => onSelectConversation(conversation)}
            >
              <div className="conversation-item__avatar">{conversation.participant.username.slice(0, 1).toUpperCase()}</div>
              <div className="conversation-item__content">
                <div className="conversation-item__row">
                  <strong>{conversation.participant.username}</strong>
                  <span>{conversation.message_count} msgs</span>
                </div>
                <p>{conversation.last_preview || 'No messages yet'}</p>
              </div>
              <MessageCircle size={16} />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
