/*
 * Configuração do frontend.
 *
 * apiBaseUrl: endereço da API do agenda-backend.
 *  - Publicado no mesmo Tomcat (http://localhost:8080/agenda-frontend/): usa a mesma
 *    origem da página, então não há CORS envolvido.
 *  - Aberto por outro servidor (Live Server, python -m http.server...): usa
 *    http://localhost:8080, e o CorsFilter do backend libera a chamada.
 *
 * Também é possível trocar a URL sem editar este arquivo, abrindo a página com
 * ?api=http://outro-host:8080/agenda-backend/api
 */
(function () {
    "use strict";

    var CONTEXTO_BACKEND = "/agenda-backend/api";
    var PADRAO = "http://localhost:8080" + CONTEXTO_BACKEND;

    var url = PADRAO;
    if (location.protocol.indexOf("http") === 0 && location.port === "8080") {
        url = location.origin + CONTEXTO_BACKEND;
    }

    var parametro = new URLSearchParams(location.search).get("api");
    if (parametro) {
        url = parametro;
    }

    window.AGENDA_CONFIG = Object.freeze({
        apiBaseUrl: url.replace(/\/+$/, ""),
        intervaloStatusMs: 30000,   // verificação periódica de /api/health
        atrasoBuscaMs: 300          // espera após digitar antes de buscar
    });
})();
