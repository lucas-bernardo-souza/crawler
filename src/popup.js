let gravando = false;
let xmlTracer = '';
let xmlFinalTracer = '';
let xmlInteracoes = '';
let numInteracoes = 1;
let tempoInteracao = 0;
let executando = false;

// Elementos da interface
const initTracerBtn = document.getElementById('initTracer');
const frameXML = document.getElementById('frameXML');
const loadXMLInput = document.getElementById('loadXML');
const initCrawlerBtn = document.getElementById('initCrawler');
const resetCrawlerBtn = document.getElementById('resetCrawler');

// === INICIALIZAÇÃO ===
document.addEventListener('DOMContentLoaded', function() {
    initializeTracer();
    setupEventListeners();
    updateButtonState();
});

async function initializeTracer() {
    try {
        // Carregar estado do storage
        const result = await chrome.storage.local.get([
            'gravando', 'xmlTracer', 'xmlFinalTracer', 
            'xmlInteracoes', 'numInteracoes', 'tempoInteracao'
        ]);

        if (result.gravando !== undefined) {
            gravando = result.gravando;
            xmlTracer = result.xmlTracer || '';
            xmlFinalTracer = result.xmlFinalTracer || '';
            xmlInteracoes = result.xmlInteracoes || '';
            numInteracoes = result.numInteracoes || 1;
            tempoInteracao = result.tempoInteracao || 0;

            updateUI();
        }
    } catch (error) {
        console.error('Erro ao inicializar tracer:', error);
    }
}

// === EVENT LISTENERS ===
function setupEventListeners() {
    // Botão iniciar/parar tracer
    initCrawlerBtn.addEventListener('click', startCrawler);
    resetCrawlerBtn.addEventListener('click', resetCrawler);
    
    // Tracer listeners
    initTracerBtn.addEventListener('click', handleTracerToggle);
    // Input de arquivo XML
    loadXMLInput.addEventListener('change', handleFileSelect);
}

// === CRAWLER FUNCTIONS ===
async function startCrawler(){
    const[tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if(tab){
        chrome.runtime.sendMessage({
            action: "startCrawler",
            tabId: tab.id
        });
        initCrawlerBtn.textContent = 'Rastreando...';
        initCrawlerBtn.disabled = true;
    }
}

async function resetCrawler() {
    try{
        // Envia uma mensagem para parar o crawler
        await chrome.runtime.sendMessage({action: "resetCrawler"});

        // Atualiza a UI
        initCrawlerBtn.textContent = 'Iniciar Crawler';
        initCrawlerBtn.disabled = false;
        console.log('Crawler resetado com sucesso');
    } catch (error){
        console.error('Erro ao resetar crawler: ', error);
    }
}

// Essa função atualiza o estado do botão com base no armazenamento
async function updateButtonState() {
    try {
        const result = await chrome.storage.local.get('isCrawling');
        const isCrawling = result.isCrawling;
        if (isCrawling) {
            initCrawlerBtn.textContent = 'Rastreando...';
            initCrawlerBtn.disabled = true;
        } else {
            initCrawlerBtn.textContent = 'Iniciar Crawler';
            initCrawlerBtn.disabled = false;
        }
    } catch (error) {
        console.error('Erro ao acessar storage:', error);
    }
}

// === FUNÇÕES DO TRACER ===
async function handleTracerToggle() {
    if (!gravando) {
        // Iniciar tracer
        gravando = true;
        resetTracerState();
        frameXML.style.display = 'block';
        initTracerBtn.textContent = 'Parar Rastreio';
        await saveTracerState();
        updateBrowserActionIcon('icon-play.png');
        
    } else {
        // Parar tracer
        frameXML.style.display = 'none';
        initTracerBtn.textContent = 'Iniciar Rastreio';
        gravando = false;
        
        if (xmlFinalTracer) {
            // Salvar XML final se houver dados
            await sendSaveXMLMessage();
        } else {
            // Apenas resetar estado
            resetTracerState();
            await saveTracerState();
        }
        
        updateBrowserActionIcon('icon.png');
    }
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const extension = file.name.split('.').pop().toLowerCase();
    if (extension !== 'xml') {
        showMessage('Formato inválido! Importe um arquivo XML.', 'error');
        resetFileInput();
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const xmlContent = e.target.result;
            await validateAndStartTracer(xmlContent, file.name);
        } catch (error) {
            console.error('Erro ao processar arquivo:', error);
            showMessage('Erro ao processar arquivo XML.', 'error');
            resetFileInput();
        }
    };

    reader.onerror = function() {
        showMessage('Erro ao ler arquivo.', 'error');
        resetFileInput();
    };

    reader.readAsText(file);
}

