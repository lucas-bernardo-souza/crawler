let crawler = null;
let tracer = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Content Script recebeu a ação: ", request.action);

    switch(request.action){
        case "startCrawling":
            if(!crawler){
                crawler = new WebCrawler();
                crawler.initializeState(request.crawlerState);
            }
            crawler.iniciar();
            sendResponse({status:"crawling_iniciado"});
            break;
        case "continueCrawling":
            if(!crawler){
                crawler = new WebCrawler();
            }
            crawler.initializeState(request.crawlerState);
            crawler.rastrear();
            sendResponse({status: "crawling_continuado"});
            break;
        case "inicarGravacao":
            if(!tracer){
                tracer = new WebTracer();
            }
            tracer.gravando = request.gravando;
            tracer.xmlTracer = request.xmlTracer;

            tracer.salvarEstado(()=>{
                tracer.iniciaTracer(request.tabid);
                sendResponse({status: "gravacao_iniciada"});
            });
            // Mantem canal aberto para a responsta assíncrona
            return true;
        case "salvarXMLTracer":
            if(tracer){
                tracer.initializeState(request.tracerState);
                tracer.salvarXMLTracer();
                sendResponse({status: "xml_salvo"});
            }
            break;
    }
    // retorna false para todas as outras mensagens síncronas.
    return false;
})

(async () => {
    try{
        const response = await chrome.runtime.sendMessage({action: "contentScriptLoaded"});

        if(response && response.shouldCrawl){
            console.log("Continuando um crawling existente...");
            crawler = new WebCrawler();
            crawler.initializeState(response.crawlerState);
            // Adiciona um delay ao crawler para garantir que a paǵina esteja pronta
            setTimeout(()=> crawler.rastrear(), 1000);
        } else if (response && response.shouldRecord) {
            console.log("Continunado uma gravação existente...");
            tracer = new WebTracer();
        }
    } catch(error){
        if(!error.message.includes("Could not establish connection")){
            console.error("Content Script: Erro na inicialização:", error);
        }
    }
})();