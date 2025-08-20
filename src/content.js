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
        this.domain = '';
        this.DOM = [];
        this.itemAtual = 0;
        this.keepAliveInterval = null;
        this.setupMessageListener();
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
        // Coletar elementos
        this.DOM = Array.from(document.body.querySelectorAll('*'));
        
        // Processar iframes (adicionando ao DOM)
        document.querySelectorAll('iframe').forEach(iframe => {
            try {
                if (iframe.contentDocument) {
                    const iframeElements = iframe.contentDocument.querySelectorAll('body *');
                    this.DOM.push(...Array.from(iframeElements));
                }
            } catch(e) {
                console.error('Erro ao acessar iframe:', e);
            }
        });

        this.mapeiaProximoComponente();
    }

    mapeiaComponente(dom_id){
        const elemento = this.DOM[dom_id];
        if(!elemento || !elemento.tagName) return;

        const tag = elemento.tagName.toLowerCase();

        switch(tag){
            case 'a': 
                var url = elemento.href;
                if(url != undefined && url != ''){
                    var externo = new URL(url, window.location.href).hostname !== domain;

                    let currentPageData = linksPorPai.find(p => p.id === numPagina);
                    if (currentPageData) {
                        const absoluteUrl = new URL(url, window.location.href).href;
                        if (!checkMedia(absoluteUrl) && !externo) {
                            currentPageData.links.push({ link: absoluteUrl, componente: numComponente });
                        }
                    }
                    
                    xmlSite += `\t\t\t<component type="link" dom_id="${dom_id}" node_id="${numPagina}" item_id="${numComponente}" name="${verificaVazio(elemento.textContent)}" externo="${externo}">\n`;
                    xmlSite += `\t\t\t\t<event name="click" node_id="${numPagina}" item_id="${numComponente}" event_id="${numEvento}"><![CDATA[${elemento.getAttribute('href')}]]></event>\n`;
                    numEvento++;
                    xmlSite += `\t\t\t\t<event name="enter" node_id="${numPagina}" item_id="${numComponente}" event_id="${numEvento}"><![CDATA[${elemento.getAttribute('href')}]]></event>\n`;
                    numEvento++;
                    xmlSite += `\t\t\t\t<state name="not visited" node_id="${numPagina}" item_id="${numComponente}" state_id="${numState}"></state>\n`;
                    numState++;
                    xmlSite += `\t\t\t\t<state name="visited" node_id="${numPagina}" item_id="${numComponente}" state_id="${numState}"></state>\n`;
                    numState++;
                    xmlSite += '\t\t\t</component>\n';
                    numComponente++;
                }
                break;

            case 'input':
                var tipo = elemento.type ? elemento.type.toLowerCase() : 'text';
                var botoes = ["button", "reset", "submit", "image"];
                var campos = ["text", "color", "date", "datetime", "datetime-local", "email", "month", "number", "file", "password", "search", "tel", "time", "url", "week", "hidden"];
                var checks = ["checkbox", "radio"];

                if(botoes.indexOf(tipo) != -1){
                    xmlSite += `\t\t\t<component type="button" dom_id="${dom_id}" node_id="${numPagina}" item_id="${numComponente}" name="${verificaVazio(elemento.getAttribute('name'))}">\n`;
                    xmlSite += `\t\t\t\t<event name="click" node_id="${numPagina}" item_id="${numComponente}" event_id="${numEvento}"></event>\n`;
                    numEvento++;
                    xmlSite += `\t\t\t\t<event name="enter" node_id="${numPagina}" item_id="${numComponente}" event_id="${numEvento}"></event>\n`;
                    numEvento++;
                    xmlSite += `\t\t\t\t<state name="selected" node_id="${numPagina}" item_id="${numComponente}" state_id="${numState}"></state>\n`;
                    numState++;
                    xmlSite += `\t\t\t\t<state name="notselected" node_id="${numPagina}" item_id="${numComponente}" state_id="${numState}"></state>\n`;
                    numState++;
                    xmlSite += '\t\t\t</component>\n';
                    numComponente++;
                } else if (campos.indexOf(tipo) != -1 || tipo === 'range'){
                    xmlSite += `\t\t\t<component type="input" dom_id="${dom_id}" node_id="${numPagina}" item_id="${numComponente}" name="${verificaVazio(elemento.getAttribute('name'))}">\n`;
                    xmlSite += `\t\t\t\t<event name="focus" node_id="${numPagina}" item_id="${numComponente}" event_id="${numEvento}"></event>\n`;
                    numEvento++;
                    xmlSite += `\t\t\t\t<event name="blur" node_id="${numPagina}" item_id="${numComponente}" event_id="${numEvento}"></event>\n`;
                    numEvento++;
                    xmlSite += `\t\t\t\t<event name="change" node_id="${numPagina}" item_id="${numComponente}" event_id="${numEvento}"></event>\n`;
                    numEvento++;
                    xmlSite += `\t\t\t\t<state name="empty" node_id="${numPagina}" item_id="${numComponente}" state_id="${numState}"></state>\n`;
                    numState++;
                    xmlSite += `\t\t\t\t<state name="notEmpty" node_id="${numPagina}" item_id="${numComponente}" state_id="${numState}"></state>\n`;
                    numState++;
                    xmlSite += `\t\t\t\t<state name="disabled" node_id="${numPagina}" item_id="${numComponente}" state_id="${numState}"></state>\n`;
                    numState++;
                    xmlSite += `\t\t\t\t<state name="readOnly" node_id="${numPagina}" item_id="${numComponente}" state_id="${numState}"></state>\n`;
                    numState++;
                    xmlSite += '\t\t\t</component>\n';
                    numComponente++;
                } else if (checks.indexOf(tipo) != -1){
                    xmlSite += `\t\t\t<component type="${tipo}" dom_id="${dom_id}" node_id="${numPagina}" item_id="${numComponente}" name="${verificaVazio(elemento.getAttribute('name'))}">\n`;
                    xmlSite += `\t\t\t\t<event name="click" node_id="${numPagina}" item_id="${numComponente}" event_id="${numEvento}"></event>\n`;
                    numEvento++;
                    xmlSite += `\t\t\t\t<event name="enter" node_id="${numPagina}" item_id="${numComponente}" event_id="${numEvento}"></event>\n`;
                    numEvento++;
                    xmlSite += `\t\t\t\t<state name="disabled" node_id="${numPagina}" item_id="${numComponente}" state_id="${numState}"></state>\n`;
                    numState++;
                    xmlSite += `\t\t\t\t<state name="notChecked" node_id="${numPagina}" item_id="${numComponente}" state_id="${numState}"></state>\n`;
                    numState++;
                    xmlSite += `\t\t\t\t<state name="checked" node_id="${numPagina}" item_id="${numComponente}" state_id="${numState}"></state>\n`;
                    numState++;
                    xmlSite += '\t\t\t</component>\n';
                    numComponente++;
                }
                break;

            case 'textarea':
            case 'select':
                xmlSite += `\t\t\t<component type="${tag}" dom_id="${dom_id}" node_id="${numPagina}" item_id="${numComponente}" name="${verificaVazio(elemento.getAttribute('name'))}">\n`;
                xmlSite += `\t\t\t\t<event name="focus" node_id="${numPagina}" item_id="${numComponente}" event_id="${numEvento}"></event>\n`;
                numEvento++;
                xmlSite += `\t\t\t\t<event name="blur" node_id="${numPagina}" item_id="${numComponente}" event_id="${numEvento}"></event>\n`;
                numEvento++;
                xmlSite += `\t\t\t\t<event name="change" node_id="${numPagina}" item_id="${numComponente}" event_id="${numEvento}"></event>\n`;
                numEvento++;
                xmlSite += `\t\t\t\t<state name="disabled" node_id="${numPagina}" item_id="${numComponente}" state_id="${numState}"></state>\n`;
                numState++;
                xmlSite += '\t\t\t</component>\n';
                numComponente++;
                break;

            case 'button':
                xmlSite += `\t\t\t<component type="button" dom_id="${dom_id}" node_id="${numPagina}" item_id="${numComponente}" name="${verificaVazio(elemento.getAttribute('name'))}">\n`;
                xmlSite += `\t\t\t\t<event name="click" node_id="${numPagina}" item_id="${numComponente}" event_id="${numEvento}"></event>\n`;
                numEvento++;
                xmlSite += `\t\t\t\t<event name="enter" node_id="${numPagina}" item_id="${numComponente}" event_id="${numEvento}"></event>\n`;
                numEvento++;
                xmlSite += `\t\t\t\t<state name="selected" node_id="${numPagina}" item_id="${numComponente}" state_id="${numState}"></state>\n`;
                numState++;
                xmlSite += `\t\t\t\t<state name="notselected" node_id="${numPagina}" item_id="${numComponente}" state_id="${numState}"></state>\n`;
                numState++;
                xmlSite += '\t\t\t</component>\n';
                numComponente++;
                break;
        }
    }
    
    acessaProximoLink(){
        let proximoLink = '';

        for(const page of this.linksPorPai){
            const linkNaoAcessado = page.link?.find(linkInfo => 
                !this.verificaLinkAcessado(linkInfo.link)
            );

            if(linkNaoAcessado){
                proximoLink = linkNaoAcessado.link;
                break;
            }
        }

        if(proximoLink){
            this.numPagina++;
            this.adicionaLinkAcessado(proximoLink);
            this.mostrarStatus(`Acessando Link: ${proximoLink}`);

            chrome.runtime.sendMessage({
                action: "abrelink",
                url: proximoLink,
                crawlerState: this.getCurrentState()
            });
        } else {
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
        const blob = new Blob([this.xmlSite], {type: "text/xml;charset=utf-8"});
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'site-map.xml';
        a.click();
        document.body.removeChild(a);
    }
    
}