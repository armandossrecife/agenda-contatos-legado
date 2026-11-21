package br.ufpi.agenda.dao;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Properties;

/**
 * Fábrica de conexões JDBC.
 *
 * <p>Ordem de prioridade de cada parâmetro:
 * <ol>
 *   <li>propriedade de sistema ({@code -Ddb.url=...});</li>
 *   <li>variável de ambiente ({@code DB_URL});</li>
 *   <li>arquivo {@code db.properties} no classpath.</li>
 * </ol>
 */
public final class ConnectionFactory {

    private static final Properties CONFIG = carregarConfig();

    private static final String URL = valor("db.url", "DB_URL", true);
    private static final String USER = valor("db.user", "DB_USER", true);
    private static final String PASSWORD = valor("db.password", "DB_PASSWORD", false); // pode ser vazia

    static {
        try {
            // Necessário em aplicações web: o driver está em WEB-INF/lib, não no classpath do Tomcat
            Class.forName("com.mysql.cj.jdbc.Driver");
        } catch (ClassNotFoundException e) {
            throw new IllegalStateException("Driver MySQL não encontrado no classpath", e);
        }
    }

    private ConnectionFactory() {
    }

    public static Connection getConnection() throws SQLException {
        return DriverManager.getConnection(URL, USER, PASSWORD);
    }

    private static Properties carregarConfig() {
        Properties props = new Properties();
        try (InputStream in = ConnectionFactory.class.getClassLoader().getResourceAsStream("db.properties")) {
            if (in != null) {
                props.load(in);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Não foi possível ler db.properties", e);
        }
        return props;
    }

    private static String valor(String chave, String variavelAmbiente, boolean obrigatorio) {
        String v = System.getProperty(chave);
        if (vazio(v)) {
            v = System.getenv(variavelAmbiente);
        }
        if (vazio(v)) {
            v = CONFIG.getProperty(chave);
        }
        if (vazio(v)) {
            if (!obrigatorio) {
                return "";
            }
            throw new IllegalStateException("Configuração ausente: " + chave + " (ou variável " + variavelAmbiente + ")");
        }
        return v.trim();
    }

    /** Equivalente ao String.isBlank() do Java 11. */
    private static boolean vazio(String s) {
        return s == null || s.trim().isEmpty();
    }
}
