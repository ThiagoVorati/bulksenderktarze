let campaign = null;
let lastCampaignSummary = null;
let delayTimer = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'startCampaign':
      startCampaign(message.payload)
        .then((response) => sendResponse(response))
        .catch((error) => sendResponse({ ok: false, message: error.message }));
      return true;
    case 'stopCampaign':
      sendResponse(stopCampaign());
      return true;
    case 'getCampaignStatus':
      sendResponse({ campaign: serializeCampaign(campaign) || lastCampaignSummary });
      return true;
    case 'contentReady':
      handleContentReady(sender.tab?.id, message);
      sendResponse({ ok: true });
      return true;
    case 'messageResult':
      handleMessageResult(sender.tab?.id, message);
      sendResponse({ ok: true });
      return true;
    default:
      break;
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (campaign && tabId === campaign.tabId) {
    finalizeCampaign('error', 'A aba do WhatsApp Web foi fechada.');
  }
});

async function startCampaign(payload) {
  if (!payload) {
    throw new Error('Dados da campanha inválidos.');
  }
  if (campaign && !['finished', 'error', 'stopped'].includes(campaign.status)) {
    return { ok: false, message: 'Já existe uma campanha em andamento.' };
  }
  if (!payload.contacts?.length) {
    return { ok: false, message: 'Nenhum contato recebido.' };
  }
  campaign = {
    id: Date.now(),
    createdAt: Date.now(),
    contacts: payload.contacts,
    template: payload.template,
    phoneColumn: payload.phoneColumn,
    delayMs: payload.delayMs ?? 6000,
    index: 0,
    status: 'preparing',
    detail: 'Abrindo o WhatsApp Web…',
    stopRequested: false,
    tabId: null,
    currentContact: null
  };
  broadcastStatus('preparing', 'Abrindo o WhatsApp Web…');
  ensureWhatsAppTab().catch((error) => {
    finalizeCampaign('error', `Não foi possível abrir o WhatsApp Web: ${error.message}`);
  });
  return { ok: true, campaign: serializeCampaign(campaign) };
}

function stopCampaign() {
  if (!campaign) {
    return { ok: false, message: 'Não há campanha em execução.' };
  }
  campaign.stopRequested = true;
  campaign.status = 'stopping';
  campaign.detail = 'Campanha será interrompida após a próxima etapa.';
  if (delayTimer) {
    clearTimeout(delayTimer);
    delayTimer = null;
  }
  broadcastStatus('stopping', 'Finalizando campanha...');
  return { ok: true, campaign: serializeCampaign(campaign) };
}

async function ensureWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  if (campaign?.stopRequested) {
    return;
  }
  if (tabs.length) {
    const tab = tabs[0];
    campaign.tabId = tab.id;
    await chrome.tabs.update(tab.id, { active: true });
    processNextContact();
  } else {
    const tab = await chrome.tabs.create({ url: 'https://web.whatsapp.com/' });
    campaign.tabId = tab.id;
    campaign.detail = 'Faça login no WhatsApp Web se necessário.';
    broadcastStatus('preparing', campaign.detail);
    // Aguarda carregamento inicial antes de iniciar processamento
    setTimeout(() => {
      if (campaign && !campaign.stopRequested) {
        processNextContact();
      }
    }, 6000);
  }
}

function handleContentReady(tabId, message) {
  if (!campaign || tabId !== campaign.tabId) {
    return;
  }
  if (!campaign.currentContact) {
    return;
  }
  if (message?.ok === false) {
    finalizeCampaign('error', message.error || 'O WhatsApp Web não ficou pronto para o envio.');
    return;
  }
  const expectedPhone = campaign.currentContact.phone;
  if (message.phone !== expectedPhone) {
    return;
  }
  deliverMessage();
}

