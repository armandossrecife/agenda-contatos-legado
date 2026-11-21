package br.ufpi.agenda.dao;

import br.ufpi.agenda.model.Contato;
import br.ufpi.agenda.model.Endereco;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Acesso a dados com JDBC puro.
 *
 * <p>Tabelas: {@code contato} (dados + endereço), {@code contato_telefone} e
 * {@code contato_email} (1:N, com ON DELETE CASCADE). Veja {@code database/schema.sql}.
 */
public class ContatoDao {

    private static final String SELECT_CONTATO =
            "SELECT id, nome, rua, cep, cidade, estado, pais FROM contato";

    private static final String FILTRO =
            " WHERE nome LIKE ?"
            + " OR id IN (SELECT contato_id FROM contato_email WHERE email LIKE ?)"
            + " OR id IN (SELECT contato_id FROM contato_telefone WHERE numero LIKE ?)";

    /** Lista contatos ordenados por nome. Se {@code filtro} não for vazio, busca por nome, e-mail ou telefone. */
    public List<Contato> listar(String filtro) throws SQLException {
        boolean filtrar = filtro != null && !filtro.trim().isEmpty();
        String sql = SELECT_CONTATO + (filtrar ? FILTRO : "") + " ORDER BY nome, id";

        try (Connection con = ConnectionFactory.getConnection();
             PreparedStatement ps = con.prepareStatement(sql)) {
            if (filtrar) {
                String like = "%" + filtro.trim() + "%";
                ps.setString(1, like);
                ps.setString(2, like);
                ps.setString(3, like);
            }
            Map<Long, Contato> porId = new LinkedHashMap<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Contato c = mapear(rs);
                    porId.put(c.getId(), c);
                }
            }
            carregarListas(con, porId);
            return new ArrayList<>(porId.values());
        }
    }

    /** Busca um contato pelo id; retorna {@code null} se não existir. */
    public Contato buscarPorId(long id) throws SQLException {
        try (Connection con = ConnectionFactory.getConnection();
             PreparedStatement ps = con.prepareStatement(SELECT_CONTATO + " WHERE id = ?")) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return null;
                }
                Contato c = mapear(rs);
                carregarListas(con, Collections.singletonMap(c.getId(), c));
                return c;
            }
        }
    }

    /** Insere o contato (e suas listas) numa única transação e devolve o id gerado. */
    public Contato inserir(Contato c) throws SQLException {
        String sql = "INSERT INTO contato (nome, rua, cep, cidade, estado, pais) VALUES (?, ?, ?, ?, ?, ?)";
        try (Connection con = ConnectionFactory.getConnection()) {
            con.setAutoCommit(false);
            try {
                try (PreparedStatement ps = con.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                    preencher(ps, c);
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        keys.next();
                        c.setId(keys.getLong(1));
                    }
                }
                inserirListas(con, c);
                con.commit();
                return c;
            } catch (SQLException | RuntimeException e) {
                con.rollback();
                throw e;
            }
        }
    }

    /** Atualiza o contato; as listas são substituídas. Retorna {@code false} se o id não existir. */
    public boolean atualizar(Contato c) throws SQLException {
        String sql = "UPDATE contato SET nome = ?, rua = ?, cep = ?, cidade = ?, estado = ?, pais = ? WHERE id = ?";
        try (Connection con = ConnectionFactory.getConnection()) {
            con.setAutoCommit(false);
            try {
                int linhas;
                try (PreparedStatement ps = con.prepareStatement(sql)) {
                    preencher(ps, c);
                    ps.setLong(7, c.getId());
                    linhas = ps.executeUpdate();
                }
                // No MySQL, UPDATE sem mudança real retorna 0 linhas: confirma se o id existe
                if (linhas == 0 && !existe(con, c.getId())) {
                    con.rollback();
                    return false;
                }
                excluirListas(con, c.getId());
                inserirListas(con, c);
                con.commit();
                return true;
            } catch (SQLException | RuntimeException e) {
                con.rollback();
                throw e;
            }
        }
    }

    /** Exclui o contato (telefones e e-mails saem por ON DELETE CASCADE). */
    public boolean excluir(long id) throws SQLException {
        try (Connection con = ConnectionFactory.getConnection();
             PreparedStatement ps = con.prepareStatement("DELETE FROM contato WHERE id = ?")) {
            ps.setLong(1, id);
            return ps.executeUpdate() > 0;
        }
    }

    // ------------------------------------------------------------------ auxiliares

    private static Contato mapear(ResultSet rs) throws SQLException {
        Contato c = new Contato();
        c.setId(rs.getLong("id"));
        c.setNome(rs.getString("nome"));
        c.setEndereco(new Endereco(
                rs.getString("rua"), rs.getString("cep"), rs.getString("cidade"),
                rs.getString("estado"), rs.getString("pais")));
        return c;
    }

    private static void preencher(PreparedStatement ps, Contato c) throws SQLException {
        Endereco e = c.getEndereco() != null ? c.getEndereco() : new Endereco();
        ps.setString(1, c.getNome());
        ps.setString(2, e.getRua());
        ps.setString(3, e.getCep());
        ps.setString(4, e.getCidade());
        ps.setString(5, e.getEstado());
        ps.setString(6, e.getPais());
    }

    private static boolean existe(Connection con, long id) throws SQLException {
        try (PreparedStatement ps = con.prepareStatement("SELECT 1 FROM contato WHERE id = ?")) {
            ps.setLong(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    /** Carrega telefones e e-mails de todos os contatos do mapa com duas consultas (evita N+1). */
    private static void carregarListas(Connection con, Map<Long, Contato> porId) throws SQLException {
        if (porId.isEmpty()) {
            return;
        }
        List<Long> ids = new ArrayList<>(porId.keySet());
        String in = String.join(",", Collections.nCopies(ids.size(), "?"));

        String sqlTel = "SELECT contato_id, numero FROM contato_telefone WHERE contato_id IN (" + in
                + ") ORDER BY contato_id, ordem, id";
        String sqlEmail = "SELECT contato_id, email FROM contato_email WHERE contato_id IN (" + in
                + ") ORDER BY contato_id, ordem, id";

        try (PreparedStatement ps = con.prepareStatement(sqlTel)) {
            bindIds(ps, ids);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    porId.get(rs.getLong(1)).getTelefones().add(rs.getString(2));
                }
            }
        }
        try (PreparedStatement ps = con.prepareStatement(sqlEmail)) {
            bindIds(ps, ids);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    porId.get(rs.getLong(1)).getEmails().add(rs.getString(2));
                }
            }
        }
    }

    private static void bindIds(PreparedStatement ps, List<Long> ids) throws SQLException {
        for (int i = 0; i < ids.size(); i++) {
            ps.setLong(i + 1, ids.get(i));
        }
    }

    private static void inserirListas(Connection con, Contato c) throws SQLException {
        inserirItens(con, "INSERT INTO contato_telefone (contato_id, numero, ordem) VALUES (?, ?, ?)",
                c.getId(), c.getTelefones());
        inserirItens(con, "INSERT INTO contato_email (contato_id, email, ordem) VALUES (?, ?, ?)",
                c.getId(), c.getEmails());
    }

    private static void inserirItens(Connection con, String sql, long contatoId, List<String> itens)
            throws SQLException {
        if (itens.isEmpty()) {
            return;
        }
        try (PreparedStatement ps = con.prepareStatement(sql)) {
            int ordem = 0;
            for (String item : itens) {
                ps.setLong(1, contatoId);
                ps.setString(2, item);
                ps.setInt(3, ordem++);
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    private static void excluirListas(Connection con, long id) throws SQLException {
        for (String sql : Arrays.asList(
                "DELETE FROM contato_telefone WHERE contato_id = ?",
                "DELETE FROM contato_email WHERE contato_id = ?")) {
            try (PreparedStatement ps = con.prepareStatement(sql)) {
                ps.setLong(1, id);
                ps.executeUpdate();
            }
        }
    }
}
