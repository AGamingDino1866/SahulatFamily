// Global read-aloud functionality (text-to-speech) powered by Cloudflare Workers AI via /api/tts
let currentReadAloudAudio = null;

const stopSpeaking = () => {
  if (currentReadAloudAudio) {
    currentReadAloudAudio.pause();
    if (currentReadAloudAudio.src) URL.revokeObjectURL(currentReadAloudAudio.src);
    currentReadAloudAudio = null;
  }
};

const isSpeaking = () => !!currentReadAloudAudio && !currentReadAloudAudio.paused;

let readAloudToastTimeout = null;
const showReadAloudError = (message) => {
  let toast = document.getElementById('read-aloud-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'read-aloud-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.style.cssText = `
      position: fixed;
      bottom: 90px;
      right: 24px;
      max-width: 280px;
      background: #8b3a3a;
      color: #fff;
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 0.85rem;
      font-weight: 700;
      line-height: 1.4;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      z-index: 1000;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(readAloudToastTimeout);
  readAloudToastTimeout = setTimeout(() => { toast.style.display = 'none'; }, 6000);
};

// Speaks text using the site's Workers AI-backed /api/tts endpoint.
// Returns the playing Audio element (or null on failure) so callers can hook 'ended'/'error'.
// On failure, also shows a brief visible toast - previously failures only logged to the
// console, so read-aloud looked like it silently "did nothing" with no way to tell why.
const speakText = async (text) => {
  stopSpeaking();
  if (!text || !text.trim()) return null;

  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: text.trim() })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const message = err.error || `Read-aloud failed (error ${response.status}).`;
      console.error('TTS error:', message);
      showReadAloudError(message);
      return null;
    }

    const blob = await response.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    currentReadAloudAudio = audio;
    audio.addEventListener('ended', () => {
      if (currentReadAloudAudio === audio) currentReadAloudAudio = null;
      URL.revokeObjectURL(audio.src);
    });
    await audio.play();
    return audio;
  } catch (e) {
    console.error('TTS request failed:', e);
    showReadAloudError('Could not reach the read-aloud service. Check your connection and try again.');
    return null;
  }
};

// Initialize read-aloud button on page load
document.addEventListener('DOMContentLoaded', () => {
  // Check if button already exists
  if (document.getElementById('global-read-aloud-btn')) return;

  // Create floating read-aloud button
  const btn = document.createElement('button');
  btn.id = 'global-read-aloud-btn';
  btn.type = 'button';
  btn.textContent = '🔊';
  btn.setAttribute('aria-label', 'Read page aloud');
  btn.title = 'Read page aloud (press to start/stop)';
  btn.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: #2c2c85;
    color: white;
    border: none;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(44, 44, 133, 0.3);
    z-index: 999;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  `;

  // Hover effect
  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.1)';
    btn.style.boxShadow = '0 8px 24px rgba(44, 44, 133, 0.4)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 4px 16px rgba(44, 44, 133, 0.3)';
  });

  const resetButton = () => {
    btn.style.background = '#2c2c85';
    btn.setAttribute('aria-pressed', 'false');
  };

  // Read page content
  btn.addEventListener('click', async () => {
    if (isSpeaking()) {
      stopSpeaking();
      resetButton();
      return;
    }

    // Get main content to read. Elements marked data-no-read-aloud (e.g. Urdu text -
    // the site's TTS voice doesn't support Urdu) are temporarily hidden so innerText skips them.
    const mainContent = document.querySelector('main') || document.body;
    const skipped = Array.from(mainContent.querySelectorAll('[data-no-read-aloud]'));
    const previousDisplay = skipped.map((el) => el.style.display);
    skipped.forEach((el) => { el.style.display = 'none'; });
    const text = mainContent.innerText;
    skipped.forEach((el, i) => { el.style.display = previousDisplay[i]; });

    if (text.trim()) {
      btn.style.background = '#d56b91';
      btn.setAttribute('aria-pressed', 'true');
      const audio = await speakText(text);
      if (!audio) {
        resetButton();
        return;
      }
      audio.addEventListener('ended', resetButton);
      audio.addEventListener('error', resetButton);
    }
  });

  // Handle stop on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isSpeaking()) {
      stopSpeaking();
      resetButton();
    }
  });

  document.body.appendChild(btn);
});
