class WebCrawler {
    constructor() {
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
        this.numEdge = 1;

        // Timeout de segurança para evitar travamentos
        this.timeoutId = setTimeout(() => {
            console.warn("Timeout de segurança ativado");
            this.finalizaCrawler();
        }, 300000); // 5 minutos
    }

    async iniciar() {
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
            chrome.runtime.sendMessage({ action: "keepAlive" }).catch(() => { });
        }, 15000);
    }

    rastrear() {
        this.processaDom();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "startCrawling") {
                this.iniciar();
                sendResponse({ status: "iniciando" });
                return true;
            }
            if (request.action === "continueCrawling") {
                this.initializeState(request.crawlerState);
                this.rastrear();
                return true;
            }
            if (request.action === "contentScriptReady") {
                sendResponse({
                    shouldCrawl: true,
                    crawlerState: this.getCurrentState()
                });
                return true;
            }
        });
    }

    initializeState(state) {
        this.linksPorPai = state.linksPorPai || [];
        this.linksAcessados = state.linksAcessados || [];
        this.xmlSite = state.xmlSite || '';
        this.numPagina = state.numPagina || 1;
        this.numComponente = state.numComponente || 1;
        this.numEvento = state.numEvento || 1;
        this.numState = state.numState || 1;
        this.index = state.index || 'true';
    }

    getCurrentState() {
        return {
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

    processaDom() {
        try {
            // Coletar elementos do documento principal
            this.DOM = Array.from(document.body.querySelectorAll('*'));

            // Processar iframes
            const iframes = document.querySelectorAll('iframe');
            console.log(`Encontrados ${iframes.length} iframes`);

            for (const iframe of iframes) {
                try {
                    if (iframe.contentDocument && iframe.contentDocument.body) {
                        const iframeElements = iframe.contentDocument.querySelectorAll('body *');
                        this.DOM.push(...Array.from(iframeElements));
                        console.log(`Adicionados ${iframeElements.length} elementos do iframe`);
                    }
                } catch (e) {
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

    mapeiaProximoComponente() {
        if (this.itemAtual < this.DOM.length) {
            this.mostrarStatus(`Rastreando Componente: ${this.itemAtual + 1} de ${this.DOM.length}`);
            this.mapeiaComponente(this.itemAtual);
            this.itemAtual++;
            setTimeout(() => this.mapeiaProximoComponente(), 0);
        } else {
            this.xmlSite += '\t\t</page>\n\n';
            this.acessaProximoLink();
        }
    }

    mapeiaComponente(dom_id) {
        const elemento = this.DOM[dom_id];
        if (!elemento || !elemento.tagName) return;

        const tag = elemento.tagName.toLowerCase();

        switch (tag) {
            case 'a':
                const url = elemento.href;
                if (url && url !== '') {
                    const externo = new URL(url, window.location.href).hostname !== this.domain;

                    let currentPageData = this.linksPorPai.find(p => p.id === this.numPagina);
                    if (!currentPageData) {
                        currentPageData = { id: this.numPagina, links: [] };
                        this.linksPorPai.push(currentPageData);
                    }

                    const absoluteUrl = new URL(url, window.location.href).href;
                    if (!this.checkMedia(absoluteUrl) && !externo) {
                        currentPageData.links.push({ 
                            link: absoluteUrl, 
                            componente: this.numComponente,
                            evento: this.numEvento,       
                            evento2: this.numEvento + 1    
                        });
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

                if (botoes.indexOf(tipo) != -1) {
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
                } else if (campos.indexOf(tipo) != -1 || tipo === 'range') {
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
                } else if (checks.indexOf(tipo) != -1) {
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

    verificaVazio(texto) {
        if (texto !== undefined && texto !== null) {
            const filter = /^(?!\s*$).+/;
            if (!filter.test(texto)) {
                return "";
            } else {
                return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            }
        } else {
            return '';
        }
    }

    checkMedia(url) {
        try {
            const path = new URL(url).pathname;
            return (path.match(/\.(jpeg|jpg|gif|png|mp3|svg|mp4|avi|pdf|doc|docx|xls|xlsx|ppt|pptx)$/i) !== null);
        } catch (e) {
            return false;
        }
    }

    adicionaLinkAcessado(linkU) {
        const url = new URL(linkU, window.location.origin).href.split('#')[0].split('?')[0];
        if (!this.linksAcessados.includes(url)) {
            this.linksAcessados.push(url);
        }
    }

    verificaLinkAcessado(linkU) {
        const url = new URL(linkU, window.location.origin).href.split('#')[0].split('?')[0];
        return this.linksAcessados.includes(url);
    }

    acessaProximoLink() {
        console.log("Buscando próximo link...");
        console.log("Links por pai:", this.linksPorPai);
        console.log("Links acessados:", this.linksAcessados);

        let proximoLink = '';

        for (const page of this.linksPorPai) {
            if (page.links) {
                for (const linkInfo of page.links) {
                    if (!this.verificaLinkAcessado(linkInfo.link)) {
                        proximoLink = linkInfo.link;
                        console.log("Próximo link encontrado:", proximoLink);
                        break;
                    }
                }
            }
            if (proximoLink) break;
        }

        if (proximoLink) {
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

    mostrarStatus(mensagem) {
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
        // Finalizar a página atual com eventos e estados de página
        this.xmlSite += '\t\t<event name="onLoad" node_id="'+this.numPagina+'" item_id="null" event_id="'+this.numEvento+'"/>\n';
        this.numEvento++;
        
        this.xmlSite += '\t\t<state name="onLoad" node_id="'+this.numPagina+'" item_id="null" state_id="'+this.numState+'"/>\n';
        this.numState++;
        
        this.xmlSite += '\t\t<state name="Load" node_id="'+this.numPagina+'" item_id="null" state_id="'+this.numState+'"/>\n';
        this.numState++;
        
        this.xmlSite += '\t\t</page>\n\n';

        // Limpar timeout de segurança
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        // Fecha a seção de páginas
        this.xmlSite += '\t</pages>\n\n';

        // Iniciar a seção de edges com contador
        this.xmlSite += '\t<edges>\n';
        let numEdge = 1;

        // Gerar edges (conexões entre páginas)
        this.linksPorPai.forEach(page => {
            if (page.links) {
                page.links.forEach(linkInfo => {
                    // Verificar se o link foi acessado e encontrar o ID da página destino
                    const normalizedLink = this.normalizeLinkUrl(linkInfo.link);
                    const targetPageId = this.linksAcessados.findIndex(link => 
                        this.normalizeLinkUrl(link) === normalizedLink
                    ) + 1;
                    
                    if (targetPageId > 0 && linkInfo.evento && linkInfo.evento2) {
                        // Formato COMPATÍVEL com o tracer original
                        this.xmlSite += `\t\t<edge ed_id="${numEdge}" source="${page.id}" target="${targetPageId}" ref_item_id="${linkInfo.componente}">\n`;
                        this.xmlSite += `\t\t\t<data event_id="${linkInfo.evento}">click</data>\n`;
                        this.xmlSite += `\t\t\t<data event_id="${linkInfo.evento2}">enter</data>\n`;
                        this.xmlSite += '\t\t</edge>\n';
                        numEdge++;
                    }
                });
            }
        });

        this.xmlSite += '\t</edges>\n';
        this.xmlSite += '</site>\n';

        this.salvarXML();
    }

    salvarXML() {
        try {
            const blob = new Blob([this.xmlSite], { type: "text/xml;charset=utf-8" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = 'site-map.xml';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // Limpar o objeto URL para liberar memória
            setTimeout(() => URL.revokeObjectURL(url), 100);

            // Notificar o background que o crawler terminou
            chrome.runtime.sendMessage({ action: "resetacrawler" });
        } catch (error) {
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

// Início da implementação do Tracer
// Verificar possibilidade de separar essas duas classes em dois arquivos
class WebTracer {
    constructor() {
        this.gravando = false;
        this.xmlTracer = '';
        this.xmlFinalTracer = '';
        this.xmlInteracoes = '';
        this.numInteracoes = 1;
        this.tempoInteracao = 0;
        this.domAtual = '';
        this.xmlJquery = null;
        this.domain = new URL(window.location.href).hostname;

        this.setupMessageListener();
        this.initializeFromStorage();
    }

    // === COMUNICAÇÃO DO TRACER COM O BACKGROUND ===

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "startRecording") {
                this.gravando = true;
                this.xmlTracer = request.xmlTracer;
                this.iniciaTracer();
                sendResponse({ status: "recording_started" });
                return true;
            }

            if (request.action === "stopRecording") {
                this.gravando = false;
                this.salvarXMLTracer();
                sendResponse({ status: "recording_stopped" });
                return true;
            }

            if (request.action === "tracerContentScriptReady") {
                sendResponse({
                    shouldRecord: this.gravando,
                    tracerState: this.getCurrentState()
                });
                return true;
            }
        });
    }

    getCurrentState() {
        return {
            xmlFinalTracer: this.xmlFinalTracer,
            xmlInteracoes: this.xmlInteracoes,
            gravando: this.gravando,
            xmlTracer: this.xmlTracer,
            numInteracoes: this.numInteracoes,
            tempoInteracao: this.tempoInteracao
        };
    }
    // ========================

    async initializeFromStorage() {
        try {
            const result = await chrome.storage.local.get([
                'xmlFinalTracer', 'xmlInteracoes', 'gravando',
                'xmlTracer', 'numInteracoes', 'tempoInteracao'
            ]);

            if (result.xmlFinalTracer) {
                this.xmlFinalTracer = result.xmlFinalTracer;
                this.xmlInteracoes = result.xmlInteracoes;
                this.gravando = result.gravando;
                this.xmlTracer = result.xmlTracer;
                this.numInteracoes = result.numInteracoes;
                this.tempoInteracao = result.tempoInteracao;

                if (this.gravando) {
                    this.continuaTracer();
                }
            }
        } catch (error) {
            console.error('Erro ao inicializar tracer do storage:', error);
        }
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "iniciarGravacao") {
                this.gravando = request.gravando;
                this.xmlTracer = request.xmlTracer;

                chrome.storage.local.set({
                    xmlFinalTracer: this.xmlFinalTracer,
                    xmlInteracoes: this.xmlInteracoes,
                    gravando: this.gravando,
                    xmlTracer: this.xmlTracer,
                    numInteracoes: this.numInteracoes,
                    tempoInteracao: this.tempoInteracao
                }, () => {
                    this.iniciaTracer(request.tabid);
                    sendResponse({ status: "gravacao_iniciada" });
                });
                return true;
            }

            if (request.action === "salvarXMLTracer") {
                this.xmlFinalTracer = request.xmlFinalTracer;
                this.xmlInteracoes = request.xmlInteracoes;
                this.gravando = request.gravando;
                this.xmlTracer = request.xmlTracer;
                this.numInteracoes = request.numInteracoes;
                this.tempoInteracao = request.tempoInteracao;

                this.salvarXMLTracer();
                sendResponse({ status: "xml_salvo" });
                return true;
            }
        });
    }

    iniciaTracer(tabid) {
        this.domAtual = document.body.innerHTML;
        const urlMapa = window.location.href;
        const titulo = document.title;

        // Parse do XML do crawler
        const parser = new DOMParser();
        this.xmlJquery = parser.parseFromString(this.xmlTracer, "text/xml");

        this.xmlFinalTracer = '<?xml version="1.0" encoding="UTF-8"?>\n';
        this.xmlFinalTracer += `<site url="${urlMapa}" titulo="${titulo}" tipo="tracer">\n`;
        this.xmlFinalTracer += '\t<pages>\n';
        this.xmlFinalTracer += this.xmlTracer.match(/<pages>([\s\S]*?)<\/pages>/)[1];
        this.xmlFinalTracer += '\t</pages>\n';

        this.xmlInteracoes = '\t<interactions>\n';

        this.monitorarEventos();
    }

    continuaTracer() {
        this.domAtual = document.body.innerHTML;
        const parser = new DOMParser();
        this.xmlJquery = parser.parseFromString(this.xmlTracer, "text/xml");
        this.monitorarEventos();
    }

    monitorarEventos() {
        this.atualizaDinamicos();

        // Monitorar clicks em links
        document.body.addEventListener('click', (e) => {
            this.handleClickEvent(e);
        });

        // Monitorar eventos de teclado
        document.body.addEventListener('keypress', (e) => {
            this.handleKeypressEvent(e);
        });

        // Monitorar mudanças em formulários
        document.body.addEventListener('change', (e) => {
            this.handleChangeEvent(e);
        });
    }

    handleClickEvent(e) {
        const elemento = e.target;
        const tagName = elemento.tagName.toLowerCase();
        const timeStamp = Math.floor(e.timeStamp);

        if (tagName === 'a') {
            this.handleLinkClick(elemento, e, timeStamp);
        } else if (tagName === 'input') {
            this.handleInputClick(elemento, e, timeStamp);
        } else if (tagName === 'button') {
            this.handleButtonClick(elemento, timeStamp, 'click');
        }
    }

    handleLinkClick(elemento, e, timeStamp) {
        const url = elemento.href;
        if (!url) return;

        e.preventDefault();
        e.stopPropagation();

        const isExterno = new URL(url).hostname !== this.domain;

        if (!isExterno) {
            this.insereInteracoes(
                Array.from(document.body.querySelectorAll('*')).indexOf(elemento),
                url,
                timeStamp,
                'page',
                'click'
            );

            this.tempoInteracao = timeStamp;
            this.salvarEstado(() => {
                window.location.href = url;
            });
        } else {
            if (confirm('Este link te levará para fora da página e encerrará o tracer. Tem certeza que deseja encerrá-lo?')) {
                this.insereInteracoes(
                    Array.from(document.body.querySelectorAll('*')).indexOf(elemento),
                    url,
                    timeStamp,
                    'page',
                    'click'
                );

                this.tempoInteracao = timeStamp;
                this.salvarEstado(() => {
                    this.salvarXMLTracer();
                });
            }
        }
    }

    handleInputClick(elemento, e, timeStamp) {
        const tipo = elemento.type.toLowerCase();

        if (['button', 'reset', 'submit', 'image'].includes(tipo)) {
            this.handleButtonClick(elemento, timeStamp, 'click');
        } else if (['checkbox', 'radio'].includes(tipo)) {
            this.handleCheckboxRadioClick(elemento, timeStamp, 'click');
        }
    }

    handleButtonClick(elemento, timeStamp, evento) {
        this.insereInteracoes(
            Array.from(document.body.querySelectorAll('*')).indexOf(elemento),
            '',
            timeStamp,
            'button',
            evento
        );

        this.tempoInteracao = timeStamp;
        this.salvarEstado();
    }

    handleCheckboxRadioClick(elemento, timeStamp, evento) {
        const tipo = elemento.type.toLowerCase();
        this.insereInteracoes(
            Array.from(document.body.querySelectorAll('*')).indexOf(elemento),
            '',
            timeStamp,
            tipo,
            evento
        );

        this.tempoInteracao = timeStamp;
        this.salvarEstado();
    }

    handleKeypressEvent(e) {
        if (e.key === 'Enter') {
            const elemento = e.target;
            const tagName = elemento.tagName.toLowerCase();
            const timeStamp = Math.floor(e.timeStamp);

            if (tagName === 'a') {
                this.handleLinkEnter(elemento, e, timeStamp);
            } else if (tagName === 'input') {
                this.handleInputEnter(elemento, timeStamp);
            } else if (tagName === 'button') {
                this.handleButtonClick(elemento, timeStamp, 'enter');
            }
        }
    }

    handleLinkEnter(elemento, e, timeStamp) {
        const url = elemento.href;
        if (!url) return;

        e.preventDefault();
        e.stopPropagation();

        const isExterno = new URL(url).hostname !== this.domain;

        if (!isExterno) {
            this.insereInteracoes(
                Array.from(document.body.querySelectorAll('*')).indexOf(elemento),
                url,
                timeStamp,
                'page',
                'enter'
            );

            this.tempoInteracao = timeStamp;
            this.salvarEstado(() => {
                window.location.href = url;
            });
        }
    }

    handleInputEnter(elemento, timeStamp) {
        const tipo = elemento.type.toLowerCase();

        if (['button', 'reset', 'submit', 'image'].includes(tipo)) {
            this.handleButtonClick(elemento, timeStamp, 'enter');
        }
    }

    handleChangeEvent(e) {
        const elemento = e.target;
        const tagName = elemento.tagName.toLowerCase();
        const timeStamp = Math.floor(e.timeStamp);

        if (['input', 'textarea', 'select'].includes(tagName)) {
            this.insereInteracoes(
                Array.from(document.body.querySelectorAll('*')).indexOf(elemento),
                '',
                timeStamp,
                tagName,
                'change'
            );

            this.tempoInteracao = timeStamp;
            this.salvarEstado();
        }
    }

    insereInteracoes(domId, url, tempo, tipo, evento) {
        console.log('Interação registrada:', { domId, url, tempo, tipo, evento });

        if (tipo === 'page') {
            this.handlePageInteraction(domId, url,tempo, evento);
        } else if(tipo === 'button'){
            this.handleButtonInteraction(domId, tempo, evento);
        } else if(tipo === 'input'){
            this.handleInputInteraction(domId, tempo, evento);
        } else if(tipo === 'check'){
            this.handleCheckInteraction(domId, tempo, evento);
        } else if(tipo === 'radio'){
            this.handleRadioInteraction(domId, tempo, evento);
        } else if(tipo === 'select'){
            this.handleSelectInteraction(domId, tempo, evento);
        }
    }

    // Método auxiliar ao insereInteracoes
    normalizeUrl(url){
        if(!url) return '';

        try{
            const urlObj = new URL(url);
            let path = urlObj.pathname;

            // Remover apenas arquivos index no final do path
            path = path.replace(/(\/)(index\.(html|php|asp))?$/i, '/');

            return `${urlObj.origin}${path}${urlObj.search}`;
        } catch (e){
            return url.split('?')[0].split('#')[0].replace(/index\.(html|php|asp)/gi, '');
        }
    }

    handlePageInteraction(domId, url, tempo, evento){
        let idIniStateLink = 0;
        let idFinalStateLink = 0;
        let idSrcEvent = 0;
        let idSrcPage = 0;
        let idTargetPage = 0;
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let sourceID = 0;
        const urlMapa = this.normalizeUrl(window.location.href);

        url = this.normalizeUrl(url);

        const pages = this.xmlJquery.querySelectorAll('pages page');
        
        for (const page of pages) {
            const pageUrl = page.getAttribute('url');
            
            if (this.normalizeUrl(pageUrl) === this.normalizeUrl(url)) {
                idTargetPage = page.getAttribute('node_id');
                
                // Buscar estados e eventos da página target
                const states = page.querySelectorAll('state');
                const events = page.querySelectorAll('event');
                
                for (const state of states) {
                    const stateName = state.getAttribute('name');
                    const itemId = state.getAttribute('item_id');
                    
                    if(itemId === 'null'){
                        if (stateName === 'onLoad') {
                            idIniState = state.getAttribute('state_id');
                        } else if (stateName === 'Load') {
                            idFimState = state.getAttribute('state_id');
                        }
                    }  
                }
                
                for (const event of events) {
                    const itemId = event.getAttribute('item_id');
                    if (itemId === 'null' && event.getAttribute('name') === 'onload') {
                        idTargetEvent = event.getAttribute('event_id');
                    }
                }
            }
            
            if (pageUrl === urlMapa) {
                idSrcPage = page.getAttribute('node_id');
                const components = page.querySelectorAll('component');
                
                for (const component of components) {
                    if (parseInt(component.getAttribute('dom_id')) === domId) {
                        sourceID = component.getAttribute('item_id');
                        
                        // Buscar eventos do componente
                        const compEvents = component.querySelectorAll('event');
                        for (const event of compEvents) {
                            if (event.getAttribute('name') === evento) {
                                idSrcEvent = event.getAttribute('event_id');
                            }
                        }
                        
                        // Buscar estados do componente
                        const compStates = component.querySelectorAll('state');
                        for (const state of compStates) {
                            const stateName = state.getAttribute('name');
                            if (stateName === 'visited') {
                                idFinalStateLink = state.getAttribute('state_id');
                            } else if (stateName === 'not visited') {
                                idIniStateLink = state.getAttribute('state_id');
                            }
                        }
                    }
                }
            }
        }

        // Gerar interações
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniStateLink}" finalState="${idFinalStateLink}" event_source="" event_target="${idSrcEvent}" source_id="${sourceID}" type_source="component" target_id="${idTargetPage}" type_target="page">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idSrcEvent}" event_target="${idTargetEvent}" source_id="${idTargetPage}" type_source="page" target_id="${idTargetPage}" type_target="page">${this.tempoInteracao + tempo + 50}</interaction>\n`;
        this.numInteracoes++;
    }

    // Método auxiliar a interacao com button (insereInteracoes)
    handleButtonInteraction(domId, tempo, evento){
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let idTarget = 0;
        const urlMapa = this.normalizeUrl(window.location.heref);

        const pages = this.xmlJquery.querySelectorAll('pages page');

        for(const page of pages){
            if(page.getAttribute('url') === urlMapa){
                const components = page.querySelectorAll('component');

                for(const component of components){
                    if(parseInt(component.getAttribute('dom_id')) === domId){
                        idTarget = component.getAttribute('item_id');

                        // Buscar estados
                        const states = component.querySelectorAll('state');
                        for(const state of states){
                            const stateName = state.getAttribute('name');
                            if(stateName === 'selected'){
                                idFimState = state.getAttribute('state_id');
                            } else if (stateName === 'notselected') {
                                idIniState = state.getAttribute('state_id');
                            }
                        }

                        // Buscar eventos
                        const events = component.querySelectorAll('event');
                        for(const event of events){
                            if(event.getAttribute('name') === evento){
                                idTargetEvent = event.getAttribute('event_id');
                            }
                        }
                    }
                }
            }
        }

        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idTargetEvent}" event_target="${idTargetEvent}" source_id="${idTarget}" type_source="component" target_id="${idTarget}" type_target="component">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        console.log('monitorou button');
    }

    // Metodo auxiliar a interação com o input 
    // (usado no método insereInteracoes)
    handleInputInteraction(domId, tempo, evento){
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let idTarget = 0;
        const urlMapa = this.normalizeUrl(window.location.href);
        const elemento = Array.from(document.body.querySelectorAll('*'))[domId];
        const valor = elemento ? elemento.value : '';
        const pages = this.xmlJquery.querySelectorAll('pages page');

        for(const page of pages){
            if(page.getAttribute('url') === urlMapa){
                const components = page.querySelectorAll('component');

                for(const component of components){
                    if(parseInt(component.getAttribute('dom_id'))===domId){
                        idTarget = component.getAttribute('item_id');

                        //Buscar estados baseado no valor
                        const states = component.querySelectorAll('state');
                        const stateName = valor === '' ? 'empty' : 'notEmpty';

                        for(const state of states){
                            if(state.getAttribute('name') === stateName){
                                idFimState = state.getAttribute('state_id');
                                idIniState = state.getAttribute('state_id');
                            }
                        }

                        // Buscar eventos
                        const events = component.querySelectorAll('event');
                        for(const event of events){
                            if(event.getAttribute('name') === evento){
                                idTargetEvent = event.getAttribute('event_id');
                            }
                        }
                    }
                }
            }
        }
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idTargetEvent}" event_target="${idTargetEvent}" source_id="${idTarget}" type_source="component" target_id="${idTarget}" type_target="component">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        console.log('monitorou input');
    }

    handleCheckInteraction(domId, tempo, evento) {
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let idTarget = 0;
        const urlMapa = this.normalizeUrl(window.location.href);
        
        // Obter estado do checkbox diretamente do DOM
        const elemento = Array.from(document.body.querySelectorAll('*'))[domId];
        const valor = elemento && elemento.checked !== undefined ? elemento.checked : false;

        const pages = this.xmlJquery.querySelectorAll('pages page');
        
        for (const page of pages) {
            if (page.getAttribute('url') === urlMapa) {
                const components = page.querySelectorAll('component');
                
                for (const component of components) {
                    if (parseInt(component.getAttribute('dom_id')) === domId) {
                        idTarget = component.getAttribute('item_id');
                        
                        // Buscar estados baseado no valor checked
                        const states = component.querySelectorAll('state');
                        
                        for (const state of states) {
                            const stateName = state.getAttribute('name');
                            if (valor === true) {
                                if (stateName === 'notChecked') {
                                    idFimState = state.getAttribute('state_id');
                                } else if (stateName === 'checked') {
                                    idIniState = state.getAttribute('state_id');
                                }
                            } else {
                                if (stateName === 'checked') {
                                    idFimState = state.getAttribute('state_id');
                                } else if (stateName === 'notChecked') {
                                    idIniState = state.getAttribute('state_id');
                                }
                            }
                        }
                        
                        // Buscar eventos
                        const events = component.querySelectorAll('event');
                        for (const event of events) {
                            if (event.getAttribute('name') === evento) {
                                idTargetEvent = event.getAttribute('event_id');
                            }
                        }
                    }
                }
            }
        }
        
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idTargetEvent}" event_target="${idTargetEvent}" source_id="${idTarget}" type_source="component" target_id="${idTarget}" type_target="component">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        console.log('monitorou checkbox');
    }

    handleRadioInteraction(domId, tempo, evento) {
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let idTarget = 0;
        const urlMapa = this.normalizeUrl(window.location.href);
        
        // Obter estado do radio diretamente do DOM
        const elemento = Array.from(document.body.querySelectorAll('*'))[domId];
        const valor = elemento && elemento.checked !== undefined ? elemento.checked : false;

        const pages = this.xmlJquery.querySelectorAll('pages page');
        
        for (const page of pages) {
            if (page.getAttribute('url') === urlMapa) {
                const components = page.querySelectorAll('component');
                
                for (const component of components) {
                    if (parseInt(component.getAttribute('dom_id')) === domId) {
                        idTarget = component.getAttribute('item_id');
                        
                        // Buscar estados baseado no valor checked
                        const states = component.querySelectorAll('state');
                        
                        for (const state of states) {
                            const stateName = state.getAttribute('name');
                            if (valor === true) {
                                if (stateName === 'notChecked') {
                                    idFimState = state.getAttribute('state_id');
                                } else if (stateName === 'checked') {
                                    idIniState = state.getAttribute('state_id');
                                }
                            } else {
                                if (stateName === 'checked') {
                                    idFimState = state.getAttribute('state_id');
                                } else if (stateName === 'notChecked') {
                                    idIniState = state.getAttribute('state_id');
                                }
                            }
                        }
                        
                        // Buscar eventos
                        const events = component.querySelectorAll('event');
                        for (const event of events) {
                            if (event.getAttribute('name') === evento) {
                                idTargetEvent = event.getAttribute('event_id');
                            }
                        }
                    }
                }
            }
        }
        
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idTargetEvent}" event_target="${idTargetEvent}" source_id="${idTarget}" type_source="component" target_id="${idTarget}" type_target="component">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        console.log('monitorou radio');
    }

    handleSelectInteraction(domId, tempo, evento) {
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let idTarget = 0;
        const urlMapa = this.normalizeUrl(window.location.href);
        
        // Obter valor do select diretamente do DOM
        const elemento = Array.from(document.body.querySelectorAll('*'))[domId];
        const valor = elemento && elemento.value ? elemento.value : '';

        const pages = this.xmlJquery.querySelectorAll('pages page');
        
        for (const page of pages) {
            if (page.getAttribute('url') === urlMapa) {
                const components = page.querySelectorAll('component');
                
                for (const component of components) {
                    if (parseInt(component.getAttribute('dom_id')) === domId) {
                        idTarget = component.getAttribute('item_id');
                        
                        // Buscar estados baseado no valor
                        const states = component.querySelectorAll('state');
                        const stateName = valor === '' ? 'default' : 'notDefault';
                        
                        for (const state of states) {
                            if (state.getAttribute('name') === stateName) {
                                idFimState = state.getAttribute('state_id');
                                idIniState = state.getAttribute('state_id');
                            }
                        }
                        
                        // Buscar eventos
                        const events = component.querySelectorAll('event');
                        for (const event of events) {
                            if (event.getAttribute('name') === evento) {
                                idTargetEvent = event.getAttribute('event_id');
                            }
                        }
                    }
                }
            }
        }
        
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idTargetEvent}" event_target="${idTargetEvent}" source_id="${idTarget}" type_source="component" target_id="${idTarget}" type_target="component">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        console.log('monitorou select');
    }

    atualizaDinamicos() {
        // Atualiza estado dos elementos dinâmicos
        const inputs = document.querySelectorAll('input, select, textarea, button');
        this.inputsAtuais = Array.from(inputs).map(input => ({
            elemento: input,
            value: input.value,
            checked: input.checked,
            disabled: input.disabled,
            readOnly: input.readOnly
        }));

        const iframes = document.querySelectorAll('iframe');
        this.iframesAtuais = Array.from(iframes).map(iframe => ({
            elemento: iframe,
            src: iframe.src,
            html: iframe.contentDocument?.documentElement.outerHTML || ''
        }));
    }

    async salvarEstado(callback = null) {
            try {
                await chrome.storage.local.set({
                    xmlFinalTracer: this.xmlFinalTracer,
                    xmlInteracoes: this.xmlInteracoes,
                    gravando: this.gravando,
                    xmlTracer: this.xmlTracer,
                    numInteracoes: this.numInteracoes,
                    tempoInteracao: this.tempoInteracao
                });

                if (callback) callback();
            } catch (error) {
                console.error('Erro ao salvar estado:', error);
            }
    }

    salvarXMLTracer() {
        this.xmlFinalTracer += this.xmlInteracoes;
        this.xmlFinalTracer += '\t</interactions>\n';
        this.xmlFinalTracer += '</site>\n';

        const blob = new Blob([this.xmlFinalTracer], { type: "text/xml" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = "mapa-tracer.xml";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);

        // Resetar estado
        this.gravando = false;
        this.xmlTracer = '';
        this.xmlFinalTracer = '';
        this.xmlInteracoes = '';
        this.numInteracoes = 1;
        this.tempoInteracao = 0;

        this.salvarEstado();
    }
}

// Adicionar ao initialization existente
let tracer = null;

async function initializeTracer() {
    try {
        const response = await chrome.runtime.sendMessage({
            action: "tracerContentScriptReady"
        });

        if (response && response.shouldRecord) {
            tracer = new WebTracer();
            tracer.initializeState(response.tracerState);
        }
    } catch (error) {
        console.error("Erro ao inicializar tracer:", error);
    }
}

// Inicializar quando o content script carregar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTracer);
} else {
    initializeTracer();
}