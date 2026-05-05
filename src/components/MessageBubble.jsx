export default function MessageBubble({ message, isMine }) {
  return (
    <div className={isMine ? 'message-row message-row--mine' : 'message-row'}>
      <div className={isMine ? 'message-bubble message-bubble--mine' : 'message-bubble'}>
        <p className="message-bubble__text">{message.plaintext}</p>
        <div className="message-meta">
          <span>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <span>{isMine ? '✓✓' : '🔒'}</span>
        </div>
      </div>
    </div>
  );
}
