/*
 * Cliente da API REST do agenda-backend.
 *
 * Cada função devolve uma Promise. Em caso de erro, rejeita com ApiError,
 * que traz o status HTTP e as mensagens no formato do backend:
 *   { "erro": "...", "status": 400, "detalhes": ["...", "..."] }
 * status 0 significa que a API não respondeu (servidor parado, URL errada, CORS).
 */
(function () {
    "use strict";

    var BASE = window.AGENDA_CONFIG.apiBaseUrl;

    function ApiError(status, mensagem, detalhes) {
        this.name = "ApiError";
        this.status = status;
        this.message = mensagem;
        this.detalhes = detalhes || [];
    }
    ApiError.prototype = Object.create(Error.prototype);
    ApiError.prototype.constructor = ApiError;

    async function requisitar(metodo, caminho, corpo) {
        var opcoes = { method: metodo, headers: { "Accept": "application/json" } };
        if (corpo !== undefined) {
            opcoes.headers["Content-Type"] = "application/json; charset=UTF-8";
            opcoes.body = JSON.stringify(corpo);
        }

        var resposta;
        try {
            resposta = await fetch(BASE + caminho, opcoes);
        } catch (e) {
            throw new ApiError(0, "A API não respondeu em " + BASE + ".");
        }

        var dados = null;
        var texto = await resposta.text();
        if (texto) {
            try {
                dados = JSON.parse(texto);
            } catch (e) {
                throw new ApiError(resposta.status, "Resposta inesperada da API (HTTP " + resposta.status + ").");
            }
        }

        if (!resposta.ok) {
            var msg = dados && dados.erro ? dados.erro : "Erro HTTP " + resposta.status;
            throw new ApiError(resposta.status, msg, dados && dados.detalhes);
        }
        return dados;
    }

    window.AgendaApi = {
        url: BASE,
        ApiError: ApiError,

        /** GET /api/health */
        saude: function () { return requisitar("GET", "/health"); },

        /** GET /api/contatos?q=filtro */
        listar: function (filtro) {
            var q = filtro ? "?q=" + encodeURIComponent(filtro) : "";
            return requisitar("GET", "/contatos" + q);
        },

        /** GET /api/contatos/{id} */
        buscar: function (id) { return requisitar("GET", "/contatos/" + encodeURIComponent(id)); },

        /** POST /api/contatos */
        criar: function (contato) { return requisitar("POST", "/contatos", contato); },

        /** PUT /api/contatos/{id} */
        atualizar: function (id, contato) { return requisitar("PUT", "/contatos/" + encodeURIComponent(id), contato); },

        /** DELETE /api/contatos/{id} */
        excluir: function (id) { return requisitar("DELETE", "/contatos/" + encodeURIComponent(id)); }
    };
})();
