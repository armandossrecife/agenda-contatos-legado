#!/usr/bin/env bash
# =====================================================================
# build.sh - constrói agenda-backend e agenda-frontend (gera os .war)
#
# Uso (de qualquer pasta):
#   ./scripts/build.sh                   # backend + frontend, com testes
#   ./scripts/build.sh --skip-tests      # sem os testes JUnit do backend
#   ./scripts/build.sh --only backend    # só uma aplicação
#   ./scripts/build.sh --only frontend
#
# Variáveis que podem ser sobrescritas:
#   JDK8_HOME   (padrão: /usr/lib/jvm/java-8-openjdk-amd64)
#   MVN         (padrão: mvn)
# =====================================================================
set -euo pipefail

JDK8_HOME="${JDK8_HOME:-/usr/lib/jvm/java-8-openjdk-amd64}"
MVN="${MVN:-mvn}"
SKIP_TESTS=false
ONLY=""

# Pasta raiz do repositório (a pasta acima de scripts/)
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ---------------------------------------------------------- mensagens
if [ -t 1 ]; then VERDE=$'\e[32m'; VERM=$'\e[31m'; AMAR=$'\e[33m'; NEGR=$'\e[1m'; FIM=$'\e[0m'
else VERDE=""; VERM=""; AMAR=""; NEGR=""; FIM=""; fi
info()  { printf '%s==>%s %s\n' "$NEGR" "$FIM" "$1"; }
ok()    { printf '%s[OK]%s %s\n' "$VERDE" "$FIM" "$1"; }
aviso() { printf '%s[AVISO]%s %s\n' "$AMAR" "$FIM" "$1"; }
erro()  { printf '%s[ERRO]%s %s\n' "$VERM" "$FIM" "$1" >&2; exit 1; }

uso() { sed -n '3,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

# ---------------------------------------------------------- argumentos
while [ $# -gt 0 ]; do
    case "$1" in
        --skip-tests) SKIP_TESTS=true ;;
        --only)
            shift
            case "${1:-}" in
                backend|frontend) ONLY="$1" ;;
                *) erro "--only aceita 'backend' ou 'frontend'" ;;
            esac ;;
        -h|--help) uso ;;
        *) erro "opção desconhecida: $1 (use --help)" ;;
    esac
    shift
done

# ---------------------------------------------------------- pré-requisitos
info "Verificando o ambiente"
[ -f "$RAIZ/pom.xml" ] || erro "pom.xml da raiz não encontrado em $RAIZ"
[ -x "$JDK8_HOME/bin/javac" ] || erro "JDK 8 não encontrado em $JDK8_HOME (instale: sudo apt install openjdk-8-jdk)"
command -v "$MVN" >/dev/null 2>&1 || erro "Maven não encontrado (comando '$MVN')"
ok "JDK 8: $JDK8_HOME"
ok "Maven: $(JAVA_HOME="$JDK8_HOME" "$MVN" -v 2>/dev/null | head -1)"

# ---------------------------------------------------------- build
ARGS=(-B clean package)
$SKIP_TESTS && ARGS+=(-DskipTests)
if [ -n "$ONLY" ]; then
    ARGS+=(-pl "agenda-$ONLY")
    ALVOS=("agenda-$ONLY")
else
    ALVOS=(agenda-backend agenda-frontend)
fi

info "Executando: mvn ${ARGS[*]}"
$SKIP_TESTS && aviso "Testes do backend desativados (--skip-tests)"
INICIO=$(date +%s)
(cd "$RAIZ" && JAVA_HOME="$JDK8_HOME" "$MVN" "${ARGS[@]}") || erro "O build falhou. Veja acima o arquivo e a linha do erro."
DURACAO=$(( $(date +%s) - INICIO ))

# ---------------------------------------------------------- resultado
info "Arquivos gerados"
for app in "${ALVOS[@]}"; do
    war="$RAIZ/$app/target/$app.war"
    [ -f "$war" ] || erro "WAR não encontrado: $war"
    ok "$app/target/$app.war ($(du -h "$war" | cut -f1))"
done

if [ -z "$ONLY" ] || [ "$ONLY" = "backend" ]; then
    rel="$RAIZ/agenda-backend/target/surefire-reports/br.ufpi.agenda.service.ContatoValidatorTest.txt"
    if ! $SKIP_TESTS && [ -f "$rel" ]; then
        ok "Testes: $(grep -m1 'Tests run' "$rel")"
    fi
fi

ok "Build concluído em ${DURACAO}s. Próximo passo: ./scripts/deploy.sh"
