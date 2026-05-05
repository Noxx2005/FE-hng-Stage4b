import { encryptMessage, generateRSAKeyPair, exportPublicKey, generateSalt, deriveWrappingKey, wrapPrivateKey, importPublicKey } from './crypto';

const state = {
  users: [],
  conversations: new Map(),
  messages: [],
  tokens: new Map(),
};

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createToken(userId) {
  const access_token = `mock-access-${userId}-${Date.now()}`;
  const refresh_token = `mock-refresh-${userId}-${Date.now()}`;
  state.tokens.set(access_token, userId);
  state.tokens.set(refresh_token, userId);
  return { access_token, refresh_token };
}

function seedUsersIfNeeded() {
  if (state.users.length > 0) {
    return;
  }
  state.users.push(
    { id: 'user_alice', username: 'alice', public_key: null, wrapped_private_key: null, pbkdf2_salt: null },
    { id: 'user_bob', username: 'bob', public_key: null, wrapped_private_key: null, pbkdf2_salt: null }
  );
}

async function makeDemoKeyMaterial(username, password) {
  const pair = await generateRSAKeyPair();
  const salt = generateSalt();
  const wrappingKey = await deriveWrappingKey(password, salt);
  const public_key = await exportPublicKey(pair.publicKey);
  const wrapped_private_key = await wrapPrivateKey(pair.privateKey, wrappingKey);
  return { public_key, wrapped_private_key, pbkdf2_salt: salt, privateKey: pair.privateKey };
}

async function ensureDemoKeypair(user, password = 'password123') {
  if (user.public_key && user.wrapped_private_key && user.pbkdf2_salt) {
    return;
  }
  const material = await makeDemoKeyMaterial(user.username, password);
  user.public_key = material.public_key;
  user.wrapped_private_key = material.wrapped_private_key;
  user.pbkdf2_salt = material.pbkdf2_salt;
}

async function postRegister(body) {
  const id = createId('user');
  const user = {
    id,
    username: body.username,
    display_name: body.display_name,
    public_key: body.public_key,
    wrapped_private_key: body.wrapped_private_key,
    pbkdf2_salt: body.pbkdf2_salt,
  };
  state.users.push(user);
  const tokens = createToken(id);
  return {
    data: {
      user: { id, username: body.username, display_name: body.display_name },
      ...tokens,
    },
  };
}

async function postLogin(body) {
  seedUsersIfNeeded();
  const user = state.users.find((entry) => entry.username.toLowerCase() === String(body.username).toLowerCase());
  if (!user) {
    throw new Error('Invalid username or password');
  }
  await ensureDemoKeypair(user, body.password || 'password123');
  const tokens = createToken(user.id);
  return {
    data: {
      user: { id: user.id, username: user.username, display_name: user.display_name },
      public_key: user.public_key,
      wrapped_private_key: user.wrapped_private_key,
      pbkdf2_salt: user.pbkdf2_salt,
      ...tokens,
    },
  };
}

async function postRefresh(body) {
  const userId = state.tokens.get(body.refresh_token);
  if (!userId) {
    throw new Error('Invalid refresh token');
  }
  const tokens = createToken(userId);
  return { data: tokens };
}

async function postLogout(body) {
  state.tokens.delete(body.refresh_token);
  return { data: { success: true } };
}

async function getMe() {
  const token = sessionStorage.getItem('access_token');
  const userId = state.tokens.get(token);
  const user = state.users.find((entry) => entry.id === userId);
  if (!user) {
    throw new Error('Unauthorized');
  }
  return { data: { id: user.id, username: user.username } };
}

async function getUsers() {
  seedUsersIfNeeded();
  return { data: { users: state.users.map(({ id, username }) => ({ id, username })) } };
}

async function searchUsers(pathParts, url) {
  seedUsersIfNeeded();
  const query = new URLSearchParams(url.split('?')[1] || '').get('q') || '';
  const users = state.users
    .filter((user) => user.username.toLowerCase().includes(query.toLowerCase()))
    .map(({ id, username }) => ({ id, username }));
  return { data: { users } };
}

