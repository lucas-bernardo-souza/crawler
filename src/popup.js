let gravando = false;
let xmlTracer = '';

// Elementos da interface
const initTracerBtn = document.getElementById('initTracer');
const frameXML = document.getElementById('frameXML');
const loadXMLInput = document.getElementById('loadXML');
const initCrawlerBtn = document.getElementById('initCrawler');
const resetCrawlerBtn = document.getElementById('resetCrawler');

// Comunicação com o background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch(request.action){
        case "updatePopupUI":
            updatePopupUI();
            break;
        case "updateUI":
            updateUI();
            break;
    }
});

// === INICIALIZAÇÃO ===
document.addEventListener('DOMContentLoaded', async () => {
    await updateButtonState();
    await initializeTracerUI();
    setupEventListeners();
});

async function initializeTracerUI() {
    try {
        const result = await chrome.storage.local.get(['isRecording', 'tracerState']);
        gravando = result.isRecording || false;
        xmlTracer = result.tracerState ? result.tracerState.xmlTracer : '';
        updateUI();
    } catch (error) {
        console.error('Erro ao inicializar UI do tracer:', error);
    }
}

async function updateButtonState(){
    try{
        const result = await chrome.storage.local.get(['isCrawling', 'isRecording']);

        if(result.isCrawling){
            initCrawlerBtn.textContent = 'Rastreando...';
            initCrawlerBtn.disable = true;
            // Desativa o tracer se o crawler estiver ativo
            initTracerBtn.disable = true;
        } else {
            initCrawlerBtn.textContent = 'Iniciar Crawler';
            initCrawlerBtn.disable = false;
        }
        // Atualiza o estado do botão reset
        resetCrawlerBtn.disabled = !result.isCrawling && !result.isRecording;
    } catch(error){
        console.error('Erro ao atualizar estado do botão:', error);
    }
}

// === EVENT LISTENERS ===
function setupEventListeners() {
    // Botão iniciar/parar
    initCrawlerBtn.addEventListener('click', startCrawler);
    resetCrawlerBtn.addEventListener('click', resetCrawler);
    // Tracer listeners
    initTracerBtn.addEventListener('click', handleTracerToggle);
    // Input de arquivo XML
    loadXMLInput.addEventListener('change', handleFileSelect);
}

// Ouvinte para mensagens vindas do background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if(request.action === 'updatePopupUI'){
        updateButtonState();
        initializeTracerUI();
    }
});

// === CRAWLER FUNCTIONS ===
async function startCrawler(){
    try {
        const[tab] = await chrome.tabs.query({active: true, currentWindow: true});
        if(tab){
            let response = await chrome.runtime.sendMessage({
                action: "startCrawler",
                tabId: tab.id
            });
            // Atualiza a UI imediatamente
            initCrawlerBtn.textContent = 'Rastreando...';
            initCrawlerBtn.disabled = true;
            initTracerBtn.disabled = true;
            
            showMessage('Crawler iniciado!', 'success');
            //setTimeout(() => window.close(), 1000);
        }
    } catch (error) {
        console.error('Erro ao iniciar crawler:', error);
        showMessage('Erro ao iniciar crawler', 'error');
    }
}

async function resetCrawler() {
    try{
        // Envia uma mensagem para parar o crawler
        await chrome.runtime.sendMessage({action: "resetCrawler"});
        updatePopupUI();
        
    } catch (error){
        console.error('Erro ao resetar crawler: ', error);
        showMessage('Erro ao parar o crawler.', 'error');
    }
}

function updatePopupUI(){
    console.log('Crawler resetado com sucesso');
    showMessage('Crawler parado e estado reiniciado.', 'info');
    updateButtonState();
}

// === FUNÇÕES DO TRACER ===
async function handleTracerToggle() {
    const {isRecording} = await chrome.storage.local.get('isRecording');
    console.log("handleTracerToggle: ", isRecording);
    if(!isRecording){
        // Se não estiver gravando mostra a caixa de upload
        gravando = false;
        frameXML.style.display = 'block';
        initTracerBtn.textContent = 'Iniciar Rastreio';
    } else {
        // Se está monitorando interações, envia mensagem para parar e salvar
        showMessage('Processando e guardando arquivos...', 'info');
        const[tab] = await chrome.tabs.query({active: true, currentWindow: true});
        await chrome.runtime.sendMessage({action: "stopTracerAndSave", tabId: tab.id});
    }
}

function handleFileSelect(event) {
    console.log("handleFileSelect");
    const file = event.target.files[0];
    if(!file) return;


    if(file.name.split('.').pop().toLowerCase() !== 'xml'){
        showMessage('Formato inválido! Importe um arquivo XML.', 'error');
        return;
    }

    const reader = new FileReader();
    console.log("Chamando validateAndStartTracer");
    reader.onload = (e) => validateAndStartTracer(e.target.result);
    reader.onerror = () => showMessage('Erro ao ler arquivo.', 'error');
    reader.readAsText(file);
}

async function validateAndStartTracer(xmlContent) {
    console.log("Entrou em validadeAndStartTracer");
    //console.log("Recebeu como parâmetro: ", xmlContent);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    if(xmlDoc.getElementsByTagName('parsererror').length > 0){
        return showMessage('XML inválido ou malformado.', 'error');
    }
    const siteElement = xmlDoc.querySelector('site');
    if(!siteElement || siteElement.getAttribute('tipo') !== 'crawler'){
        return showMessage('Importe um XML gerado pelo Crawler!', 'error');
    }

    try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        console.log("Enviando mensagem: startTracer");

        // Envia o XML para o background, que vai gerir o início da gravação
        await chrome.runtime.sendMessage({
            action: "startTracer",
            tabId: tab.id,
            xmlTracer: xmlContent
        });

        showMessage('Tracer iniciado!', 'success');
    } catch (error){
        console.error('Erro ao enviar mensagem para iniciar tracer:', error);
        showMessage('Não foi possível iniciar o tracer.', 'error');
    }
}

async function updateUI(){
    const result = await chrome.storage.local.get(['isCrawling', 'isRecording']);
    // Desativa botões se o crawler estiver rodando
    if(result.isCrawling){
        initTracerBtn.disable = true;
        initCrawlerBtn.disable = true;
    } else {
        initTracerBtn.disable = result.isRecording;
        initCrawlerBtn.disable = false;
    }

    if(result.isRecording){
        frameXML.style.display = 'none';
        initTracerBtn.textContent = 'Parar e Salvar Rastreio';
        updateBrowserActionIcon('icon-play.png');
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