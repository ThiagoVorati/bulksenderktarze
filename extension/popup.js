const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const phoneColumnSelect = document.getElementById('phoneColumn');
const variableList = document.getElementById('variableList');
const preview = document.getElementById('preview');
const messageTemplateInput = document.getElementById('messageTemplate');
const insertNewLineBtn = document.getElementById('insertNewLine');
const delayInput = document.getElementById('delayInput');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusEl = document.getElementById('status');

let contacts = [];
let headers = [];
let currentCampaign = null;

const statusMessages = {
  idle: 'Pronto para iniciar uma campanha.',
  loading_contacts: 'Processando planilha...',
  preparing: 'Abrindo o WhatsApp Web...',
  running: 'Campanha em andamento.',
  stopping: 'Finalizando campanha...',
  stopped: 'Campanha interrompida pelo usuário.',
  finished: 'Campanha concluída com sucesso!',
  error: 'Ocorreu um erro durante o envio.'
};

function updateStatus(key, extra = '') {
  const message = statusMessages[key] || key;
  statusEl.textContent = extra ? `${message} ${extra}` : message;
  statusEl.className = `status ${key === 'error' ? 'error' : key === 'finished' ? 'success' : ''}`.trim();
}

function ensureControlsState() {
  const hasContacts = contacts.length > 0;
  const status = currentCampaign?.status;
  const isBusy = ['preparing', 'running', 'stopping'].includes(status);
  const canStop = ['preparing', 'running'].includes(status);
  startButton.disabled = !hasContacts || isBusy;
  stopButton.disabled = !canStop;
}

function createOption(value) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = value;
  return option;
}

function renderVariableList() {
  variableList.textContent = '';
  if (!headers.length) {
    variableList.innerHTML = '<span class="muted">Importe uma planilha para detectar variáveis.</span>';
    return;
  }
  headers.forEach((header) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'pill';
    pill.textContent = `{{${header}}}`;
    pill.addEventListener('click', () => insertAtCursor(messageTemplateInput, `{{${header}}}`));
    variableList.appendChild(pill);
  });
}

function insertAtCursor(textarea, value) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  textarea.value = `${text.substring(0, start)}${value}${text.substring(end)}`;
  const cursor = start + value.length;
  textarea.selectionStart = textarea.selectionEnd = cursor;
  textarea.focus();
  updatePreview();
}

function fillTemplate(template, data) {
  return template.replace(/\{\{(.*?)\}\}/g, (_, token) => {
    const key = token.trim();
    const value = data[key];
    return value != null ? value : '';
  });
}

function updatePreview() {
  if (!contacts.length) {
    preview.innerHTML = '<span class="muted">Nenhum contato carregado ainda.</span>';
    return;
  }
  const template = messageTemplateInput.value || '';
  const phoneColumn = phoneColumnSelect.value;
  const firstContact = contacts[0];
  const message = fillTemplate(template, firstContact);
  const phone = phoneColumn ? firstContact[phoneColumn] : '—';
  preview.innerHTML = `
    <strong>Exemplo para ${firstContact[phoneColumn] || 'primeiro contato'}:</strong>
    <pre>${message}</pre>
    <div class="muted">Telefone: ${phone}</div>
  `;
}

async function parseSpreadsheet(file) {
  updateStatus('loading_contacts');
  const buffer = await file.arrayBuffer();
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch (error) {
    console.error(error);
    updateStatus('error', 'Não foi possível ler o arquivo. Verifique se é um Excel válido.');
    return;
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  contacts = rows;
  headers = Object.keys(rows[0] || {});
  phoneColumnSelect.innerHTML = '';
  headers.forEach((header) => phoneColumnSelect.appendChild(createOption(header)));
  fileInfo.textContent = `${file.name} • ${rows.length} contatos`;
  renderVariableList();
  updatePreview();
  updateStatus('idle');
  ensureControlsState();
}

fileInput.addEventListener('change', (event) => {
  const [file] = event.target.files;
  contacts = [];
  headers = [];
  phoneColumnSelect.innerHTML = '';
  variableList.textContent = '';
  preview.innerHTML = '';
  if (!file) {
    fileInfo.textContent = '';
    updateStatus('idle');
    ensureControlsState();
    return;
  }
  parseSpreadsheet(file);
});

messageTemplateInput.addEventListener('input', updatePreview);
phoneColumnSelect.addEventListener('change', updatePreview);
insertNewLineBtn.addEventListener('click', () => insertAtCursor(messageTemplateInput, '\n'));

startButton.addEventListener('click', async () => {
  if (!contacts.length) {
    updateStatus('error', 'Importe uma planilha antes de iniciar.');
    return;
  }
  const phoneColumn = phoneColumnSelect.value;
  if (!phoneColumn) {
    updateStatus('error', 'Selecione a coluna de telefone.');
    return;
  }
  const template = messageTemplateInput.value.trim();
  if (!template) {
    updateStatus('error', 'Escreva uma mensagem.');
    return;
  }
  const delaySeconds = Number.parseInt(delayInput.value, 10);
  if (Number.isNaN(delaySeconds) || delaySeconds < 1) {
    updateStatus('error', 'Informe um intervalo de tempo válido.');
    return;
  }
  updateStatus('preparing');
  startButton.disabled = true;
  chrome.runtime.sendMessage(
    {
      type: 'startCampaign',
      payload: {
        contacts,
        headers,
        template,
        phoneColumn,
        delayMs: delaySeconds * 1000
      }
    },
    (response) => {
      if (chrome.runtime.lastError) {
        updateStatus('error', chrome.runtime.lastError.message);
        ensureControlsState();
        return;
      }
      if (!response?.ok) {
        updateStatus('error', response?.message || 'Não foi possível iniciar a campanha.');
        ensureControlsState();
        return;
      }
      currentCampaign = response.campaign;
      ensureControlsState();
    }
  );
});

stopButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'stopCampaign' }, (response) => {
    if (chrome.runtime.lastError) {
      updateStatus('error', chrome.runtime.lastError.message);
      return;
    }
    if (!response?.ok) {
      updateStatus('error', response?.message || 'Não foi possível parar a campanha.');
      return;
    }
    updateStatus('stopping');
    currentCampaign = response.campaign;
    ensureControlsState();
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'campaignUpdate') {
    currentCampaign = message.campaign;
    updateStatus(message.status, message.detail);
    ensureControlsState();
  }
});

function requestStatus() {
  chrome.runtime.sendMessage({ type: 'getCampaignStatus' }, (response) => {
    if (response?.campaign) {
      currentCampaign = response.campaign;
      updateStatus(response.campaign.status, response.campaign.detail);
      ensureControlsState();
    } else {
      updateStatus('idle');
      ensureControlsState();
    }
  });
}

requestStatus();
