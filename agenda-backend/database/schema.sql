-- =====================================================================
-- Agenda de Contatos - criação do banco, do usuário e das tabelas
-- Compatível com MySQL 5.7, 8.x e 9.x (e MariaDB 10.3+).
--
-- Executar como administrador, por exemplo:
--   sudo mysql < database/schema.sql
-- =====================================================================

CREATE DATABASE IF NOT EXISTS agenda
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- Usuário da aplicação (o mesmo do db.properties)
CREATE USER IF NOT EXISTS 'agenda'@'localhost' IDENTIFIED BY 'agenda';
GRANT SELECT, INSERT, UPDATE, DELETE ON agenda.* TO 'agenda'@'localhost';
FLUSH PRIVILEGES;

USE agenda;

DROP TABLE IF EXISTS contato_email;
DROP TABLE IF EXISTS contato_telefone;
DROP TABLE IF EXISTS contato;

-- Dados do contato; o endereço fica nas colunas da própria tabela
CREATE TABLE contato (
    id      BIGINT       NOT NULL AUTO_INCREMENT,
    nome    VARCHAR(120) NOT NULL,
    rua     VARCHAR(200) NULL,
    cep     VARCHAR(20)  NULL,
    cidade  VARCHAR(100) NULL,
    estado  VARCHAR(60)  NULL,
    pais    VARCHAR(60)  NULL,
    PRIMARY KEY (id),
    INDEX idx_contato_nome (nome)
) ENGINE = InnoDB;

-- Telefones (1:N); "ordem" preserva a sequência enviada pelo cliente
CREATE TABLE contato_telefone (
    id          BIGINT      NOT NULL AUTO_INCREMENT,
    contato_id  BIGINT      NOT NULL,
    numero      VARCHAR(30) NOT NULL,
    ordem       INT         NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    INDEX idx_telefone_contato (contato_id, ordem),
    CONSTRAINT fk_telefone_contato FOREIGN KEY (contato_id)
        REFERENCES contato (id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- E-mails (1:N)
CREATE TABLE contato_email (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    contato_id  BIGINT       NOT NULL,
    email       VARCHAR(150) NOT NULL,
    ordem       INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    INDEX idx_email_contato (contato_id, ordem),
    CONSTRAINT fk_email_contato FOREIGN KEY (contato_id)
        REFERENCES contato (id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- Dados de exemplo
-- ---------------------------------------------------------------------
INSERT INTO contato (id, nome, rua, cep, cidade, estado, pais) VALUES
    (1, 'Ana Souza',      'Av. Universitária, 1310', '64049-550', 'Teresina', 'PI', 'Brasil'),
    (2, 'Bruno Carvalho', 'Rua Areolino de Abreu, 100', '64000-180', 'Teresina', 'PI', 'Brasil'),
    (3, 'Carla Mendes',   NULL, NULL, 'Parnaíba', 'PI', 'Brasil');

INSERT INTO contato_telefone (contato_id, numero, ordem) VALUES
    (1, '(86) 99999-0000', 0),
    (1, '(86) 3215-5500', 1),
    (2, '(86) 98888-1111', 0),
    (3, '(86) 97777-2222', 0);

INSERT INTO contato_email (contato_id, email, ordem) VALUES
    (1, 'ana@ufpi.edu.br', 0),
    (2, 'bruno@exemplo.com', 0),
    (2, 'bruno.carvalho@exemplo.com', 1);
