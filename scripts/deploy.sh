#!/usr/bin/env bash
# =====================================================================
# deploy.sh - implanta agenda-backend.war e agenda-frontend.war
#             no Apache Tomcat 8.5 standalone e confere se subiram
#
# Uso (de qualquer pasta):
#   ./scripts/deploy.sh                  # implanta os dois WARs e reinicia o Tomcat
#   ./scripts/deploy.sh --build          # roda o build.sh antes
#   ./scripts/deploy.sh --only backend   # implanta só uma aplicação
#   ./scripts/deploy.sh --no-restart     # copia os WARs com o Tomcat ligado (hot deploy)
#   ./scripts/deploy.sh --stop           # só para o Tomcat
#
# Variáveis que podem ser sobrescritas:
#   TOMCAT_HOME (padrão: /opt/apache-tomcat-8.5.100)
#   JDK8_HOME   (padrão: /usr/lib/jvm/java-8-openjdk-amd64)
#   PORTA       (padrão: 8080)
#   TIMEOUT     (padrão: 90 segundos para a aplicação responder)
# =====================================================================
set -euo pipefail

TOMCAT_HOME="${TOMCAT_HOME:-/opt/apache-tomcat-8.5.100}"
JDK8_HOME="${JDK8_HOME:-/usr/lib/jvm/java-8-openjdk-amd64}"
PORTA="${PORTA:-8080}"
TIMEOUT="${TIMEOUT:-90}"
BASE_URL="http://localhost:$PORTA"

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBAPPS="$TOMCAT_HOME/webapps"
LOG="$TOMCAT_HOME/logs/catalina.out"

FAZER_BUILD=false
REINICIAR=true
SO_PARAR=false
APPS=(agenda-backend agenda-frontend)

# ---------------------------------------------------------- mensagens
if [ -t 1 ]; then VERDE=$'\e[32m'; VERM=$'\e[31m'; AMAR=$'\e[33m'; NEGR=$'\e[1m'; FIM=$'\e[0m'
else VERDE=""; VERM=""; AMAR=""; NEGR=""; FIM=""; fi
info()  { printf '%s==>%s %s\n' "$NEGR" "$FIM" "$1"; }
ok()    { printf '%s[OK]%s %s\n' "$VERDE" "$FIM" "$1"; }
aviso() { printf '%s[AVISO]%s %s\n' "$AMAR" "$FIM" "$1"; }
erro()  { printf '%s[ERRO]%s %s\n' "$VERM" "$FIM" "$1" >&2; exit 1; }

uso() { sed -n '3,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

# ---------------------------------------------------------- argumentos
while [ $# -gt 0 ]; do
    case "$1" in
        --build) FAZER_BUILD=true ;;
        --no-restart) REINICIAR=false ;;
        --stop) SO_PARAR=true ;;
        --only)
            shift
            case "${1:-}" in
                backend|frontend) APPS=("agenda-$1") ;;
                *) erro "--only aceita 'backend' ou 'frontend'" ;;
            esac ;;
        -h|--help) uso ;;
        *) erro "opção desconhecida: $1 (use --help)" ;;
    esac
    shift
done

# sudo só quando necessário (pasta do Tomcat sem permissão de escrita)
if [ "$(id -u)" -eq 0 ] || [ -w "$WEBAPPS" ]; then SUDO=""; else SUDO="sudo"; fi

# ---------------------------------------------------------- funções do Tomcat
tomcat_pid() {
    # Processo do Tomcat standalone: catalina.base aponta para TOMCAT_HOME.
    # (O Tomcat do Eclipse usa catalina.base na pasta do workspace e não é afetado.)
    pgrep -f "catalina.base=$TOMCAT_HOME( |$)" || true
}

porta_em_uso() {
    if command -v ss >/dev/null 2>&1; then ss -ltn 2>/dev/null | grep -q ":$PORTA "
    else (exec 3<>"/dev/tcp/127.0.0.1/$PORTA") 2>/dev/null; fi
}

parar_tomcat() {
    local pid; pid="$(tomcat_pid)"
    if [ -z "$pid" ]; then ok "Tomcat standalone já estava parado"; return; fi
    info "Parando o Tomcat (PID $pid)"
    $SUDO env JAVA_HOME="$JDK8_HOME" "$TOMCAT_HOME/bin/shutdown.sh" >/dev/null 2>&1 || true
    for _ in $(seq 1 30); do
        [ -z "$(tomcat_pid)" ] && { ok "Tomcat parado"; return; }
        sleep 1
    done
    aviso "O Tomcat não parou em 30s; encerrando o processo"
    $SUDO kill -9 $pid 2>/dev/null || true
    sleep 1
}

iniciar_tomcat() {
    info "Iniciando o Tomcat com o JDK 8"
    $SUDO env JAVA_HOME="$JDK8_HOME" "$TOMCAT_HOME/bin/startup.sh" >/dev/null
    ok "startup.sh executado"
}