async function getPublicKey(pathParts) {
  const userId = pathParts.at(-2);
  const user = state.users.find((entry) => entry.id === userId);
  if (!user) {
    throw new Error('User not found');
  }
  if (!user.public_key) {
    await ensureDemoKeypair(user);
  }
  return { data: { public_key: user.public_key } };
}

function getConversationKey(a, b) {
  return [a, b].sort().join('::');
}

async function postMessage(body) {
  const senderId = state.tokens.get(sessionStorage.getItem('access_token')) || 'user_alice';
  const recipientId = body.to || body.recipient_id;
  const payload = body.payload || {
    ciphertext: body.ciphertext,
    iv: body.iv,
    encryptedKey: body.encryptedKey,
    encryptedKeyForSelf: body.encryptedKeyForSelf,
  };
  const message = {
    id: createId('msg'),
    sender_id: senderId,
    recipient_id: recipientId,
    payload,
    created_at: new Date().toISOString(),
  };
  state.messages.push(message);
  const key = getConversationKey(senderId, recipientId);
  const existing = state.conversations.get(key) || [];
  existing.push(message.id);
  state.conversations.set(key, existing);
  return { data: message };
}

async function getMessages(pathParts) {
  const targetUserId = pathParts.at(-2);
  const myUserId = state.tokens.get(sessionStorage.getItem('access_token')) || 'user_alice';
  const key = getConversationKey(myUserId, targetUserId);
  const ids = state.conversations.get(key) || [];
  const messages = state.messages
    .filter((message) => ids.includes(message.id))
    .map((message) => ({
      id: message.id,
      from_user_id: message.sender_id,
      to_user_id: message.recipient_id,
      payload: message.payload,
      delivered: true,
      created_at: message.created_at,
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return messages;
}

async function getConversations() {
  const myUserId = state.tokens.get(sessionStorage.getItem('access_token')) || 'user_alice';
  const conversations = Array.from(state.conversations.entries())
    .filter(([key]) => key.includes(myUserId))
    .map(([key, messageIds]) => {
      const participantIds = key.split('::').filter((id) => id !== myUserId);
      const otherId = participantIds[0] || myUserId;
      const otherUser = state.users.find((entry) => entry.id === otherId);
      const latestMessage = state.messages
        .filter((message) => messageIds.includes(message.id))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      return {
        user_id: otherUser ? otherUser.id : otherId,
        display_name: otherUser ? otherUser.display_name || otherUser.username : otherId,
        username: otherUser ? otherUser.username : otherId,
        last_message_at: latestMessage?.created_at || null,
      };
    })
    .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
  return conversations;
}

export const mockApi = {
  async request(method, url, body, config) {
    seedUsersIfNeeded();
    const pathParts = url.split('?')[0].split('/').filter(Boolean);

    if (method === 'post' && pathParts[0] === 'auth' && pathParts[1] === 'register') return postRegister(body);
    if (method === 'post' && pathParts[0] === 'auth' && pathParts[1] === 'login') return postLogin(body);
    if (method === 'post' && pathParts[0] === 'auth' && pathParts[1] === 'refresh') return postRefresh(body);
    if (method === 'post' && pathParts[0] === 'auth' && pathParts[1] === 'logout') return postLogout(body);
    if (method === 'get' && pathParts[0] === 'auth' && pathParts[1] === 'me') return getMe();
    if (method === 'get' && pathParts[0] === 'users' && pathParts[1] === 'me') return getMe();
    if (method === 'get' && pathParts[0] === 'users' && pathParts.length === 1) return getUsers();
    if (method === 'get' && pathParts[0] === 'users' && pathParts[1] === 'search') return searchUsers(pathParts, url);
    if (method === 'get' && pathParts[0] === 'users' && pathParts.at(-1) === 'public-key') return getPublicKey(pathParts);
    if (method === 'get' && pathParts[0] === 'conversations' && pathParts.length === 1) return getConversations();
    if (method === 'get' && pathParts[0] === 'conversations' && pathParts.at(-1) === 'messages') return getMessages(pathParts);
    if (method === 'post' && pathParts[0] === 'messages') return postMessage(body);

    throw new Error(`Mock endpoint not implemented: ${method.toUpperCase()} ${url}`);
  },
};
