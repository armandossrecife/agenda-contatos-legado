package br.ufpi.agenda.service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Erro de validação de dados enviados pelo cliente (vira HTTP 400). */
public class ValidacaoException extends Exception {

    private static final long serialVersionUID = 1L;

    private final List<String> erros;

    public ValidacaoException(List<String> erros) {
        super(String.join("; ", erros));
        this.erros = Collections.unmodifiableList(new ArrayList<>(erros));
    }

    public List<String> getErros() {
        return erros;
    }
}
