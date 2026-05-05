import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, LogOut, Search, ShieldCheck, RefreshCw } from 'lucide-react';
import { apiClient } from '../lib/api';
import { decryptMessage, encryptMessage, importPublicKey } from '../lib/crypto';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import EncryptedBadge from '../components/EncryptedBadge';
import ConversationList from '../components/ConversationList';
import MessageThread from '../components/MessageThread';
import MessageComposer from '../components/MessageComposer';
import NewConversationModal from '../components/NewConversationModal';

function normalizeMessage(message, currentUserId) {
  const senderId = message.from_user_id || message.sender_id;
  const recipientId = message.to_user_id || message.recipient_id;
  const isMine = senderId === currentUserId;
  return {
    ...message,
    isMine,
    sender_id: senderId,
    recipient_id: recipientId,
    plaintext: message.plaintext || message.preview || '',
  };
}

function selectDecryptablePayload(message, currentUserId) {
  const senderId = message.from_user_id || message.sender_id;
  const payload = message.payload || message;

  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (senderId === currentUserId) {
    return {
      ...payload,
      encryptedKey: payload.encryptedKeyForSelf || payload.encryptedKey,
      encryptedKeyForSelf: undefined,
    };
  }

  return {
    ...payload,
    encryptedKeyForSelf: undefined,
  };
}

function normalizeConversationSummary(summary) {
  const participantId = summary.user_id || summary.id;
  return {
    id: participantId,
    participant: {
      id: participantId,
      username: summary.username,
      display_name: summary.display_name || summary.username,
    },
    last_message_at: summary.last_message_at || summary.created_at || null,
    message_count: summary.message_count || 0,
  };
}

