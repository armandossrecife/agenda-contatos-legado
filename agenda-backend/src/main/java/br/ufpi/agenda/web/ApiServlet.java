package br.ufpi.agenda.web;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.PrintWriter;
import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Base dos servlets REST: UTF-8, JSON, formato padrão de erro e despacho por método.
 *
 * <p>Mantém os dois recursos de compatibilidade do projeto original, úteis para
 * clientes que não conseguem usar todos os verbos HTTP ou ler o corpo de erros:
 * <ul>
 *   <li>POST com {@code ?_method=PUT|DELETE} ou header {@code X-HTTP-Method-Override};</li>
 *   <li>{@code ?suppress_response_codes=true}: responde sempre 200, com o código real no JSON.</li>
 * </ul>
 * Um frontend em HTML/CSS/JavaScript com {@code fetch()} não precisa de nenhum dos dois:
 * pode usar PUT e DELETE diretamente e ler {@code response.status}.
 */
public abstract class ApiServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    protected static final Gson GSON = new GsonBuilder().serializeNulls().disableHtmlEscaping().create();

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp)
            throws ServletException, IOException {
        req.setCharacterEncoding("UTF-8");
        resp.setCharacterEncoding("UTF-8");
        resp.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        resp.setHeader("Pragma", "no-cache");

        String metodo = req.getMethod().toUpperCase();
        if ("POST".equals(metodo)) {
            String override = req.getHeader("X-HTTP-Method-Override");
            if (override == null) {
                override = parametroDaQueryString(req, "_method");
            }
            if (override != null && !override.trim().isEmpty()) {
                metodo = override.trim().toUpperCase();
            }
        }

        switch (metodo) {
            case "GET":
                doGet(req, resp);
                break;
            case "POST":
                doPost(req, resp);
                break;
            case "PUT":
                doPut(req, resp);
                break;
            case "DELETE":
                doDelete(req, resp);
                break;
            case "OPTIONS":
                doOptions(req, resp);
                break;
            case "HEAD":
                doHead(req, resp);
                break;
            default:
                erro(req, resp, HttpServletResponse.SC_METHOD_NOT_ALLOWED, "Método não suportado: " + metodo);
        }
    }

    /**
     * Lê o parâmetro apenas da query string. Assim não consumimos o corpo JSON do POST
     * (getParameter() leria o corpo se o content-type fosse form-urlencoded).
     */
    protected static String parametroDaQueryString(HttpServletRequest req, String nome) {
        String qs = req.getQueryString();
        if (qs == null) {
            return null;
        }
        for (String par : qs.split("&")) {
            int i = par.indexOf('=');
            String chave = i >= 0 ? par.substring(0, i) : par;
            if (chave.equals(nome)) {
                return i >= 0 ? decodificar(par.substring(i + 1)) : "";
            }
        }
        return null;
    }

    /** No Java 8, URLDecoder.decode só aceita o nome do charset (String). */
    private static String decodificar(String valor) {
        try {
            return URLDecoder.decode(valor, "UTF-8");
        } catch (UnsupportedEncodingException e) {
            throw new IllegalStateException("UTF-8 não suportado", e); // nunca acontece
        }
    }

    protected static String lerCorpo(HttpServletRequest req) throws IOException {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = req.getReader()) {
            char[] buf = new char[4096];
            int n;
            while ((n = r.read(buf)) != -1) {
                sb.append(buf, 0, n);
            }
        }
        return sb.toString();
    }

    protected static boolean suprimirCodigos(HttpServletRequest req) {
        return "true".equalsIgnoreCase(parametroDaQueryString(req, "suppress_response_codes"));
    }

    protected static void json(HttpServletRequest req, HttpServletResponse resp, int status, Object corpo)
            throws IOException {
        resp.setStatus(suprimirCodigos(req) ? HttpServletResponse.SC_OK : status);
        resp.setContentType("application/json;charset=UTF-8");
        try (PrintWriter w = resp.getWriter()) {
            w.write(GSON.toJson(corpo));
        }
    }

    protected static void erro(HttpServletRequest req, HttpServletResponse resp, int status, String mensagem)
            throws IOException {
        erro(req, resp, status, mensagem, Collections.<String>emptyList());
    }

    protected static void erro(HttpServletRequest req, HttpServletResponse resp, int status, String mensagem,
                               List<String> detalhes) throws IOException {
        Map<String, Object> corpo = new LinkedHashMap<>();
        corpo.put("erro", mensagem);
        corpo.put("status", status);
        if (!detalhes.isEmpty()) {
            corpo.put("detalhes", detalhes);
        }
        json(req, resp, status, corpo);
    }
}
