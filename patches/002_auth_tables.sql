-- =============================================
-- PATCH 002: Tablas de autenticación
-- Fecha: 2026-04-14
-- Descripción: Tablas para reset de contraseña y blacklist de tokens JWT
-- =============================================

USE SistemaTickets;
GO

-- =============================================
-- TABLA: Password_Reset_Tokens
-- Almacena tokens de 6 dígitos para reseteo de contraseña
-- =============================================
CREATE TABLE Password_Reset_Tokens (
    id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    id_usuario  UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Usuarios(id),
    token       VARCHAR(255) NOT NULL,
    expira_en   DATETIME     NOT NULL,
    usado       BIT          NOT NULL DEFAULT 0,
    creado_en   DATETIME     NOT NULL DEFAULT GETDATE()
);
GO

-- =============================================
-- TABLA: Token_Blacklist
-- Almacena tokens JWT invalidados por logout
-- =============================================
CREATE TABLE Token_Blacklist (
    id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    token       VARCHAR(500) NOT NULL,
    expira_en   DATETIME     NOT NULL,
    creado_en   DATETIME     NOT NULL DEFAULT GETDATE()
);
GO