async function validateAndStartTracer(xmlContent, fileName) {
    try {
        // Verificar se é um XML válido do crawler
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
        
        // Verificar erros de parsing
        if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
            showMessage('XML inválido ou malformado.', 'error');
            resetFileInput();
            return;
        }

        const siteElement = xmlDoc.querySelector('site');
        if (!siteElement || siteElement.getAttribute('tipo') !== 'crawler') {
            showMessage('Importe um XML gerado pelo Crawler!', 'error');
            resetFileInput();
            return;
        }

        // Verificar se o XML é para o site atual
        const currentTab = await getCurrentTab();
        const currentUrl = new URL(currentTab.url);
        const xmlUrl = new URL(siteElement.getAttribute('url'));
        
        if (currentUrl.hostname !== xmlUrl.hostname) {
            showMessage('Importe um XML do Crawler gerado para este site!', 'error');
            resetFileInput();
            return;
        }

        // Tudo validado, iniciar tracer
        xmlTracer = xmlContent;
        frameXML.style.display = 'none';
        initTracerBtn.textContent = 'Parar Rastreio';
        gravando = true;
        
        await saveTracerState();
        updateBrowserActionIcon('icon-play.png');
        
        // Enviar mensagem para background script iniciar tracer
        const tab = await getCurrentTab();
        await chrome.runtime.sendMessage(tab.id, {
            action: "iniciarGravacao",
            gravando: gravando,
            xmlTracer: xmlTracer
        });
        
        showMessage('Tracer iniciado com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro na validação do XML:', error);
        showMessage('Erro ao validar arquivo XML.', 'error');
        resetFileInput();
    }
}

async function sendSaveXMLMessage() {
    try {
        const tab = await getCurrentTab();
        await chrome.runtime.sendMessage(tab.id, {
            action: "salvarXMLTracer",
            xmlFinalTracer: xmlFinalTracer,
            xmlInteracoes: xmlInteracoes,
            gravando: false, // Para parar a gravação
            xmlTracer: xmlTracer,
            numInteracoes: numInteracoes,
            tempoInteracao: tempoInteracao
        });
        
        // Resetar estado local
        gravando = false;
        resetTracerState();
        await saveTracerState();
        
    } catch (error) {
        console.error('Erro ao enviar mensagem de salvamento:', error);
    }
}

async function saveTracerState() {
    try {
        await chrome.storage.local.set({
            gravando: gravando,
            xmlTracer: xmlTracer,
            xmlFinalTracer: xmlFinalTracer,
            xmlInteracoes: xmlInteracoes,
            numInteracoes: numInteracoes,
            tempoInteracao: tempoInteracao
        });
    } catch (error) {
        console.error('Erro ao salvar estado:', error);
    }
}

function resetTracerState() {
    if (!gravando) {
        xmlTracer = '';
        xmlFinalTracer = '';
        xmlInteracoes = '';
        numInteracoes = 1;
        tempoInteracao = 0;
    }
}

function resetFileInput() {
    loadXMLInput.value = '';
}

function updateUI() {
    if (gravando) {
        if (xmlTracer) {
            frameXML.style.display = 'none';
            initTracerBtn.textContent = 'Parar Rastreio';
            updateBrowserActionIcon('icon-play.png');
        } else {
            frameXML.style.display = 'block';
            initTracerBtn.textContent = 'Iniciar Rastreio';
            updateBrowserActionIcon('icon.png');
        }
    } else {
        frameXML.style.display = 'none';
        initTracerBtn.textContent = 'Iniciar Rastreio';
        updateBrowserActionIcon('icon.png');
    }
}

function updateBrowserActionIcon(iconPath) {
    try {
        chrome.action.setIcon({
            path: {
                "16": `icons/${iconPath}`,
                "48": `icons/${iconPath}`,
                "128": `icons/${iconPath}`
            }
        });
    } catch (error) {
        console.error('Erro ao atualizar ícone:', error);
    }
}

function showMessage(message, type = 'info') {
    // Remover mensagens anteriores
    const existingMessages = document.querySelectorAll('.tracer-message');
    existingMessages.forEach(msg => msg.remove());
    
    // Criar nova mensagem
    const messageDiv = document.createElement('div');
    messageDiv.className = `tracer-message ${type}`;
    messageDiv.style.cssText = `
        text-align: center;
        margin-top: 10px;
        padding: 8px;
        border-radius: 4px;
        font-size: 12px;
        ${type === 'error' ? 'background-color: #ffebee; color: #c62828; border: 1px solid #ef9a9a;' : 
        type === 'success' ? 'background-color: #e8f5e8; color: #2e7d32; border: 1px solid #a5d6a7;' : 
        'background-color: #e3f2fd; color: #1565c0; border: 1px solid #90caf9;'}
    `;
    messageDiv.textContent = message;
    
    // Adicionar ao DOM
    const container = document.querySelector('.janela') || document.body;
    container.appendChild(messageDiv);
    
    // Remover após 3 segundos
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }, 3000);
}

async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

// === MESSAGE LISTENER ===
// (ENVIADA AO BACKGROUND)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateTracerState") {
        gravando = request.gravando;
        xmlTracer = request.xmlTracer;
        updateUI();
        sendResponse({ status: "success" });
    }
    
    if (request.action === "tracerError") {
        showMessage(request.message, 'error');
        sendResponse({ status: "received" });
    }

    if(request.action === 'crawlerFinished'){
        updateButtonState();
    }
    
    return true;
});