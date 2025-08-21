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
});


async function startCrawling(tabId) {
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

    // Envia a mensagem inicial para a primeira página
    // É importante esperar um pouco para garantir que a aba esteja pronta para receber
    setTimeout(() => {
        try {
            chrome.tabs.sendMessage(tabId, {
                action: "startCrawling",
                crawlerState: initialState
            });
        } catch(e) {
            console.error("Não foi possível enviar a mensagem inicial.", e);
        }
    }, 200);
}