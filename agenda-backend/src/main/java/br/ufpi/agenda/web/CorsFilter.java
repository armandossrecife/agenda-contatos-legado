package br.ufpi.agenda.web;

import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.Collections;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Libera a API para um frontend HTML/CSS/JavaScript servido em outra origem
 * (por exemplo, o Live Server do VS Code em http://127.0.0.1:5500).
 *
 * <p>As origens permitidas vêm do init-param {@code allowedOrigins} em web.xml,
 * separadas por vírgula. Use {@code *} para liberar qualquer origem (apenas em desenvolvimento).
 * Também responde às requisições de preflight (OPTIONS) que o navegador envia antes
 * de PUT, DELETE ou de requisições com Content-Type: application/json.
 */
public class CorsFilter implements Filter {

    private Set<String> origens = Collections.singleton("*");

    @Override
    public void init(FilterConfig config) {
        String param = config.getInitParameter("allowedOrigins");
        if (param != null && !param.trim().isEmpty()) {
            origens = Arrays.stream(param.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .collect(Collectors.collectingAndThen(Collectors.toSet(), Collections::unmodifiableSet));
        }
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse resp = (HttpServletResponse) response;

        String origem = req.getHeader("Origin");
        if (origem != null && permitida(origem)) {
            resp.setHeader("Access-Control-Allow-Origin", origens.contains("*") ? "*" : origem);
            resp.addHeader("Vary", "Origin");
            resp.setHeader("Access-Control-Expose-Headers", "Location");
        }

        boolean preflight = "OPTIONS".equalsIgnoreCase(req.getMethod())
                && req.getHeader("Access-Control-Request-Method") != null;
        if (preflight) {
            if (origem != null && permitida(origem)) {
                resp.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
                resp.setHeader("Access-Control-Allow-Headers", "Content-Type, X-HTTP-Method-Override");
                resp.setHeader("Access-Control-Max-Age", "3600");
            }
            resp.setStatus(HttpServletResponse.SC_NO_CONTENT);
            return;
        }
        chain.doFilter(request, response);
    }

    private boolean permitida(String origem) {
        return origens.contains("*") || origens.contains(origem);
    }

    @Override
    public void destroy() {
    }
}
