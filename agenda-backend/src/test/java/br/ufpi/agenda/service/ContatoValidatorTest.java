package br.ufpi.agenda.service;

import br.ufpi.agenda.model.Contato;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ContatoValidatorTest {

    private final ContatoValidator validator = new ContatoValidator();

    @Test
    void normalizaEspacosListasVaziasEDuplicadas() throws Exception {
        Contato c = new Contato();
        c.setNome("  Ana Souza  ");
        // Arrays.asList aceita elementos null
        c.setTelefones(Arrays.asList(" (86) 99999-0000 ", "", "(86) 99999-0000", null));
        c.setEmails(Arrays.asList("ana@ufpi.edu.br", "   "));
        c.getEndereco().setCidade("  Teresina ");
        c.getEndereco().setRua("   ");

        validator.normalizarEValidar(c);

        assertEquals("Ana Souza", c.getNome());
        assertEquals(Arrays.asList("(86) 99999-0000"), c.getTelefones());
        assertEquals(Arrays.asList("ana@ufpi.edu.br"), c.getEmails());
        assertEquals("Teresina", c.getEndereco().getCidade());
        assertNull(c.getEndereco().getRua());
    }

    @Test
    void rejeitaNomeVazioEEmailInvalido() {
        Contato c = new Contato();
        c.setNome("   ");
        c.setEmails(Arrays.asList("sem-arroba"));

        ValidacaoException e = assertThrows(ValidacaoException.class, () -> validator.normalizarEValidar(c));

        assertEquals(2, e.getErros().size());
        assertTrue(e.getMessage().contains("nome"));
        assertTrue(e.getMessage().contains("sem-arroba"));
    }

    @Test
    void aceitaListasNulasEEnderecoNulo() throws Exception {
        Contato c = new Contato();
        c.setNome("Bob");
        c.setTelefones(null);
        c.setEmails(null);
        c.setEndereco(null);

        validator.normalizarEValidar(c);

        assertTrue(c.getTelefones().isEmpty());
        assertTrue(c.getEmails().isEmpty());
        assertNull(c.getEndereco().getPais());
    }

    @Test
    void rejeitaTelefoneComLetras() {
        Contato c = new Contato();
        c.setNome("Carla");
        c.setTelefones(Arrays.asList("ligar depois"));
        assertThrows(ValidacaoException.class, () -> validator.normalizarEValidar(c));
    }

    @Test
    void rejeitaCorpoNulo() {
        assertThrows(ValidacaoException.class, () -> validator.normalizarEValidar(null));
    }
}
