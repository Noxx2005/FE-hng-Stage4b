import { Send } from 'lucide-react';

export default function MessageComposer({ value, onChange, onSend, disabled, placeholder }) {
  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button className="primary-button primary-button--small" type="submit" disabled={disabled || !value.trim()}>
        <Send size={16} />
        Send
      </button>
    </form>
  );
}
