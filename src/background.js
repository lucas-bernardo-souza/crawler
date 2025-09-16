// Gerenciador de estado e comunicação
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch(request.action){
        // Ação do popup: Inicia o processo de crawling
        // função síncrona
        case "startCrawler":
            startCrawling(request.tabId);
            sendResponse({status: "iniciando_crawler"});
            break;
        // Ação do popup: Inicia o processo de gravação do tracer
        // função síncrona
        case "startTracer":
            startRecording(request.tabId, request.xmlTracer);
            sendResponse({status: "iniciando_tracer"});
            break;
        // Ação do crawler - Pede para navegar para um novo link
        case "abreLink":
            chrome.storage.local.set({crawlerState: request.crawlerState}, () => {
                chrome.tabs.update(sender.tab.id, {url: request.url});
            });
            break;
        case "stopTracerAndSave":
            stopAndSaveRecording(sender.tab.id);
            sendResponse({status: "solicitando_salvamento"});
            break;
        case "resetCrawler":
            resetState();
            chrome.runtime.sendMessage({action: 'updatePopupUI'});
            sendResponse({status: "crawler_resetado"});
            break;
        // Ação do content script: pergunta o que fazer ao ser carregado para uma nova página
        case "contentScriptLoaded":
            chrome.storage.local.get(['isCrawling', 'crawlerState', 'isRecording', 'tracerState'], (result) => {
                if(result.isCrawling && result.crawlerState){
                    sendResponse({shouldCrawl: true, crawlerState: result.crawlerState});
                } else if(result.isRecording && result.tracerState){
                    sendResponse({shouldRecord: true, tracerState: result.tracerState});
                } else {
                    sendResponse({});
                }
            });
            // resposta assíncrona
            return true;
        case "abreLink":
            chrome.storage.local.set({crawlerState: request.crawlerState}, () => {
                chrome.tabs.update(sender.tab.id, {url: request.url});
            });
            break;
        case "processFinished":
            resetState();
            chrome.runtime.sendMessage({action: 'updatePopupUI'});
            break;
        // Ação do Tracer (content): Pede para salvar o estado atual
        case "saveTracerState":
            chrome.storage.local.set({tracerState: request.tracerState});
            break;
        // Ação para manter o service worker ativo
        case "keepAlive":
            sendResponse({status: "alive"});
            break;
    }
    return true;
});

// Navegação e persistência
chrome.tabs.onUpdated.addListener(async(tabId, changeInfo, tab) => {
    // Garante que a lógica só executa quando a página está completamente carregada
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
        const { isCrawling, crawlerState, isRecording, tracerState } = await chrome.storage.local.get(['isCrawling', 'crawlerState', 'isRecording', 'tracerState']);

        // Se estiver fanzendo CRAWLING, envia a mensagem para continuar
        if (isCrawling && crawlerState) {
            sendMessageToTab(tabId, {
                action: "continueCrawling",
                crawlerState: crawlerState
            });
        }
        // Se estiver GRAVANDO, envia a mensagem para continuar
        else if (isRecording && tracerState) {
             sendMessageToTab(tabId, {
                action: "continueRecording",
                tracerState: tracerState
            });
        }
    }
});

// Funções de inicialização
async function startCrawling(tabId) {
    // Limpa estados anteriores
    await chrome.storage.local.clear();

    const initialState = {
        linksPorPai: [],
        linksAcessados: [],
        xmlSite: '',
        numPagina: 1,
        numComponente: 1,
        numEvento: 1,
        numState: 1,
        index: "true",
        numEdge: 1
    };
    await chrome.storage.local.set({isCrawling: true, crawlerState: initialState});

    sendMessageToTab(tabId, {
        action: "startCrawling",
        crawlerState: initialState
    });
}

async function startRecording(tabId, xmlTracer){
    // Limpa estados anteriores
    await resetState();

    const initialState = {
        gravando: true,
        xmlTracer: xmlTracer,
        xmlFinalTracer: '',
        xmlInteracoes: '',
        numInteracoes: 1,
        tempoInteracao: 0
    };

    await chrome.storage.local.set({isRecording: true, tracerState: initialState});

    chrome.tabs.reload(tabId);
}

async function sendMessageToTab(tabId, message, retries = 3){
    for(let i = 0; i < retries; i++){
        try{
            await chrome.tabs.sendMessage(tabId, message);
            return;
        } catch(e){
            if(i === retries -1){
                console.error(`Não foi possível enviar a mensagem para a aba ${tabId} após ${retries} tentativas. Erro:`, e);
            } else {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
}

async function initializeState() {
    const result = await chrome.storage.local.get(['isCrawling', 'crawlerState', 'isRecording', 'tracerState']);
    
    // Se o crawler estava rodando, atualiza a UI do popup
    if (result.isCrawling) {
        chrome.runtime.sendMessage({action: 'updatePopupUI'});
    }
}

// Limpa o estado de qualquer tarefa em andamento.
async function resetState() {
    await chrome.storage.local.remove(['isCrawling', 'crawlerState', 'isRecording', 'tracerState']);
    console.log("Estado da extensão foi resetado.");
}

// Envia a ordem para o content script salvar o ficheiro.
async function stopAndSaveRecording(tabId) {
    sendMessageToTab(tabId, { action: "salvarXMLTracer" });
}