"""Teste ponta a ponta do agenda-frontend (Playwright + Chromium).

Pré-requisitos: Tomcat com agenda-backend e agenda-frontend no ar.
  pip install playwright && python3 -m playwright install chromium
Uso:
  python3 teste_e2e.py                      # http://localhost:8080/agenda-frontend/
  python3 teste_e2e.py http://host:8080/agenda-frontend/
"""
import sys
from playwright.sync_api import sync_playwright, expect

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080/agenda-frontend/"
NOME = "Teste E2E Playwright"


def passo(texto):
    print("  [OK]", texto)


with sync_playwright() as p:
    navegador = p.chromium.launch()
    pg = navegador.new_page(viewport={"width": 1280, "height": 860})
    erros_js = []
    pg.on("pageerror", lambda e: erros_js.append(str(e)))

    pg.goto(URL)
    expect(pg.locator("#statusApi")).to_contain_text("API conectada", timeout=10000)
    passo("indicador mostra 'API conectada' (GET /api/health)")

    pg.wait_for_selector(".contato")
    total = pg.locator(".contato").count()
    passo(f"lista carregada com {total} contatos (GET /api/contatos)")

    pg.fill("#campoBusca", "zzzz-sem-resultado")
    expect(pg.locator(".vazio")).to_be_visible()
    passo("busca sem resultado mostra o estado vazio (GET /api/contatos?q=)")
    pg.fill("#campoBusca", "")
    expect(pg.locator(".contato")).to_have_count(total)

    pg.click("#btnNovo")
    expect(pg.locator("#modalForm")).to_be_visible()
    pg.fill("#listaEmails input", "sem-arroba")
    pg.click("#btnSalvar")
    expect(pg.locator("#formErros")).to_contain_text("O nome é obrigatório")
    expect(pg.locator("#formErros")).to_contain_text("E-mail inválido: sem-arroba")
    passo("validação local bloqueia nome vazio e e-mail inválido (nenhuma requisição)")

    pg.fill("#campoNome", NOME)
    pg.fill("#listaEmails input", "e2e@exemplo.com")
    pg.fill("#listaTelefones input", "(86) 90000-0000")
    pg.click("[data-adicionar=telefone]")
    pg.locator("#listaTelefones input").nth(1).fill("(86) 3222-0000")
    pg.click("#btnSalvar")
    expect(pg.locator("#painelDetalhes")).to_be_visible()
    expect(pg.locator("#detalhesNome")).to_have_text(NOME)
    expect(pg.locator("#detalhesCorpo")).to_contain_text("(86) 3222-0000")
    expect(pg.locator(".contato")).to_have_count(total + 1)
    passo("cadastro com dois telefones (POST /api/contatos -> 201)")

    pg.click("#detalhesEditar")
    expect(pg.locator("#modalForm")).to_be_visible()
    pg.fill("#campoCidade", "Parnaíba")
    pg.click("#btnSalvar")
    expect(pg.locator("#painelDetalhes")).to_be_visible()
    expect(pg.locator("#detalhesCorpo")).to_contain_text("Parnaíba")
    passo("edição da cidade (PUT /api/contatos/{id} -> 200)")

    pg.click("#detalhesExcluir")
    expect(pg.locator("#modalExcluir")).to_be_visible()
    pg.click("#btnConfirmarExclusao")
    expect(pg.locator(".contato")).to_have_count(total)
    passo("exclusão com confirmação (DELETE /api/contatos/{id} -> 200)")

    celular = navegador.new_page(viewport={"width": 390, "height": 800})
    celular.goto(URL)
    celular.wait_for_selector(".contato")
    expect(celular.locator(".contato .col-tel").first).to_be_hidden()
    passo("layout de celular oculta a coluna de telefone")

    navegador.close()
    if erros_js:
        print("ERROS DE JAVASCRIPT:", erros_js)
        sys.exit(1)
    print("Todos os testes passaram.")
