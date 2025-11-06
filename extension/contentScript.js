const WAIT_TIMEOUT = 20000;

const SELECTORS = {
  composer: 'div[data-testid="conversation-compose-box-input"]',
  alternativeComposer: 'div[contenteditable="true"][data-tab="10"]',
  sendButton: 'button[data-testid="compose-btn-send"]',
  sendButtonLegacy: 'span[data-icon="send"]'
};

function waitForSelector(selector, timeout = WAIT_TIMEOUT) {
  const existing = document.querySelector(selector);
  if (existing) {
    return Promise.resolve(existing);
  }
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let timer = null;
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        if (timer) {
          clearTimeout(timer);
        }
        observer.disconnect();
        resolve(element);
      } else if (Date.now() - start > timeout) {
        if (timer) {
          clearTimeout(timer);
        }
        observer.disconnect();
        reject(new Error(`Tempo esgotado aguardando elemento: ${selector}`));
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Tempo esgotado aguardando elemento: ${selector}`));
    }, timeout);
  });
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setComposerText(composer, text) {
  const lines = text.split(/\r?\n/);
  const html = lines
    .map((line) => (line.length ? escapeHtml(line) : ''))
    .join('<br>');
  composer.innerHTML = html || '';
  const inputEvent = new InputEvent('input', { bubbles: true });
  composer.dispatchEvent(inputEvent);
}

function clickSendButton() {
  const button = document.querySelector(SELECTORS.sendButton);
  if (button) {
    button.click();
    return true;
  }
  const legacy = document.querySelector(SELECTORS.sendButtonLegacy);
  if (legacy) {
    const parentButton = legacy.closest('button');
    if (parentButton) {
      parentButton.click();
      return true;
    }
    legacy.click();
    return true;
  }
  return false;
}

function extractPhoneFromLocation() {
  const url = new URL(window.location.href);
  const phone = url.searchParams.get('phone');
  return phone || '';
}

async function notifyComposerReady() {
  try {
    await waitForComposer();
    const phone = extractPhoneFromLocation();
    chrome.runtime.sendMessage({ type: 'contentReady', phone, ok: true });
  } catch (error) {
    chrome.runtime.sendMessage({ type: 'contentReady', phone: extractPhoneFromLocation(), ok: false, error: error.message });
    throw error;
  }
}

async function waitForComposer() {
  try {
    return await waitForSelector(SELECTORS.composer);
  } catch (error) {
    return waitForSelector(SELECTORS.alternativeComposer);
  }
}

async function deliverMessage(payload) {
  try {
    const composer = await waitForComposer();
    composer.focus();
    setComposerText(composer, payload.message);
    const clicked = clickSendButton();
    if (!clicked) {
      throw new Error('Não foi possível localizar o botão de envio.');
    }
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'messageResult', phone: payload.phone, success: true });
    }, 1200);
  } catch (error) {
    chrome.runtime.sendMessage({ type: 'messageResult', phone: payload.phone, success: false, error: error.message });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'deliverMessage') {
    deliverMessage(message.payload);
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

notifyComposerReady().catch(() => {});
