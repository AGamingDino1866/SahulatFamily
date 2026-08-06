import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
      import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
      import { getFirestore, doc, getDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

      
      const app=initializeApp(firebaseConfig);
      const auth=getAuth(app);
      const db=getFirestore(app);
      const provider=new GoogleAuthProvider();
      provider.setCustomParameters({prompt:'select_account'});

      const form = document.querySelector('#ai-form');
      const question = document.querySelector('#ai-question');
      const chatWindow = document.querySelector('#chat-window');
      const accountState = document.querySelector('#ai-account-state');
      const messagesLeft = document.querySelector('#messages-left');
      const signinButton = document.querySelector('#ai-signin');
      const signoutButton = document.querySelector('#ai-signout');
      const askButton = document.querySelector('#ask-button');
      const chatSelect = document.querySelector('#chat-select');
      const newChatButton = document.querySelector('#new-chat');
      const deleteChatButton = document.querySelector('#delete-chat');
      let currentUser = null;
      let currentChatId = null;
      const unlimitedAiEmail = 'sahulatfamilypk@gmail.com';
      const hasUnlimitedAi = (user) => String(user?.email || '').trim().toLowerCase() === unlimitedAiEmail;

      const welcomeMessage = 'Hi, I am Sahulat AI. Ask me a question about your form.';
      const storageKey = 'successFactorAiChats:v1';
      const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
      const usageDoc = (user) => doc(db, 'ai_usage', `${user.uid}_${todayKey()}`);
      const readChats = () => JSON.parse(localStorage.getItem(storageKey) || '[]');
      const writeChats = (chats) => localStorage.setItem(storageKey, JSON.stringify(chats.slice(0, 20)));
      const makeChat = () => ({ id: crypto.randomUUID(), title: 'New Ask AI chat', createdAt: Date.now(), updatedAt: Date.now(), messages: [{ role: 'ai', text: welcomeMessage }] });
      const getCurrentChat = () => readChats().find((chat) => chat.id === currentChatId);
      const getRecentHistory = () => (getCurrentChat()?.messages || []).filter((item) => item.text !== welcomeMessage).slice(-12).map((item) => ({ role: item.role === 'ai' ? 'assistant' : 'user', content: item.text }));
      const saveCurrentChat = (updater) => {
        const chats = readChats();
        const index = chats.findIndex((chat) => chat.id === currentChatId);
        if (index === -1) return;
        chats[index] = updater(chats[index]);
        chats.sort((a, b) => b.updatedAt - a.updatedAt);
        writeChats(chats);
        renderChatSelect();
      };
      const setLeft = (value) => { messagesLeft.textContent = value === Infinity ? 'Unlimited' : String(Math.max(0, value)); };
      const appendMessage = (role, text, loading = false, save = true) => {
        const row = document.createElement('div');
        row.className = `chat-row ${role}`;
        const bubble = document.createElement('div');
        bubble.className = `bubble${loading ? ' loading' : ''}`;
        bubble.textContent = text;
        row.appendChild(bubble);
        chatWindow.appendChild(row);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        if (save && !loading) saveMessage(role, text);
        return bubble;
      };
      const saveMessage = (role, text) => {
        saveCurrentChat((chat) => {
          const messages = [...chat.messages, { role, text }].slice(-80);
          const firstUser = messages.find((message) => message.role === 'user')?.text;
          return { ...chat, title: firstUser ? firstUser.slice(0, 48) : chat.title, updatedAt: Date.now(), messages };
        });
      };
      const renderChat = () => {
        const chat = getCurrentChat();
        chatWindow.innerHTML = '';
        (chat?.messages || [{ role: 'ai', text: welcomeMessage }]).forEach((message) => appendMessage(message.role, message.text, false, false));
      };
      const renderChatSelect = () => {
        const chats = readChats();
        chatSelect.innerHTML = chats.map((chat) => `<option value="${chat.id}">${chat.title || 'Ask AI chat'}</option>`).join('');
        chatSelect.value = currentChatId;
      };
      const startChat = (chat = makeChat()) => {
        const chats = readChats().filter((item) => item.id !== chat.id);
        currentChatId = chat.id;
        writeChats([chat, ...chats]);
        renderChatSelect();
        renderChat();
      };
      const loadInitialChat = () => {
        const chats = readChats();
        if (chats.length) {
          currentChatId = chats[0].id;
          renderChatSelect();
          renderChat();
        } else {
          startChat();
        }
      };

      const refreshCounter = async (user) => {
        if (!user) { setLeft(150); return; }
        if (hasUnlimitedAi(user)) { setLeft(Infinity); return; }
        const snap = await getDoc(usageDoc(user));
        const count = snap.exists() ? Number(snap.data().count || 0) : 0;
        setLeft(150 - count);
      };

      const reserveDailyMessage = async (user) => {
        if (hasUnlimitedAi(user)) return Infinity;
        return runTransaction(db, async (transaction) => {
          const ref = usageDoc(user);
          const snap = await transaction.get(ref);
          const count = snap.exists() ? Number(snap.data().count || 0) : 0;
          if (count >= 150) throw new Error('You used all your questions for today. Come back tomorrow.');
          const nextCount = count + 1;
          transaction.set(ref, { uid: user.uid, email: user.email, date: todayKey(), count: nextCount, updated_at: serverTimestamp() }, { merge: true });
          return 150 - nextCount;
        });
      };

      loadInitialChat();
      chatSelect.addEventListener('change', () => { currentChatId = chatSelect.value; renderChat(); });
      newChatButton.addEventListener('click', () => startChat());
      deleteChatButton.addEventListener('click', () => {
        const chats = readChats().filter((chat) => chat.id !== currentChatId);
        writeChats(chats);
        if (chats.length) {
          currentChatId = chats[0].id;
          renderChatSelect();
          renderChat();
        } else {
          startChat();
        }
      });
      signinButton.addEventListener('click', async () => { await signInWithPopup(auth, provider); });
      signoutButton.addEventListener('click', async () => { await signOut(auth); });
      onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        signinButton.hidden = Boolean(user);
        signoutButton.hidden = !user;
        if (user) {
          accountState.textContent = `Signed in as ${user.email}`;
          await refreshCounter(user);
        } else {
          accountState.textContent = 'Sign in to use AI help.';
          setLeft(150);
        }
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = question.value.trim();
        if (!message) return;
        if (!currentUser) {
          appendMessage('ai', 'Sign in with Google first.');
          return;
        }
        appendMessage('user', message);
        question.value = '';
        const loadingBubble = appendMessage('ai', 'Thinking...', true, false);
        askButton.disabled = true;
        try {
          const remaining = await reserveDailyMessage(currentUser);
          setLeft(remaining);
          const token = await currentUser.getIdToken();
          const response = await fetch('/api/ask-ai', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-firebase-token': token },
            body: JSON.stringify({ message, history: getRecentHistory() })
          });
          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            throw new Error('AI is not live yet. Try again later.');
          }
          const payload = await response.json();
          if (!response.ok || !payload.ok) throw new Error(payload.error || 'AI is not ready yet.');
          loadingBubble.classList.remove('loading');
          loadingBubble.textContent = payload.answer;
          saveMessage('ai', payload.answer);
        } catch (error) {
          const errorText = error.message.replace('Firebase: ', '');
          loadingBubble.classList.remove('loading');
          loadingBubble.textContent = errorText;
          saveMessage('ai', errorText);
          await refreshCounter(currentUser).catch(() => {});
        } finally {
          askButton.disabled = false;
          question.focus();
          chatWindow.scrollTop = chatWindow.scrollHeight;
        }
      });
