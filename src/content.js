class WebCrawler {
    constructor(){
        this.linksPorPai = [];
        this.linksAcessados = [];
        this.xmlSite = '';
        this.numPagina = 1;
        this.numComponente = 1;
        this.numEvento = 1;
        this.numState = 1;
        this.index = 'true';
        this.domain = new URL(window.location.href).hostname;
        this.DOM = [];
        this.itemAtual = 0;
        this.keepAliveInterval = null;
        this.timeoutId = null;

        // Timeout de segurança para evitar travamentos
        this.timeoutId = setTimeout(() => {
            console.warn("Timeout de segurança ativado");
            this.finalizaCrawler();
        }, 300000); // 5 minutos
    }

    async iniciar(){
        this.xmlSite = '<?xml version="1.0" encoding="UTF-8"?>\n';
        this.xmlSite += `<site url="${window.location.href}" titulo="${document.title}" tipo="crawler">\n\t<pages>\n\n`;

        // Configurar heartbeat
        this.setupHeartbeat();

        // Iniciar processamento
        this.processaDom();
    }

    setupHeartbeat() {
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        this.keepAliveInterval = setInterval(() => {
            chrome.runtime.sendMessage({ action: "keepAlive" }).catch(() => {});
        }, 15000);
    }

    rastrear() {
        this.processaDom();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if(request.action === "startCrawling"){
                this.iniciar();
                sendResponse({status: "iniciando"});
                return true;
            }
            if(request.action === "continueCrawling"){
                this.initializeState(request.crawlerState);
                this.rastrear();
                return true;
            }
            if(request.action === "contentScriptReady"){
                sendResponse({
                    shouldCrawl: true,
                    crawlerState: this.getCurrentState()
                });
                return true;
            }
        });
    }

    initializeState(state){
        this.linksPorPai = state.linksPorPai || [];
        this.linksAcessados = state.linksAcessados || [];
        this.xmlSite = state.xmlSite || '';
        this.numPagina = state.numPagina || 1;
        this.numComponente = state.numComponente || 1;
        this.numEvento = state.numEvento || 1;
        this.numState = state.numState || 1;
        this.index = state.index || 'true';
    }

    getCurrentState(){
        return{
            linksPorPai: this.linksPorPai,
            linksAcessados: this.linksAcessados,
            xmlSite: this.xmlSite,
            numPagina: this.numPagina,
            numComponente: this.numComponente,
            numEvento: this.numEvento,
            numState: this.numState,
            index: this.index
        };
    }
    
    processaDom(){
        try {
            // Coletar elementos do documento principal
            this.DOM = Array.from(document.body.querySelectorAll('*'));
            
            // Processar iframes
            const iframes = document.querySelectorAll('iframe');
            console.log(`Encontrados ${iframes.length} iframes`);
            
            for(const iframe of iframes){
                try {
                    if (iframe.contentDocument && iframe.contentDocument.body) {
                        const iframeElements = iframe.contentDocument.querySelectorAll('body *');
                        this.DOM.push(...Array.from(iframeElements));
                        console.log(`Adicionados ${iframeElements.length} elementos do iframe`);
                    }
                } catch(e) {
                    console.warn('Não foi possível acessar iframe:', e);
                }
            }

            console.log(`Total de elementos para processar: ${this.DOM.length}`);
            this.mapeiaProximoComponente();
        } catch (error) {
            console.error("Erro em processaDom:", error);
            this.finalizaCrawler();
        }
    }

    mapeiaProximoComponente(){
        if(this.itemAtual < this.DOM.length){
            this.mostrarStatus(`Rastreando Componente: ${this.itemAtual + 1} de ${this.DOM.length}`);
            this.mapeiaComponente(this.itemAtual);
            this.itemAtual++;
            setTimeout(()=> this.mapeiaProximoComponente(), 0);
        } else {
            this.xmlSite += '\t\t</page>\n\n';
            this.acessaProximoLink();
        }
    }

    mapeiaComponente(dom_id){
        const elemento = this.DOM[dom_id];
        if(!elemento || !elemento.tagName) return;

        const tag = elemento.tagName.toLowerCase();

        switch(tag){
            case 'a': 
                const url = elemento.href;
                if(url && url !== ''){
                    const externo = new URL(url, window.location.href).hostname !== this.domain;

                    let currentPageData = this.linksPorPai.find(p => p.id === this.numPagina);
                    if (!currentPageData) {
                        currentPageData = {id: this.numPagina, links: []};
                        this.linksPorPai.push(currentPageData);
                    }

                    const absoluteUrl = new URL(url, window.location.href).href;
                    if(!this.checkMedia(absoluteUrl) && !externo){
                        currentPageData.links.push({link: absoluteUrl, componente: this.numComponente});
                    }
                    
                    this.xmlSite += `\t\t\t<component type="link" dom_id="${dom_id}" node_id="${this.numPagina}" item_id="${this.numComponente}" name="${this.verificaVazio(elemento.textContent)}" externo="${externo}">\n`;
                    this.xmlSite += `\t\t\t\t<event name="click" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"><![CDATA[${elemento.getAttribute('href')}]]></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<event name="enter" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"><![CDATA[${elemento.getAttribute('href')}]]></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<state name="not visited" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += `\t\t\t\t<state name="visited" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += '\t\t\t</component>\n';
                    this.numComponente++;
                }
                break;

            case 'input':
                var tipo = elemento.type ? elemento.type.toLowerCase() : 'text';
                var botoes = ["button", "reset", "submit", "image"];
                var campos = ["text", "color", "date", "datetime", "datetime-local", "email", "month", "number", "file", "password", "search", "tel", "time", "url", "week", "hidden"];
                var checks = ["checkbox", "radio"];

                if(botoes.indexOf(tipo) != -1){
                    this.xmlSite += `\t\t\t<component type="button" dom_id="${dom_id}" node_id="${this.numPagina}" item_id="${this.numComponente}" name="${this.verificaVazio(elemento.getAttribute('name'))}">\n`;
                    this.xmlSite += `\t\t\t\t<event name="click" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<event name="enter" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<state name="selected" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += `\t\t\t\t<state name="notselected" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += '\t\t\t</component>\n';
                    this.numComponente++;
                } else if (campos.indexOf(tipo) != -1 || tipo === 'range'){
                    this.xmlSite += `\t\t\t<component type="input" dom_id="${dom_id}" node_id="${this.numPagina}" item_id="${this.numComponente}" name="${this.verificaVazio(elemento.getAttribute('name'))}">\n`;
                    this.xmlSite += `\t\t\t\t<event name="focus" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<event name="blur" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<event name="change" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<state name="empty" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += `\t\t\t\t<state name="notEmpty" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += `\t\t\t\t<state name="disabled" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += `\t\t\t\t<state name="readOnly" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += '\t\t\t</component>\n';
                    this.numComponente++;
                } else if (checks.indexOf(tipo) != -1){
                    this.xmlSite += `\t\t\t<component type="${tipo}" dom_id="${dom_id}" node_id="${this.numPagina}" item_id="${this.numComponente}" name="${this.verificaVazio(elemento.getAttribute('name'))}">\n`;
                    this.xmlSite += `\t\t\t\t<event name="click" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<event name="enter" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<state name="disabled" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += `\t\t\t\t<state name="notChecked" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += `\t\t\t\t<state name="checked" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += '\t\t\t</component>\n';
                    this.numComponente++;
                }
                break;

            case 'textarea':
            case 'select':
                this.xmlSite += `\t\t\t<component type="${tag}" dom_id="${dom_id}" node_id="${this.numPagina}" item_id="${this.numComponente}" name="${this.verificaVazio(elemento.getAttribute('name'))}">\n`;
                this.xmlSite += `\t\t\t\t<event name="focus" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                this.numEvento++;
                this.xmlSite += `\t\t\t\t<event name="blur" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                this.numEvento++;
                this.xmlSite += `\t\t\t\t<event name="change" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                this.numEvento++;
                this.xmlSite += `\t\t\t\t<state name="disabled" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                this.numState++;
                this.xmlSite += '\t\t\t</component>\n';
                this.numComponente++;
                break;

            case 'button':
                this.xmlSite += `\t\t\t<component type="button" dom_id="${dom_id}" node_id="${this.numPagina}" item_id="${this.numComponente}" name="${this.verificaVazio(elemento.getAttribute('name'))}">\n`;
                this.xmlSite += `\t\t\t\t<event name="click" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                this.numEvento++;
                this.xmlSite += `\t\t\t\t<event name="enter" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                this.numEvento++;
                this.xmlSite += `\t\t\t\t<state name="selected" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                this.numState++;
                this.xmlSite += `\t\t\t\t<state name="notselected" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                this.numState++;
                this.xmlSite += '\t\t\t</component>\n';
                this.numComponente++;
                break;
        }
    }

    verificaVazio(texto){
        if(texto !== undefined && texto !== null){
            const filter = /^(?!\s*$).+/;
            if(!filter.test(texto)){
                return "";
            } else {
                return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            }
        }else {
            return '';
        }
    }

    checkMedia(url){
        try{
            const path = new URL(url).pathname;
            return (path.match(/\.(jpeg|jpg|gif|png|mp3|svg|mp4|avi|pdf|doc|docx|xls|xlsx|ppt|pptx)$/i) !== null);
        } catch(e){
            return false;
        }
    }

    adicionaLinkAcessado(linkU){
        const url = new URL(linkU, window.location.origin).href.split('#')[0].split('?')[0];
        if(!this.linksAcessados.includes(url)){
            this.linksAcessados.push(url);
        }
    }

    verificaLinkAcessado(linkU) {
        const url = new URL(linkU, window.location.origin).href.split('#')[0].split('?')[0];
        return this.linksAcessados.includes(url);
    }
    
    acessaProximoLink(){
        console.log("Buscando próximo link...");
        console.log("Links por pai:", this.linksPorPai);
        console.log("Links acessados:", this.linksAcessados);

        let proximoLink = '';

        for(const page of this.linksPorPai){
            if (page.links) {
                for(const linkInfo of page.links){
                    if(!this.verificaLinkAcessado(linkInfo.link)){
                        proximoLink = linkInfo.link;
                        console.log("Próximo link encontrado:", proximoLink);
                        break;
                    }
                }
            }
            if(proximoLink) break;
        }

        if(proximoLink){
            console.log("Navegando para:", proximoLink);
            this.numPagina++;
            this.adicionaLinkAcessado(proximoLink);
            this.mostrarStatus(`Acessando Link: ${proximoLink}`);

            // Salvar estado atual antes de navegar
            chrome.storage.local.set({ 
                crawlerState: this.getCurrentState(),
                isCrawling: true
            }, () => {
                console.log("Estado salvo, navegando...");
                chrome.runtime.sendMessage({
                    action: "abrelink",
                    url: proximoLink,
                    crawlerState: this.getCurrentState()
                });
            });
        } else {
            console.log("Nenhum próximo link encontrado, finalizando...");
            this.finalizaCrawler();
        }
    }

    mostrarStatus(mensagem){
        document.querySelector('.crawlerLiviaStatus')?.remove();
        const statusDiv = document.createElement('div');
        statusDiv.className = 'crawlerLiviaStatus';
        statusDiv.style.cssText = 'position: fixed; left: 15px; top: 15px; z-index:99999999999999; ' + 
                                 'background-color: #000; width: 300px; padding: 20px; color: #fff; ' +
                                 'font-size: 15px; font-family: Arial, sans-serif; text-align: center;';
        statusDiv.textContent = mensagem;
        document.body.appendChild(statusDiv);
    }
    
    finalizaCrawler() {
        // Limpar timeout de segurança
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        this.xmlSite += '\t</pages>\n\n';
        this.xmlSite += '\t<edges>\n';
        
        // Gerar edges (conexões entre páginas)
        this.linksPorPai.forEach(page => {
            page.links.forEach(linkInfo => {
                const targetPageId = this.linksAcessados.indexOf(linkInfo.link) + 1;
                if (targetPageId > 0) {
                    this.xmlSite += `\t\t<edge source="${page.id}" target="${targetPageId}" ref_item_id="${linkInfo.componente}"/>\n`;
                }
            });
        });
        
        this.xmlSite += '\t</edges>\n';
        this.xmlSite += '</site>\n';
        
        this.salvarXML();
    }

    salvarXML(){
        try{
            const blob = new Blob([this.xmlSite], {type: "text/xml;charset=utf-8"});
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = 'site-map.xml';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // Limpar o objeto URL para liberar memória
            setTimeout(()=> URL.revokeObjectURL(url), 100);

            // Notificar o background que o crawler terminou
            chrome.runtime.sendMessage({action: "resetacrawler"});
        } catch (error){
            console.error('Erro ao salvar XML:', error);
        }
        
    }
    
}

let crawler = null;
let isInitialized = false;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCrawlerIfNeeded);
} else {
    initCrawlerIfNeeded();
}

async function initCrawlerIfNeeded() {
    try {
        const response = await chrome.runtime.sendMessage({ 
            action: "contentScriptReady" 
        });
        
        if (response && response.shouldCrawl) {
            crawler = new WebCrawler();
            crawler.initializeState(response.crawlerState);
            setTimeout(() => crawler.rastrear(), 1000);
        }
    } catch (error) {
        if (!error.message.includes("Could not establish connection")) {
            console.error("Erro ao inicializar crawler:", error);
        }
    }
}

// Listener para mensagens do background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startCrawling") {
        if (!crawler) {
            crawler = new WebCrawler();
            crawler.initializeState(request.crawlerState);
        }
        crawler.iniciar();
        sendResponse({ status: "iniciando" });
        return true;
    }
    
    if (request.action === "continueCrawling") {
        if (!crawler) {
            crawler = new WebCrawler();
        }
        crawler.initializeState(request.crawlerState);
        crawler.rastrear();
        sendResponse({ status: "continuando" });
        return true;
    }
    
    if (request.action === "contentScriptReady") {
        const response = crawler ? {
            shouldCrawl: true,
            crawlerState: crawler.getCurrentState()
        } : { shouldCrawl: false };
        
        sendResponse(response);
        return true;
    }
});

// Inicialização quando o content script carrega
(async () => {
    try {
        // Verificar se já estamos em um processo de crawling
        const response = await chrome.runtime.sendMessage({ action: "contentScriptReady" });
        if (response && response.shouldCrawl) {
            crawler = new WebCrawler();
            crawler.initializeState(response.crawlerState);
            setTimeout(() => crawler.rastrear(), 2000);
        }
    } catch (error) {
        if (!error.message.includes("Could not establish connection")) {
            console.error("Erro ao comunicar com o background script:", error);
        }
    }
})();