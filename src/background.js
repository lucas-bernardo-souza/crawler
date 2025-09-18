// Gerenciador de estado e comunicação
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Carregando o content na página
    chrome.scripting.executeScript({
        target: {tabId: request.tabId},
        files: ['crawler.js', 'tracer.js','content.js']
    });

    switch(request.action){
        // Ação do popup: Inicia o processo de crawling
        // função síncrona
        case "startCrawler":
            console.log('Recebeu a mensagem startCrawler');
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
        // Aguarda um pouco para garantir que o content script está pronto
        await new Promise(resolve => setTimeout(resolve, 300));
        const { isCrawling, crawlerState, isRecording, tracerState } = await chrome.storage.local.get(['isCrawling', 'crawlerState', 'isRecording', 'tracerState']);

        // Se estiver fanzendo CRAWLING, envia a mensagem para continuar
        if (isCrawling && crawlerState) {
            await sendMessageToTab(tabId, {
                action: "continueCrawling",
                crawlerState: crawlerState
            });
        }
        // Se estiver GRAVANDO, envia a mensagem para continuar
        else if (isRecording && tracerState) {
            await sendMessageToTab(tabId, {
                action: "continueRecording",
                tracerState: tracerState
            });
        }
    }
});

// Função auxiliar para esperar o content script ficar pronto
async function waitForContentScriptReady(tabId, timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const response = await chrome.tabs.sendMessage(tabId, {action: "ping"});
            if (response && response.status === "ready") {
                return true;
            }
        } catch (e) {
            // Ignora erros e continua tentando
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    return false;
}

// Funções de inicialização
async function startCrawling(tabId) {
    // Limpa estados anteriores
    console.log('Iniciou a função startCrawling - Background.js');
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

    const tab = await chrome.tabs.get(tabId);
    if(tab){
        console.log('Aba existe e acessível, mandando mensagem');
        await chrome.tabs.sendMessage(tabId, {
            action: "startCrawling",
            crawlerState: initialState
        });
    }
    
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

    // Recarrega a aba
    await chrome.tabs.reload(tabId);
    
    // Aguarda o content script estar pronto após o recarregamento
    const isReady = await waitForContentScriptReady(tabId, 10000);
    
    if (isReady) {
        // Agora envia a mensagem para iniciar a gravação
        await sendMessageToTab(tabId, {
            action: "iniciarGravacao",
            gravando: true,
            xmlTracer: xmlTracer,
            tabid: tabId
        });
    } else {
        console.error("Content script não ficou pronto após recarregamento");
    }
}

async function isContentScriptInjected(tabId) {
    try {
        // Tenta enviar um ping para verificar se o content script está lá
        await chrome.tabs.sendMessage(tabId, {action: "ping"});
        return true;
    } catch (e) {
        return false;
    }
}

async function sendMessageToTab(tabId, message, retries = 5, delay = 500){
    console.log(`Tentando enviar mensagem para aba ${tabId}:`, message.action);
    for(let i = 0; i < retries; i++){
        try{
            const tab = await chrome.tabs.get(tabId);
            console.log(`Aba ${tabId} status:`, tab.status, 'URL:', tab.url);

            if(!tab){
                throw new Error(`Aba ${tabId} não exisite`);
            }


            const restrictedPatterns = ['chrome://', 'about:', 'edge://', 'opera://', 'vivaldi://', 'brave://'];
            const isRestricted = restrictedPatterns.some(pattern => tab.url && tab.url.startsWith(pattern));
            if (isRestricted) {
                console.warn('URL não suportada para content scripts:', tab.url);
                return false;
            }

            // Verificar se a página está completamente carregada
            if (tab.status !== 'complete') {
                throw new Error('Página ainda não carregou completamente');
            }

            // Verifica se o content script está injetado
            if (!await isContentScriptInjected(tabId)) {
                throw new Error('Content script não está injetado nesta aba');
            }
            
            await chrome.tabs.sendMessage(tabId, message);
            return true;

        } catch(e){
            if(i === retries -1){
                console.error(`Não foi possível enviar a mensagem para a aba ${tabId} após ${retries} tentativas. Erro:`, e);
                return false;
            }
            // Backoff exponencial
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
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
    await sendMessageToTab(tabId, { action: "salvarXMLTracer" });
}