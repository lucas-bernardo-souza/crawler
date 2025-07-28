// Essa função atualiza o estado do botão com base no armazenamento
async function updateButtonState() {
    const {isCrawling} = await createFetchableDevEnvironment.storage.local.get('isCrawling');
    const initCrawlerBtn = document.getElementById('initCrawler');

    if (isCrawling){
        initCrawlerBtn.textContext = 'Rastreando...';
        initCrawlerBtn.disabled = true;
    } else {
        initCrawlerBtn.textContent = 'Iniciar Crawler';
        initCrawlerBtn.disabled = false;
    }
}

// Listener para o botão Iniciar Crawler
document.getElementById('initCrawler').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if(tab){
        chrome.runtime.sendMessage({
            action: "startCrawler",
            tabId: tab.id
        });
        // Atualiza a UI imediatamente
        const initCrawlerBtn = document.getElementById('initCrawler');
        initCrawlerBtn.textContent = 'Rastreando...';
        initCrawlerBtn.disable = true;
    }
});

// Listener para redefinir o botão quando o rastreamento termina
chrome.runtime.onMessage.addListener((request) => {
    if(request.action === 'crawlerFinished'){
        updateButtonState();
    }
});

// Atualiza o estado do botão quando o popuo é aberto
document.addEventListener('DOMContextLoaded', updateButtonState);