export default function ChatPage() {
  const navigate = useNavigate();
  const { user, privateKey, publicKey, logout, reloadPrivateKey } = useAuth();
  const [search, setSearch] = useState('');
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [composerValue, setComposerValue] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState('');
  const [onlineStatus, setOnlineStatus] = useState('connected');

  const { send, status, reconnect } = useWebSocket(async (frame) => {
    if (frame.type === 'message.receive' && activeConversation) {
      const currentUserId = user.id;
      const envelope = frame.payload?.payload ? frame.payload : frame.payload?.message || frame.payload;
      const payload = selectDecryptablePayload(envelope, currentUserId);
      const plaintext = await decryptMessage(payload, privateKey || (await reloadPrivateKey()));
      const senderId = envelope.from_user_id || envelope.sender_id;
      const recipientId = envelope.to_user_id || envelope.recipient_id;
      const normalized = normalizeMessage(
        {
          ...envelope,
          sender_id: senderId,
          recipient_id: recipientId,
          id: envelope.id || envelope.message_id || crypto.randomUUID(),
          plaintext,
          created_at: envelope.created_at || new Date().toISOString(),
        },
        currentUserId
      );
      setMessages((current) => [...current, normalized]);
    }
  });

  useEffect(() => {
    setOnlineStatus(status);
  }, [status]);

  const loadConversations = useCallback(async () => {
    try {
      const response = await apiClient.get('/conversations');
      const summaries = Array.isArray(response.data)
        ? response.data
        : response.data?.conversations || response.data?.results || [];

      setConversations(summaries.map(normalizeConversationSummary));
    } catch (err) {
      console.error(err);
      setError('Unable to load conversations.');
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const loadUsers = useCallback(async (query = '') => {
    setUsersLoading(true);
    try {
      const response = await apiClient.get('/users/search', { params: { q: query } });
      const users = response.data.users || response.data.results || response.data || [];
      const normalizedUsers = users
        .map((entry) => ({
          ...entry,
          display_name: entry.display_name || entry.username,
        }))
        .filter((entry) => entry.id !== user.id);

      const lowerQuery = query.trim().toLowerCase();
      const filteredUsers = lowerQuery
        ? normalizedUsers.filter(
            (entry) =>
              entry.username?.toLowerCase().includes(lowerQuery) ||
              entry.display_name?.toLowerCase().includes(lowerQuery)
          )
        : normalizedUsers;

      setAvailableUsers(filteredUsers);
    } catch (err) {
      console.error(err);
      setError('Unable to load secure contacts.');
    } finally {
      setUsersLoading(false);
    }
  }, [user.id]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return conversations;
    }
    return conversations.filter((conversation) => {
      const username = conversation.participant.username?.toLowerCase() || '';
      const displayName = conversation.participant.display_name?.toLowerCase() || '';
      return username.includes(query) || displayName.includes(query);
    });
  }, [conversations, search]);

  const loadMessages = useCallback(
    async (conversation, before = null) => {
      if (!conversation?.participant?.id) {
        return;
      }
      setActiveConversation(conversation);
      setLoadingMessages(true);
      setError('');

      try {
        const response = await apiClient.get(`/conversations/${conversation.participant.id}/messages`, {
          params: {
            limit: 50,
            ...(before ? { before } : {}),
          },
        });
        const privKey = privateKey || (await reloadPrivateKey());
        const history = Array.isArray(response.data) ? response.data : response.data?.messages || response.data?.results || [];
        const decryptedMessages = await Promise.all(
          history.map(async (message) => {
            const senderId = message.from_user_id || message.sender_id;
            const payload = selectDecryptablePayload(message, user.id);
            const plaintext = await decryptMessage(payload, privKey);
            return normalizeMessage(
              {
                ...message,
                plaintext,
              },
              user.id
            );
          })
        );
        setMessages(decryptedMessages.reverse());
      } catch (err) {
        console.error(err);
        setError('Unable to decrypt or load this conversation.');
      } finally {
        setLoadingMessages(false);
      }
    },
    [privateKey, reloadPrivateKey, user.id]
  );

  useEffect(() => {
    if (filteredConversations.length > 0 && !activeConversation) {
      loadMessages(filteredConversations[0]);
    }
  }, [filteredConversations, activeConversation, loadMessages]);

  const activeConversationTitle = activeConversation?.participant?.username || 'No conversation selected';

  const handleOpenNewConversation = async () => {
    setUserSearchQuery('');
    setAvailableUsers([]);
    setNewChatOpen(true);
  };

  const handlePickUser = async (pickedUser) => {
    setNewChatOpen(false);
    const conversation = {
      id: pickedUser.id,
      participant: pickedUser,
      message_count: 0,
    };
    setActiveConversation(conversation);
    setMessages([]);
    await loadMessages(conversation);
  };

  const handleSearchUsers = async (query) => {
    setUserSearchQuery(query);
    if (!query.trim()) {
      setAvailableUsers([]);
      return;
    }

    await loadUsers(query.trim());
  };

  const handleLogout = async () => {
    await logout();
    setNewChatOpen(false);
    setAvailableUsers([]);
    setMessages([]);
    setConversations([]);
    setActiveConversation(null);
    navigate('/login', { replace: true });
  };

  const handleSend = async () => {
    if (!activeConversation || !composerValue.trim()) {
      return;
    }

    try {
      const plaintext = composerValue.trim();
      const recipientResponse = await apiClient.get(`/users/${activeConversation.participant.id}/public-key`);
      const recipientPublicKey = await importPublicKey(recipientResponse.data.public_key);
      const payload = await encryptMessage(plaintext, recipientPublicKey, publicKey);
      const messageBody = {
        to: activeConversation.participant.id,
        payload,
      };

      const { data: savedMessage } = await apiClient.post('/messages', messageBody);

      if (send) {
        send({
          type: 'message.send',
          payload: {
            recipient_id: activeConversation.participant.id,
            ...payload,
          },
        });
      }

      setComposerValue('');
      setMessages((current) => [
        ...current,
        normalizeMessage(
          {
            ...savedMessage,
            plaintext,
          },
          user.id
        ),
      ]);
      await loadConversations();
    } catch (err) {
      console.error(err);
      setError('Unable to send encrypted message.');
    }
  };

  return (
    <div className="app-shell">
      <ConversationList
        conversations={filteredConversations.map((conversation) => ({
          ...conversation,
          last_preview: conversation.last_preview || 'Encrypted conversation',
        }))}
        activeConversationId={activeConversation?.participant?.id || activeConversation?.id}
        onSelectConversation={(conversation) => loadMessages(conversation)}
        onNewConversation={handleOpenNewConversation}
      />

      <main className="chat-panel">
        <header className="chat-header">
          <div>
            <p className="chat-header__eyebrow">WhisperBox secure chat</p>
            <h1>{activeConversationTitle}</h1>
          </div>

          <div className="chat-header__actions">
            <div className={onlineStatus === 'connected' ? 'status-pill status-pill--online' : 'status-pill'}>
              <ShieldCheck size={14} />
              <span>{onlineStatus === 'connected' ? 'Secure link active' : 'Reconnecting...'}</span>
            </div>
            <button type="button" className="icon-button" onClick={reconnect} aria-label="Reconnect socket">
              <RefreshCw size={16} />
            </button>
            <button type="button" className="icon-button" onClick={handleLogout} aria-label="Log out">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <div className="chat-toolbar">
          <EncryptedBadge />
          <label className="search-field">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats" />
          </label>
        </div>

        {error ? (
          <div className="error-banner">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        <MessageThread
          messages={messages}
          loading={loadingMessages}
          emptyState="Select a secure chat to decrypt your messages."
          activeConversation={activeConversation}
        />

        <MessageComposer
          value={composerValue}
          onChange={setComposerValue}
          onSend={handleSend}
          disabled={!activeConversation}
          placeholder={activeConversation ? 'Send an encrypted message' : 'Choose a chat first'}
        />

        <NewConversationModal
          open={newChatOpen}
          users={availableUsers}
          loading={usersLoading}
          onClose={() => setNewChatOpen(false)}
          searchQuery={userSearchQuery}
          onSearch={handleSearchUsers}
          onPickUser={handlePickUser}
        />
      </main>
    </div>
  );
}
