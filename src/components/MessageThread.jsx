import MessageBubble from './MessageBubble';

export default function MessageThread({ messages, loading, emptyState, activeConversation }) {
  return (
    <div className="message-thread">
      <div className="thread-scroll">
        {loading ? <div className="thread-placeholder">Decrypting messages...</div> : null}
        {!loading && messages.length === 0 ? <div className="thread-placeholder">{emptyState}</div> : null}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} isMine={message.isMine} />
        ))}
      </div>
    </div>
  );
}
