var linksPorPai, linksAcessados, xmlSite, numPagina, numComponente, numEvento, numState, index;
var domain = '';
var DOM;
var itemAtual = 0;
// Variavel para controlar o hertbeat (manter o background sempre ativo)
var keepAliveInterval;

(async () => {
    try {
        const response = await chrome.runtime.sendMessage({ action: "contentScriptReady" });
        if (response && response.shouldCrawl) {
            const state = response.crawlerState;
            initializeState(state);
            setTimeout(rastrear, 2000);
        }
    } catch (error) {
        if (!error.message.includes("Could not establish connection")) {
            console.error("Erro ao comunicar com o background script:", error);
        }
    }
})();

// Listener para a PRIMEIRA PÁGINA
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.acao === "iniciar") {
        const state = request.crawlerState;
        initializeState(state);
        iniciar();
        sendResponse({ status: "iniciando" });
    }
});

// Função para centralizar a inicialização de variáveis
function initializeState(state) {
    linksPorPai = state.linksPorPai;
    linksAcessados = state.linksAcessados;
    xmlSite = state.xmlSite;
    numPagina = state.numPagina;
    numComponente = state.numComponente;
    numEvento = state.numEvento;
    numState = state.numState;
    index = state.index;
}

function iniciar() {
    xmlSite += '<site url="' + window.location.href + '" titulo="' + $(document).find("title").text() + '" tipo="crawler">\n\t<pages>\n\n';
    processaDom();
}

function rastrear() {
    processaDom();
}

function processaDom() {
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    keepAliveInterval = setInterval(() => {
        chrome.runtime.sendMessage({ action: "keepAlive" }).catch(() => {});
    }, 15 * 1000);

    var url = window.location.href;
    var title = $(document).find("title").text().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    adicionaLinkAcessado(url);
    xmlSite += '\t\t<page url="' + url + '" titulo="' + title + '" node_id="' + numPagina + '" index="' + index + '">\n';
    xmlSite += '\t\t<event name="onLoad" node_id="' + numPagina + '" item_id="null" event_id="' + numEvento + '"/>\n';
    numEvento++;
    xmlSite += '\t\t<state name="onLoad" node_id="' + numPagina + '" item_id="null" state_id="' + numState + '"/>\n';
    numState++;
    xmlSite += '\t\t<state name="Load" node_id="' + numPagina + '" item_id="null" state_id="' + numState + '"/>\n';
    numState++;
    
    let pageData = linksPorPai.find(p => p.id === numPagina);
    if (!pageData) {
        linksPorPai.push({ id: numPagina, links: [] });
    }

    if (index === 'true') {
        index = 'false';
    }

    domain = window.location.hostname;
    itemAtual = 0;
    DOM = Array.from($('body *'));
    
    $('iframe').each(function() {
        try {
            const iframeElements = $(this).contents().find('body *');
            if (iframeElements.length > 0) {
                DOM.push(...Array.from(iframeElements));
            }
        } catch (e) {}
    });

    mapeiaProximoComponente();
}

function mapeiaProximoComponente() {
    if (itemAtual < DOM.length) {
        $('.crawlerLiviaStatus').remove();
        $('body').append('<div class="crawlerLiviaStatus" style="position: fixed; left: 15px; top: 15px; z-index:99999999999999; background-color: #000; width: 300px; padding: 20px; color: #fff; font-size: 15px; font-family: \'Arial\', sans-serif; text-align: center;">Rastreando Componente: ' + (itemAtual + 1) + ' de ' + DOM.length + '</div>');

        mapeiaComponente(itemAtual);
        itemAtual++;
        
        setTimeout(() => mapeiaProximoComponente(), 0);
    } else {
        xmlSite += '\t\t</page>\n\n';
        acessaProximoLink();
    }
}

