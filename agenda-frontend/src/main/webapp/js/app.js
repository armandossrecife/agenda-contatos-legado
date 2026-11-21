/*
 * Agenda de Contatos - lógica da interface.
 *
 * Fluxo:
 *   carregar()  -> AgendaApi.listar(filtro) -> renderizarLista()
 *   clique numa linha -> abrirDetalhes(id) -> AgendaApi.buscar(id)
 *   "Novo contato" / "Editar" -> abrirFormulario() -> salvar() -> criar() ou atualizar()
 *   "Excluir" -> confirmar -> AgendaApi.excluir(id)
 *
 * Todo texto vindo da API é inserido com textContent (nunca innerHTML),
 * o que impede injeção de HTML/JavaScript pelos dados dos contatos.
 */
(function () {
    "use strict";

    var api = window.AgendaApi;
    var cfg = window.AGENDA_CONFIG;

    // ------------------------------------------------------------------ estado
    var estado = {
        contatos: [],
        filtro: "",
        detalhe: null,       // contato aberto no painel
        editandoId: null,    // null = criando
        excluindo: null,     // contato a excluir
        primeiraCarga: true
    };

    // ------------------------------------------------------------------ elementos
    function $(seletor, raiz) { return (raiz || document).querySelector(seletor); }

    var el = {
        lista: $("#lista"),
        indice: $("#indice"),
        contagem: $("#contagem"),
        carregando: $("#carregando"),
        alertaApi: $("#alertaApi"),
        busca: $("#campoBusca"),
        status: $("#statusApi"),
        form: $("#formContato"),
        formTitulo: $("#formTitulo"),
        formErros: $("#formErros"),
        btnSalvar: $("#btnSalvar"),
        listaTelefones: $("#listaTelefones"),
        listaEmails: $("#listaEmails"),
        detalhesNome: $("#detalhesNome"),
        detalhesAvatar: $("#detalhesAvatar"),
        detalhesCorpo: $("#detalhesCorpo"),
        excluirNome: $("#excluirNome"),
        btnConfirmarExclusao: $("#btnConfirmarExclusao"),
        avisos: $("#avisos")
    };

    var painel = bootstrap.Offcanvas.getOrCreateInstance("#painelDetalhes");
    var modalForm = bootstrap.Modal.getOrCreateInstance("#modalForm");
    var modalExcluir = bootstrap.Modal.getOrCreateInstance("#modalExcluir");
    var dicaStatus = new bootstrap.Tooltip(el.status);

    // ------------------------------------------------------------------ utilitários

    /** Cria um elemento: criar("span", {className: "x"}, ["texto", outroElemento]) */
    function criar(tag, props, filhos) {
        var n = document.createElement(tag);
        if (props) {
            Object.keys(props).forEach(function (k) {
                if (k === "dataset") { Object.assign(n.dataset, props[k]); }
                else if (k in n) { n[k] = props[k]; }
                else { n.setAttribute(k, props[k]); }
            });
        }
        (filhos || []).forEach(function (f) {
            if (f === null || f === undefined || f === false) return;
            n.appendChild(typeof f === "string" ? document.createTextNode(f) : f);
        });
        return n;
    }

    function icone(nome) { return criar("i", { className: "bi bi-" + nome, "aria-hidden": "true" }); }

    function semAcento(s) { return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

    /** Letra do índice: "Ágata" -> "A"; nomes que não começam com letra vão para "#". */
    function letraDe(nome) {
        var l = semAcento(nome).charAt(0).toUpperCase();
        return /[A-Z]/.test(l) ? l : "#";
    }

    function iniciais(nome) {
        var partes = (nome || "?").trim().split(/\s+/);
        var ini = partes[0].charAt(0) + (partes.length > 1 ? partes[partes.length - 1].charAt(0) : "");
        return ini.toUpperCase();
    }

    var CORES = ["#2B5D86", "#3D7A5E", "#8A4F7D", "#B0602A", "#4F5DA8", "#2F7F86", "#8C6A1F", "#A23E48"];
    function corDe(nome) {
        var h = 0;
        for (var i = 0; i < (nome || "").length; i++) { h = (h * 31 + nome.charCodeAt(i)) >>> 0; }
        return CORES[h % CORES.length];
    }

    function avatar(contato, grande) {
        var a = criar("span", { className: "avatar" + (grande ? " avatar-lg" : ""), "aria-hidden": "true" }, [iniciais(contato.nome)]);
        a.style.setProperty("--cor", corDe(contato.nome));
        return a;
    }

    /** Destaca o termo buscado (sem diferenciar maiúsculas ou acentos) usando <mark>. */
    function destacar(texto, termo) {
        var frag = document.createDocumentFragment();
        texto = texto || "";
        if (!termo) { frag.appendChild(document.createTextNode(texto)); return frag; }
        var base = semAcento(texto).toLowerCase();
        var alvo = semAcento(termo).toLowerCase();
        var i = base.indexOf(alvo);
        if (i < 0 || base.length !== texto.length) { frag.appendChild(document.createTextNode(texto)); return frag; }
        frag.appendChild(document.createTextNode(texto.slice(0, i)));
        frag.appendChild(criar("mark", null, [texto.slice(i, i + alvo.length)]));
        frag.appendChild(document.createTextNode(texto.slice(i + alvo.length)));
        return frag;
    }

    function localDe(c) {
        var e = c.endereco || {};
        return [e.cidade, e.estado].filter(Boolean).join(" – ");
    }

    function avisar(mensagem, tipo) {
        var toast = criar("div", {
            className: "toast align-items-center border-0 text-bg-" + (tipo || "success"),
            role: tipo === "danger" ? "alert" : "status"
        }, [
            criar("div", { className: "d-flex" }, [
                criar("div", { className: "toast-body" }, [mensagem]),
                criar("button", { type: "button", className: "btn-close me-2 m-auto" + (tipo === "warning" ? "" : " btn-close-white"), "aria-label": "Fechar", "data-bs-dismiss": "toast" })
            ])
        ]);
        el.avisos.appendChild(toast);
        toast.addEventListener("hidden.bs.toast", function () { toast.remove(); });
        bootstrap.Toast.getOrCreateInstance(toast, { delay: 4500 }).show();
    }

    function ocupado(botao, sim) {
        botao.disabled = sim;
        var spinner = botao.querySelector(".spinner-border");
        if (spinner) spinner.classList.toggle("d-none", !sim);
    }

    // ------------------------------------------------------------------ status da API

    async function verificarApi() {
        try {
            var s = await api.saude();
            var ok = s.status === "UP";
            el.status.classList.toggle("ok", ok);
            el.status.classList.toggle("erro", !ok);
            $(".rotulo", el.status).textContent = ok ? "API conectada" : "Banco indisponível";
            dicaStatus.setContent({ ".tooltip-inner": ok
                ? (s.banco + ", " + s.servidor + ", Java " + s.java)
                : ("O backend respondeu, mas o banco não: " + (s.erro || "erro desconhecido")) });
        } catch (e) {
            el.status.classList.remove("ok");
            el.status.classList.add("erro");
            $(".rotulo", el.status).textContent = e.status === 503 ? "Banco indisponível" : "API indisponível";
            dicaStatus.setContent({ ".tooltip-inner": e.message });
        }
    }

    function mostrarAlertaApi(erro) {
        el.alertaApi.replaceChildren(
            criar("h2", { className: "alert-heading h6" }, [icone("plug"), " Não foi possível carregar os contatos"]),
            criar("p", { className: "mb-2" }, [erro.message]),
            criar("p", { className: "mb-0 small" }, [
                "Confira se o Tomcat está rodando com o agenda-backend e se ",
                criar("a", { href: api.url + "/health", target: "_blank", rel: "noopener" }, [api.url + "/health"]),
                " responde. Depois, ",
                criar("a", { href: "#", className: "alert-link", id: "tentarDeNovo" }, ["tente de novo"]),
                "."
            ])
        );
        el.alertaApi.classList.remove("d-none");
        $("#tentarDeNovo").addEventListener("click", function (ev) { ev.preventDefault(); carregar(); verificarApi(); });
    }

    // ------------------------------------------------------------------ listagem

    async function carregar() {
        if (estado.primeiraCarga) el.carregando.classList.remove("d-none");
        try {
            estado.contatos = await api.listar(estado.filtro);
            el.alertaApi.classList.add("d-none");
            renderizarLista();
        } catch (e) {
            estado.contatos = [];
            el.lista.replaceChildren();
            renderizarIndice({});
            el.contagem.textContent = "";
            mostrarAlertaApi(e);
        } finally {
            el.carregando.classList.add("d-none");
            estado.primeiraCarga = false;
        }
    }

    function renderizarLista() {
        var lista = estado.contatos;
        var n = lista.length;
        el.contagem.textContent = n === 0 ? "" : (n === 1 ? "1 contato" : n + " contatos");

        if (n === 0) {
            el.lista.replaceChildren(estadoVazio());
            renderizarIndice({});
            return;
        }

        // Agrupa por letra mantendo a ordem alfabética que vem da API
        var grupos = {};
        var ordem = [];
        lista.forEach(function (c) {
            var l = letraDe(c.nome);
            if (!grupos[l]) { grupos[l] = []; ordem.push(l); }
            grupos[l].push(c);
        });
        ordem.sort(function (a, b) { return a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b); });

        var frag = document.createDocumentFragment();
        ordem.forEach(function (letra) {
            var itens = grupos[letra].map(linhaContato);
            frag.appendChild(criar("section", { className: "grupo", id: "grupo-" + (letra === "#" ? "outros" : letra), dataset: { letra: letra } }, [
                criar("h2", { className: "grupo-letra" }, [letra]),
                criar("div", { className: "list-group shadow-sm" }, itens)
            ]));
        });
        el.lista.replaceChildren(frag);
        renderizarIndice(grupos);
        observarGrupos();
    }

    function linhaContato(c) {
        var termo = estado.filtro;
        var telefones = c.telefones || [];
        var emails = c.emails || [];
        var botao = criar("button", {
            type: "button",
            className: "list-group-item list-group-item-action contato",
            "aria-label": "Ver detalhes de " + c.nome
        }, [
            avatar(c, false),
            criar("div", { className: "min-w-0" }, [
                criar("div", { className: "nome text-truncate" }, [destacar(c.nome, termo)]),
                criar("div", { className: "sub text-truncate" }, [localDe(c) || "Sem endereço"])
            ]),
            criar("div", { className: "col-info col-tel" }, telefones.length
                ? [icone("telephone"), " ", destacar(telefones[0], termo), telefones.length > 1 ? "  +" + (telefones.length - 1) : ""]
                : [criar("span", { className: "text-body-tertiary" }, ["Sem telefone"])]),
            criar("div", { className: "col-info col-email" }, emails.length
                ? [icone("envelope"), " ", destacar(emails[0], termo), emails.length > 1 ? "  +" + (emails.length - 1) : ""]
                : [criar("span", { className: "text-body-tertiary" }, ["Sem e-mail"])]),
            criar("span", { className: "seta" }, [icone("chevron-right")])
        ]);
        botao.addEventListener("click", function () { abrirDetalhes(c.id); });
        return botao;
    }

    function estadoVazio() {
        if (estado.filtro) {
            var limpar = criar("button", { type: "button", className: "btn btn-outline-secondary btn-sm mt-2" }, ["Limpar busca"]);
            limpar.addEventListener("click", function () { el.busca.value = ""; estado.filtro = ""; carregar(); el.busca.focus(); });
            return criar("div", { className: "vazio" }, [
                icone("search"),
                criar("h2", null, ["Nenhum contato encontrado para “" + estado.filtro + "”"]),
                criar("p", { className: "text-body-secondary mb-0" }, ["A busca procura no nome, nos telefones e nos e-mails."]),
                limpar
            ]);
        }
        var novo = criar("button", { type: "button", className: "btn btn-primary mt-3" }, [icone("person-plus-fill"), " Novo contato"]);
        novo.addEventListener("click", function () { abrirFormulario(null); });
        return criar("div", { className: "vazio" }, [
            icone("journal"),
            criar("h2", null, ["A agenda está vazia"]),
            criar("p", { className: "text-body-secondary mb-0" }, ["Cadastre o primeiro contato para começar."]),
            novo
        ]);
    }

    // ------------------------------------------------------------------ índice alfabético

    var LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

    function renderizarIndice(grupos) {
        var botoes = LETRAS.map(function (l) {
            var existe = !!grupos[l];
            var b = criar("button", {
                type: "button",
                disabled: !existe,
                dataset: { letra: l },
                "aria-label": existe ? "Ir para a letra " + (l === "#" ? "outros" : l) : "Nenhum contato com " + l
            }, [l]);
            if (existe) {
                b.addEventListener("click", function () {
                    var alvo = document.getElementById("grupo-" + (l === "#" ? "outros" : l));
                    var reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                    alvo.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "start" });
                    marcarLetra(l);
                });
            }
            return b;
        });
        el.indice.replaceChildren.apply(el.indice, botoes);
    }

    function marcarLetra(letra) {
        el.indice.querySelectorAll("button").forEach(function (b) {
            b.classList.toggle("ativa", b.dataset.letra === letra);
        });
    }

    var observador = null;
    function observarGrupos() {
        if (!("IntersectionObserver" in window)) return;
        if (observador) observador.disconnect();
        observador = new IntersectionObserver(function (entradas) {
            entradas.forEach(function (e) { if (e.isIntersecting) marcarLetra(e.target.dataset.letra); });
        }, { rootMargin: "-90px 0px -70% 0px" });
        document.querySelectorAll(".grupo").forEach(function (g) { observador.observe(g); });
    }

    // ------------------------------------------------------------------ busca

    var temporizador = null;
    el.busca.addEventListener("input", function () {
        clearTimeout(temporizador);
        temporizador = setTimeout(function () {
            estado.filtro = el.busca.value.trim();
            carregar();
        }, cfg.atrasoBuscaMs);
    });

    // Atalho "/" para focar a busca (fora de campos de texto)
    document.addEventListener("keydown", function (ev) {
        var digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        if (ev.key === "/" && !digitando && !document.querySelector(".modal.show")) {
            ev.preventDefault();
            el.busca.focus();
        }
    });

    // ------------------------------------------------------------------ detalhes

    async function abrirDetalhes(id) {
        try {
            var c = await api.buscar(id);
            estado.detalhe = c;
            preencherDetalhes(c);
            painel.show();
        } catch (e) {
            if (e.status === 404) {
                avisar("Esse contato não existe mais. A lista foi atualizada.", "warning");
                carregar();
            } else {
                avisar(e.message, "danger");
            }
        }
    }

    function botaoCopiar(valor, rotulo) {
        var b = criar("button", { type: "button", className: "btn btn-sm btn-outline-secondary btn-copiar", title: "Copiar " + rotulo, "aria-label": "Copiar " + rotulo + " " + valor }, [icone("copy")]);
        b.addEventListener("click", function () {
            if (!navigator.clipboard) { avisar("Copiar não está disponível neste navegador.", "warning"); return; }
            navigator.clipboard.writeText(valor).then(
                function () { avisar(rotulo.charAt(0).toUpperCase() + rotulo.slice(1) + " copiado."); },
                function () { avisar("Não foi possível copiar.", "danger"); });
        });
        return b;
    }

    function preencherDetalhes(c) {
        el.detalhesNome.textContent = c.nome;
        el.detalhesAvatar.textContent = iniciais(c.nome);
        el.detalhesAvatar.style.setProperty("--cor", corDe(c.nome));

        var blocos = [];

        var tels = c.telefones || [];
        blocos.push(criar("section", { className: "detalhe-bloco" }, [
            criar("h3", null, [icone("telephone"), " Telefones"]),
            tels.length
                ? criar("ul", null, tels.map(function (t) {
                    return criar("li", null, [
                        criar("a", { href: "tel:" + t.replace(/[^0-9+]/g, "") }, [t]),
                        botaoCopiar(t, "telefone")
                    ]);
                }))
                : criar("p", { className: "text-body-tertiary mb-0" }, ["Nenhum telefone cadastrado."])
        ]));

        var emails = c.emails || [];
        blocos.push(criar("section", { className: "detalhe-bloco" }, [
            criar("h3", null, [icone("envelope"), " E-mails"]),
            emails.length
                ? criar("ul", null, emails.map(function (m) {
                    return criar("li", null, [
                        criar("a", { href: "mailto:" + m, className: "text-break" }, [m]),
                        botaoCopiar(m, "e-mail")
                    ]);
                }))
                : criar("p", { className: "text-body-tertiary mb-0" }, ["Nenhum e-mail cadastrado."])
        ]));

        var e = c.endereco || {};
        var linhas = [e.rua, [e.cep, e.cidade].filter(Boolean).join(" "), [e.estado, e.pais].filter(Boolean).join(", ")].filter(Boolean);
        var consulta = [e.rua, e.cidade, e.estado, e.pais].filter(Boolean).join(", ");
        blocos.push(criar("section", { className: "detalhe-bloco" }, [
            criar("h3", null, [icone("geo-alt"), " Endereço"]),
            linhas.length
                ? criar("address", { className: "mb-1" }, linhas.reduce(function (acc, l, i) {
                    if (i) acc.push(criar("br"));
                    acc.push(l);
                    return acc;
                }, []))
                : criar("p", { className: "text-body-tertiary mb-0" }, ["Nenhum endereço cadastrado."]),
            consulta
                ? criar("a", { href: "https://www.openstreetmap.org/search?query=" + encodeURIComponent(consulta), target: "_blank", rel: "noopener", className: "small" }, [icone("map"), " Ver no mapa"])
                : null
        ]));

        blocos.push(criar("p", { className: "small text-body-tertiary mt-4 mb-0" }, ["Código do contato: " + c.id]));
        el.detalhesCorpo.replaceChildren.apply(el.detalhesCorpo, blocos);
    }

    $("#detalhesEditar").addEventListener("click", function () {
        if (!estado.detalhe) return;
        painel.hide();
        abrirFormulario(estado.detalhe);
    });
    $("#detalhesExcluir").addEventListener("click", function () {
        if (!estado.detalhe) return;
        painel.hide();   // fecha o painel antes de abrir o modal (evita disputa de foco)
        confirmarExclusao(estado.detalhe);
    });

    // ------------------------------------------------------------------ formulário

    var LIMITES = { nome: 120, rua: 200, cep: 20, cidade: 100, estado: 60, pais: 60, email: 150 };
    var RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    var RE_TELEFONE = /^[0-9+()\-.\s]{6,30}$/;

    function itemLista(tipo, valor) {
        var ehTel = tipo === "telefone";
        var input = criar("input", {
            className: "form-control",
            type: ehTel ? "tel" : "email",
            value: valor || "",
            placeholder: ehTel ? "(86) 99999-0000" : "nome@exemplo.com",
            maxLength: ehTel ? 30 : LIMITES.email,
            autocomplete: "off",
            "aria-label": ehTel ? "Telefone" : "E-mail"
        });
        var remover = criar("button", { type: "button", className: "btn btn-outline-secondary btn-remover", "aria-label": "Remover " + tipo }, [icone("x-lg")]);
        var grupo = criar("div", { className: "input-group item-lista", dataset: { tipo: tipo } }, [
            input, remover, criar("div", { className: "invalid-feedback" }, [ehTel ? "Use de 6 a 30 caracteres: números, espaço, + ( ) - ." : "Formato esperado: nome@dominio.com"])
        ]);
        remover.addEventListener("click", function () {
            var container = grupo.parentNode;
            grupo.remove();
            if (!container.children.length) container.appendChild(itemLista(tipo, ""));
        });
        return grupo;
    }

    function preencherLista(container, tipo, valores) {
        var itens = (valores && valores.length ? valores : [""]).map(function (v) { return itemLista(tipo, v); });
        container.replaceChildren.apply(container, itens);
    }

    document.querySelectorAll("[data-adicionar]").forEach(function (b) {
        b.addEventListener("click", function () {
            var tipo = b.dataset.adicionar;
            var container = tipo === "telefone" ? el.listaTelefones : el.listaEmails;
            var novo = itemLista(tipo, "");
            container.appendChild(novo);
            novo.querySelector("input").focus();
        });
    });

    function abrirFormulario(contato) {
        estado.editandoId = contato ? contato.id : null;
        el.formTitulo.textContent = contato ? "Editar contato" : "Novo contato";
        $(".rotulo", el.btnSalvar).textContent = contato ? "Salvar alterações" : "Salvar contato";
        el.form.reset();
        el.form.querySelectorAll(".is-invalid").forEach(function (n) { n.classList.remove("is-invalid"); });
        el.formErros.classList.add("d-none");

        var e = (contato && contato.endereco) || {};
        $("#campoNome").value = contato ? contato.nome : "";
        $("#campoRua").value = e.rua || "";
        $("#campoCep").value = e.cep || "";
        $("#campoCidade").value = e.cidade || "";
        $("#campoEstado").value = e.estado || "";
        $("#campoPais").value = e.pais || (contato ? "" : "Brasil");
        preencherLista(el.listaTelefones, "telefone", contato && contato.telefones);
        preencherLista(el.listaEmails, "email", contato && contato.emails);
        modalForm.show();
    }

    document.getElementById("modalForm").addEventListener("shown.bs.modal", function () { $("#campoNome").focus(); });

    function valoresDe(container) {
        return Array.prototype.map.call(container.querySelectorAll("input"), function (i) { return i.value.trim(); })
            .filter(function (v) { return v !== ""; });
    }

    function texto(id) {
        var v = $(id).value.trim();
        return v === "" ? null : v;
    }

    function coletar() {
        return {
            nome: $("#campoNome").value.trim(),
            telefones: valoresDe(el.listaTelefones),
            emails: valoresDe(el.listaEmails),
            endereco: {
                rua: texto("#campoRua"),
                cep: texto("#campoCep"),
                cidade: texto("#campoCidade"),
                estado: texto("#campoEstado"),
                pais: texto("#campoPais")
            }
        };
    }

    /** Mesmas regras do ContatoValidator do backend, para avisar antes de enviar. */
    function validarLocal(c) {
        var erros = [];
        var nome = $("#campoNome");
        var nomeOk = c.nome !== "" && c.nome.length <= LIMITES.nome;
        nome.classList.toggle("is-invalid", !nomeOk);
        if (!nomeOk) erros.push("O nome é obrigatório (até 120 caracteres).");

        el.listaTelefones.querySelectorAll("input").forEach(function (i) {
            var v = i.value.trim();
            var invalido = v !== "" && !RE_TELEFONE.test(v);
            i.classList.toggle("is-invalid", invalido);
            if (invalido) erros.push("Telefone inválido: " + v);
        });
        el.listaEmails.querySelectorAll("input").forEach(function (i) {
            var v = i.value.trim();
            var invalido = v !== "" && (v.length > LIMITES.email || !RE_EMAIL.test(v));
            i.classList.toggle("is-invalid", invalido);
            if (invalido) erros.push("E-mail inválido: " + v);
        });
        return erros;
    }

    function mostrarErrosForm(titulo, erros) {
        var filhos = [criar("strong", null, [titulo])];
        if (erros.length) {
            filhos.push(criar("ul", { className: "mb-0 mt-1" }, erros.map(function (m) { return criar("li", null, [m]); })));
        }
        el.formErros.replaceChildren.apply(el.formErros, filhos);
        el.formErros.classList.remove("d-none");
        el.formErros.scrollIntoView({ block: "nearest" });
    }

    el.form.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        var contato = coletar();
        var errosLocais = validarLocal(contato);
        if (errosLocais.length) {
            mostrarErrosForm("Corrija os campos destacados:", errosLocais);
            return;
        }
        el.formErros.classList.add("d-none");
        ocupado(el.btnSalvar, true);
        try {
            var salvo = estado.editandoId === null
                ? await api.criar(contato)
                : await api.atualizar(estado.editandoId, contato);
            modalForm.hide();
            avisar(estado.editandoId === null ? "Contato salvo." : "Alterações salvas.");
            await carregar();
            if (salvo && salvo.id) abrirDetalhes(salvo.id);
        } catch (e) {
            if (e.status === 400) {
                mostrarErrosForm("A API recusou os dados:", e.detalhes.length ? e.detalhes : [e.message]);
            } else if (e.status === 404) {
                modalForm.hide();
                avisar("Esse contato foi excluído por outra pessoa. A lista foi atualizada.", "warning");
                carregar();
            } else {
                mostrarErrosForm("Não foi possível salvar.", [e.message]);
            }
        } finally {
            ocupado(el.btnSalvar, false);
        }
    });

    $("#btnNovo").addEventListener("click", function () { abrirFormulario(null); });

    // ------------------------------------------------------------------ exclusão

    function confirmarExclusao(contato) {
        estado.excluindo = contato;
        el.excluirNome.textContent = contato.nome;
        modalExcluir.show();
    }

    el.btnConfirmarExclusao.addEventListener("click", async function () {
        var c = estado.excluindo;
        if (!c) return;
        ocupado(el.btnConfirmarExclusao, true);
        try {
            await api.excluir(c.id);
            avisar(c.nome + " foi excluído.");
        } catch (e) {
            avisar(e.status === 404 ? "Esse contato já tinha sido excluído." : e.message, e.status === 404 ? "warning" : "danger");
        } finally {
            ocupado(el.btnConfirmarExclusao, false);
            modalExcluir.hide();
            painel.hide();
            estado.excluindo = null;
            estado.detalhe = null;
            carregar();
        }
    });

    // ------------------------------------------------------------------ início

    $("#urlApi").textContent = api.url;
    carregar();
    verificarApi();
    setInterval(verificarApi, cfg.intervaloStatusMs);
})();
