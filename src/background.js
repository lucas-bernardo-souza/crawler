chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    
    // Ação para o popup iniciar o crawler na primeira página
    if (request.action === "startCrawler") {
        startCrawling(request.tabId);
        return true;
    }

    if (request.action === "abrelink") {
        chrome.storage.local.set({ crawlerState: request.crawlerState }, () => {
            chrome.tabs.update(sender.tab.id, { url: request.url });
        });
        // Não precisamos de sendResponse aqui, mas retornamos true para indicar que o canal pode ser usado.
        return true;
    }

    // Ação para o content script avisar que o crawler terminou
    if (request.action === "resetacrawler") {
        chrome.storage.local.remove(['crawlerState', 'isCrawling']);
        chrome.runtime.sendMessage({ action: 'crawlerFinished' });
        return true;
    }
    
    // Ação para o content script verificar se deve continuar o rastreamento
    if (request.action === "contentScriptReady") {
        chrome.storage.local.get(['isCrawling', 'crawlerState'], ({ isCrawling, crawlerState }) => {
            if (isCrawling && crawlerState) {
                sendResponse({ shouldCrawl: true, crawlerState: crawlerState });
            } else {
                sendResponse({ shouldCrawl: false });
            }
        });
        return true; 
    }
    
    // Ação para manter o service worker ativo
    if (request.action === "keepAlive") {
        sendResponse({ status: "alive" });
        return true;
    }

    // Ação para resetar o crawler
    if(request.action === 'resetCrawler'){
        await chrome.storage.local.remove(['isCrawling', 'crawlerState']);
        chrome.runtime.sendMessage({action: 'crawlerFinished'});
        return true;
    }

    // Ação para iniciar o tracer
    if(request.action === "startTracer"){
        try{
            await chrome.tabs.sendMessage(request.tabId, {
                action: "iniciarGravacao",
                gravando: true,
                xmlTracer: request.xmlTracer
            });
            sendResponse({status: "tracer_started"});
        } catch(error){
            console.log("Erro ao iniciar tracer:", error);
            sendResponse({status: "error", message: error.message});
        }
        return true;
    }

    if(request.action === "iniciarGravacao"){
        await chrome.storage.local.set({
            gravando: request.gravando,
            xmlTracer: request.xmlTracer
        });
        sendResponse({status: "gravacao_iniciada"});
        return true;
    }

    if(request.action === "salvarXMLTracer"){
        await chrome.storage.local.set({
            xmlFinalTracer: request.xmlFinalTracer,
            xmlInteracoes: request.xmlInteracoes,
            gravando: request.gravando,
            xmlTracer: request.xmlTracer,
            numInteracoes: request.numInteracoes,
            tempoInteracao: request.tempoInteracao
        });
        sendResponse({status: "xml_salvo"});
        return true;
    }

    if(request.action === "gravarStatus"){
        await chrome.storage.local.set({
            gravando: request.gravando,
            xmlTracer: request.xmlTracer
        });
        sendResponse({status: "status_atualizado"});
        return true;
    }
});


async function startCrawling(tabId) {
    try {
        await chrome.storage.local.set({ isCrawling: true });
        const initialState = {
            linksPorPai: [],
            linksAcessados: [],
            xmlSite: '<?xml version="1.0" encoding="UTF-8"?>\n',
            numPagina: 1,
            numComponente: 1,
            numEvento: 1,
            numState: 1,
            index: "true"
        };
        await chrome.storage.local.set({ crawlerState: initialState });

        // Aguarda a próxima página carregar completamente
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verificar se a aba ainda existe e está acessivel
        const tab = await chrome.tabs.get(tabId);
        if(tab){
            await chrome.tabs.sendMessage(tabId, {
                action: "startCrawling",
                crawlerState: initialState
            });
        }
    } catch (e){
        console.error("Erro ao iniciar crawler: ", e);
    }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url !== 'chrome://newtab/') {
        try {
            const { isCrawling, crawlerState } = await chrome.storage.local.get(['isCrawling', 'crawlerState']);
            
            if (isCrawling && crawlerState) {
                // Aguardar um pouco mais para garantir que o content script esteja pronto
                setTimeout(async () => {
                    try {
                        await chrome.tabs.sendMessage(tabId, {
                            action: "continueCrawling",
                            crawlerState: crawlerState
                        });
                    } catch (e) {
                        console.log("Aguardando content script carregar...");
                        // Tentar novamente após um delay
                        setTimeout(async () => {
                            try {
                                await chrome.tabs.sendMessage(tabId, {
                                    action: "continueCrawling",
                                    crawlerState: crawlerState
                                });
                            } catch (e2) {
                                console.error("Não foi possível enviar mensagem para content script:", e2);
                            }
                        }, 1000);
                    }
                }, 500);
            }
        } catch (e) {
            console.error("Erro ao verificar estado do crawler:", e);
        }
    }
});