function mapeiaComponente(dom_id){
    var elemento = $(DOM[dom_id]);
    var tag = elemento.prop("tagName");

    if(!tag){ return; }

    tag = tag.toLowerCase();

    switch(tag){
        case 'a': 
            var url = elemento.prop('href');
            if(url != undefined && url != ''){
                var externo = new URL(url, window.location.href).hostname !== domain;

                let currentPageData = linksPorPai.find(p => p.id === numPagina);
                if (currentPageData) {
                    const absoluteUrl = new URL(url, window.location.href).href;
                    if (!checkMedia(absoluteUrl) && !externo) {
                         currentPageData.links.push({ link: absoluteUrl, componente: numComponente });
                    }
                }
                
                xmlSite += `\t\t\t<component type="link" dom_id="${dom_id}" node_id="${numPagina}" item_id="${numComponente}" name="${verificaVazio(elemento.text())}" externo="${externo}">\n`;
                xmlSite += `\t\t\t\t<event name="click" node_id="${numPagina}" item_id="${numComponente}" event_id="${numEvento}"><![CDATA[${elemento.attr('href')}]]></event>\n`;
                numEvento++;
                xmlSite += `\t\t\t\t<event name="enter" node_id="${numPagina}" item_id="${numComponente}" event_id="${numEvento}"><![CDATA[${elemento.attr('href')}]]></event>\n`;
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
            var tipo = elemento.prop('type') ? elemento.prop('type').toLowerCase() : 'text';
            var botoes = ["button", "reset", "submit", "image"];
            var campos = ["text", "color", "date", "datetime", "datetime-local", "email", "month", "number", "file", "password", "search", "tel", "time", "url", "week", "hidden"];
            var checks = ["checkbox", "radio"];

            if(botoes.indexOf(tipo) != -1){
                xmlSite += `\t\t\t<component type="button" dom_id="${dom_id}" node_id="${numPagina}" item_id="${numComponente}" name="${verificaVazio(elemento.attr('name'))}">\n`;
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
                xmlSite += `\t\t\t<component type="input" dom_id="${dom_id}" node_id="${numPagina}" item_id="${numComponente}" name="${verificaVazio(elemento.attr('name'))}">\n`;
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
                xmlSite += `\t\t\t<component type="${tipo}" dom_id="${dom_id}" node_id="${numPagina}" item_id="${numComponente}" name="${verificaVazio(elemento.attr('name'))}">\n`;
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
            xmlSite += `\t\t\t<component type="${tag}" dom_id="${dom_id}" node_id="${numPagina}" item_id="${numComponente}" name="${verificaVazio(elemento.attr('name'))}">\n`;
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
            xmlSite += `\t\t\t<component type="button" dom_id="${dom_id}" node_id="${numPagina}" item_id="${numComponente}" name="${verificaVazio(elemento.attr('name'))}">\n`;
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


function verificaVazio(texto){
    if(texto != undefined && texto != null){
        var filter = /^(?!\s*$).+/;
        if (!filter.test(texto)) {
            return "";
        }else{
            return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
    }else{
        return '';
    }
}

function checkMedia(url) {
    try {
        const path = new URL(url).pathname;
        return (path.match(/\.(jpeg|jpg|gif|png|mp3|svg|mp4|avi|pdf|doc|docx|xls|xlsx|ppt|pptx)$/i) != null);
    } catch(e) {
        return false;
    }
}

function adicionaLinkAcessado(linkU) {
    let url = new URL(linkU, window.location.origin).href.split('#')[0].split('?')[0];
    if (!linksAcessados.includes(url)) {
        linksAcessados.push(url);
    }
}

function verificaLinkAcessado(linkU) {
    let url = new URL(linkU, window.location.origin).href.split('#')[0].split('?')[0];
    return linksAcessados.includes(url);
}

function acessaProximoLink() {
    let proximoLink = '';
    for (const page of linksPorPai) {
        if (page.links) {
            for (const linkInfo of page.links) {
                if (!verificaLinkAcessado(linkInfo.link)) {
                    proximoLink = linkInfo.link;
                    break;
                }
            }
        }
        if (proximoLink) break;
    }

    if (proximoLink) {
        numPagina++;
        adicionaLinkAcessado(proximoLink);
        $('.crawlerLiviaStatus').remove();
        $('body').append('<div class="crawlerLiviaStatus" style="position: fixed; left: 15px; top: 15px; z-index:99999999999999; background-color: #000; width: 300px; padding: 20px; color: #fff; font-size: 15px; font-family: \'Arial\', sans-serif; text-align: center;">Acessando Link: ' + proximoLink + '</div>');

        const currentState = { linksPorPai, linksAcessados, xmlSite, numPagina, numComponente, numEvento, numState, index };
        chrome.runtime.sendMessage({ acao: "abrelink", url: proximoLink, crawlerState: currentState });
    } else {
        finalizaCrawler();
    }
}

function finalizaCrawler() {
    // Para o heartbeat quando o crawler termina
    if(keepAliveInterval) clearInterval(keepAliveInterval);

    xmlSite += '\t</pages>\n\n';
    xmlSite += '\t<edges>\n';
    // ... Lógica para gerar as arestas ...
    xmlSite += '\t</edges>\n';
    xmlSite += '</site>\n';

    $('.crawlerLiviaStatus').remove();
    var blob = new Blob([xmlSite], { type: "text/xml;charset=utf-8" });
    saveAs(blob, "mapa.xml");

    chrome.runtime.sendMessage({ acao: "resetacrawler" });
}