function handleMessageResult(tabId, message) {
  if (!campaign || tabId !== campaign.tabId) {
    return;
  }
  if (!message.success) {
    finalizeCampaign('error', message.error || 'O envio falhou.');
    return;
  }
  campaign.index += 1;
  campaign.currentContact = null;
  if (campaign.stopRequested) {
    finalizeCampaign('stopped', 'Campanha interrompida pelo usuário.');
    return;
  }
  if (campaign.index >= campaign.contacts.length) {
    finalizeCampaign('finished', 'Todas as mensagens foram enviadas.');
    return;
  }
  broadcastStatus('running', `Próximo envio em ${(campaign.delayMs / 1000).toFixed(0)} segundos.`);
  delayTimer = setTimeout(() => {
    delayTimer = null;
    processNextContact();
  }, campaign.delayMs);
}

function processNextContact() {
  if (!campaign || campaign.stopRequested) {
    if (campaign?.stopRequested) {
      finalizeCampaign('stopped', 'Campanha interrompida pelo usuário.');
    }
    return;
  }
  if (!campaign.contacts?.length) {
    finalizeCampaign('error', 'Lista de contatos vazia.');
    return;
  }
  if (campaign.index >= campaign.contacts.length) {
    finalizeCampaign('finished', 'Todas as mensagens foram enviadas.');
    return;
  }
  if (!campaign.tabId) {
    ensureWhatsAppTab();
    return;
  }
  const contact = campaign.contacts[campaign.index];
  const phoneRaw = contact?.[campaign.phoneColumn];
  const phone = sanitizePhone(String(phoneRaw ?? ''));
  if (!phone) {
    campaign.index += 1;
    broadcastStatus('running', `Contato sem número válido ignorado. (${campaign.index}/${campaign.contacts.length})`);
    processNextContact();
    return;
  }
  const messageText = fillTemplate(campaign.template, contact);
  campaign.currentContact = {
    phone,
    message: messageText,
    index: campaign.index,
    total: campaign.contacts.length
  };
  broadcastStatus('running', `Enviando para ${phone} (${campaign.index + 1}/${campaign.contacts.length})`);
  chrome.tabs
    .update(campaign.tabId, {
      url: `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}`,
      active: true
    })
    .catch((error) => {
      finalizeCampaign('error', `Não foi possível acessar a aba do WhatsApp: ${error.message}`);
    });
}

function deliverMessage() {
  if (!campaign?.currentContact || !campaign.tabId) {
    return;
  }
  chrome.tabs
    .sendMessage(campaign.tabId, {
      type: 'deliverMessage',
      payload: {
        phone: campaign.currentContact.phone,
        message: campaign.currentContact.message,
        index: campaign.currentContact.index + 1,
        total: campaign.currentContact.total
      }
    })
    .catch((error) => {
      finalizeCampaign('error', `Falha ao enviar mensagem ao conteúdo: ${error.message}`);
    });
}

function sanitizePhone(phone) {
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length >= 8 ? digits : '';
}

function fillTemplate(template, data) {
  return template.replace(/\{\{(.*?)\}\}/g, (_, token) => {
    const key = token.trim();
    const value = data[key];
    return value != null ? String(value) : '';
  });
}

function finalizeCampaign(status, detail) {
  if (!campaign) {
    return;
  }
  if (delayTimer) {
    clearTimeout(delayTimer);
    delayTimer = null;
  }
  campaign.status = status;
  campaign.detail = detail;
  const summary = serializeCampaign(campaign);
  lastCampaignSummary = summary;
  broadcastStatus(status, detail, summary);
  campaign = null;
}

function broadcastStatus(status, detail, summaryOverride) {
  if (campaign) {
    campaign.status = status;
    campaign.detail = detail;
  }
  const payload = summaryOverride || serializeCampaign(campaign);
  chrome.runtime.sendMessage(
    {
      type: 'campaignUpdate',
      status,
      detail,
      campaign: payload
    },
    () => chrome.runtime.lastError
  );
}

function serializeCampaign(data) {
  if (!data) {
    return null;
  }
  return {
    id: data.id,
    createdAt: data.createdAt,
    status: data.status,
    detail: data.detail,
    index: data.index,
    total: data.contacts?.length ?? 0,
    stopRequested: Boolean(data.stopRequested)
  };
}
