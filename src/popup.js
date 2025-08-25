// Função para resetar o crawler
async function resetCrawler() {
    try{
        // Envia uma mensagem para parar o crawler
        await chrome.runtime.sendMessage({action: "resetCrawler"});

        // Atualiza a UI
        const initCrawlerBtn = document.getElementById('initCrawler');
        initCrawlerBtn.textContent = 'Iniciar Crawler';
        initCrawlerBtn.disable = false;

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
        const initCrawlerBtn = document.getElementById('initCrawler');

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
        initCrawlerBtn.disabled = true;
    }
});

// Listener para o botão Iniciar Tracer
document.getElementById('initTracer').addEventListener('click', async () => {
    
})

// Listener para o botão resetar
document.getElementById('resetCrawler').addEventListener('click', resetCrawler);

// Listener para redefinir o botão quando o rastreamento termina
chrome.runtime.onMessage.addListener((request) => {
    if(request.action === 'crawlerFinished'){
        updateButtonState();
    }
});

// Atualiza o estado do botão quando o popuo é aberto
document.addEventListener('DOMContentLoaded', updateButtonState);