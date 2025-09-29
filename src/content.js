let crawler = null;
let tracer = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Content Script recebeu a ação: ", request.action);

    switch(request.action){
        case "ping":
            // Resposta para verificar se o content script está pronto
            sendResponse({status: "ready"});
            return true;
        case "startCrawling":
            console.log("CONTENT. Recebeu mensagem: startCrawling");
            if(!crawler){
                console.log("instancia um novo crawler");
                crawler = new WebCrawler();
                crawler.initializeState(request.crawlerState);
            }
            crawler.iniciar();
            console.log("Envia resposta que o crawler foi iniciado");
            console.log("crawling_iniciado");
            sendResponse({status:"crawling_iniciado"});
            break;
        case "continueCrawling":
            console.log("CONTENT. Recebeu a mensagem: continueCrawling");
            if(!crawler){
                console.log("WebCrawler não instanciado, Instancia um novo WebCrawler");
                crawler = new WebCrawler();
            }
            crawler.initializeState(request.crawlerState);
            console.log("Chama o método rastrear do crawler");
            crawler.rastrear();
            sendResponse({status: "crawling_continuado"});
            break;
        case "iniciarGravacao":
            console.log("content: Recebeu a mensagem inicarGravacao");
            if(!tracer){
                tracer = new WebTracer();
            }
            tracer.gravando = request.gravando;
            tracer.xmlTracer = request.xmlTracer;
            
            tracer.salvarEstado(()=>{
                console.log("Arrow function salvarEstado");
                tracer.iniciaTracer(request.tabid);
                sendResponse({status: "gravacao_iniciada"});
            });
            // Mantem canal aberto para a responsta assíncrona
            return true;
        case "continueRecording":
            console.log("CONTENT: Recebeu a mensagem continueRecording");
            if(!tracer){
                console.log("WebTracer não instanciado. Instanciando um novo WebTracer");
                tracer = new WebTracer();
            }
            // Inicializa o tracer com o estado recebido do background
            tracer.initializeState(request.tracerState);

            console.log("Chamando o método continuaTracer para a nova página");
            // Inicia o monitoramento de eventos na nova página
            tracer.continuaTracer()
            sendResponse({status: "recording_continued"});
            break;
        case "salvarXMLTracer":
            console.log("CONTENT: Recebeu a ordem para salvar o XML do tracer");
            if(!tracer){
                console.log("CONTENT: Instância do tracer não encontrata. Criando uma nova para o salvamento");
                tracer = new WebTracer();
            }

            // Carrega o estado final recebido do background
            tracer.initializeState(request.tracerState);

            // Chama a função que monta o XML e dispara o download
            tracer.salvarXMLTracer();
            // Reseta o estado localmente
            tracer = null;

            sendResponse({status: "xml_salvo"});
            break;
        default:
            console.warn("Acao não reconhecida: ", request.action);
            return false;
    }
    // retorna false para todas as outras mensagens síncronas.
    return false;
});

// O que faz essa async?

(async () => {
    try {
        // Aguarda um pouco antes de enviar a mensagem
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const response = await chrome.runtime.sendMessage({action: "contentScriptLoaded"});

        if(response && response.shouldCrawl){
            console.log("Continuando um crawling existente...");
            console.log("Instanciando um novo WebCrawler");
            crawler = new WebCrawler();
            crawler.initializeState(response.crawlerState);
            setTimeout(() => crawler.rastrear(), 1000);
        } else if (response && response.shouldRecord) {
            console.log("Continuando uma gravação existente...");
            tracer = new WebTracer();
            tracer.initializeState(response.tracerState);
        }
    } catch(error) {
         // Ignora erros de conexão específicos
        if (!error.message.includes("Could not establish connection")) {
            console.error("Content Script: Erro na inicialização:", error);
        }
    }
})();