esperar_url() {   # $1 = URL, $2 = descrição, $3 = texto esperado (opcional)
    local url="$1" desc="$2" esperado="${3:-}" corpo
    for _ in $(seq 1 "$TIMEOUT"); do
        if corpo="$(curl -fsS --max-time 3 "$url" 2>/dev/null)"; then
            if [ -z "$esperado" ] || printf '%s' "$corpo" | grep -q "$esperado"; then
                ok "$desc respondendo: $url"
                [ -n "$esperado" ] && printf '       %s\n' "$corpo"
                return 0
            fi
        fi
        sleep 1
    done
    return 1
}

mostrar_log() {
    aviso "Últimas linhas de $LOG:"
    $SUDO tail -n 40 "$LOG" 2>/dev/null | sed 's/^/       /' || true
}

# ---------------------------------------------------------- pré-requisitos
info "Verificando o ambiente"
[ -x "$TOMCAT_HOME/bin/startup.sh" ] || erro "Tomcat não encontrado em $TOMCAT_HOME (defina TOMCAT_HOME)"
[ -x "$JDK8_HOME/bin/java" ] || erro "JDK 8 não encontrado em $JDK8_HOME (defina JDK8_HOME)"
command -v curl >/dev/null 2>&1 || erro "curl não instalado (sudo apt install curl)"
ok "Tomcat: $TOMCAT_HOME"
ok "JDK 8: $JDK8_HOME"
[ -n "$SUDO" ] && aviso "A pasta $WEBAPPS exige sudo; sua senha pode ser pedida"

if $SO_PARAR; then parar_tomcat; exit 0; fi

# ---------------------------------------------------------- build opcional
if $FAZER_BUILD; then
    if [ ${#APPS[@]} -eq 1 ]; then "$RAIZ/scripts/build.sh" --only "${APPS[0]#agenda-}"
    else "$RAIZ/scripts/build.sh"; fi
fi

for app in "${APPS[@]}"; do
    [ -f "$RAIZ/$app/target/$app.war" ] || erro "$app/target/$app.war não existe. Rode ./scripts/build.sh (ou use --build)."
done

# ---------------------------------------------------------- conflito com o Tomcat do Eclipse
if [ -z "$(tomcat_pid)" ] && porta_em_uso; then
    erro "A porta $PORTA está em uso por outro processo (provavelmente o Tomcat do Eclipse). Pare-o na aba Servers e rode de novo."
fi

# ---------------------------------------------------------- implantação
$REINICIAR && parar_tomcat

info "Copiando os WARs para $WEBAPPS"
for app in "${APPS[@]}"; do
    # Remove o WAR e a pasta descompactada antigos para evitar arquivos obsoletos
    $SUDO rm -rf "$WEBAPPS/$app" "$WEBAPPS/$app.war"
    $SUDO cp "$RAIZ/$app/target/$app.war" "$WEBAPPS/"
    ok "$app.war copiado ($(du -h "$RAIZ/$app/target/$app.war" | cut -f1))"
done

if $REINICIAR || [ -z "$(tomcat_pid)" ]; then
    iniciar_tomcat
else
    info "Tomcat ligado: aguardando a reimplantação automática (hot deploy)"
fi

# ---------------------------------------------------------- verificação
info "Aguardando as aplicações responderem (até ${TIMEOUT}s)"
FALHOU=false
for app in "${APPS[@]}"; do
    case "$app" in
        agenda-backend)
            esperar_url "$BASE_URL/agenda-backend/api/health" "agenda-backend" '"status":"UP"' || {
                FALHOU=true
                if curl -s --max-time 3 "$BASE_URL/agenda-backend/api/health" | grep -q '"status":"DOWN"'; then
                    aviso "O backend subiu, mas o banco não respondeu (status DOWN). Rode: sudo systemctl start mysql"
                else
                    aviso "agenda-backend não respondeu em ${TIMEOUT}s"
                fi
            } ;;
        agenda-frontend)
            esperar_url "$BASE_URL/agenda-frontend/" "agenda-frontend" || { FALHOU=true; aviso "agenda-frontend não respondeu em ${TIMEOUT}s"; } ;;
    esac
done

if $FALHOU; then
    mostrar_log
    erro "A implantação terminou com problemas. Veja o log acima."
fi

echo
ok "Implantação concluída"
for app in "${APPS[@]}"; do
    case "$app" in
        agenda-backend)  printf '       API:      %s/agenda-backend/api/contatos\n' "$BASE_URL" ;;
        agenda-frontend) printf '       Frontend: %s/agenda-frontend/\n' "$BASE_URL" ;;
    esac
done
printf '       Log:      sudo tail -f %s\n' "$LOG"
printf '       Parar:    ./scripts/deploy.sh --stop\n'
