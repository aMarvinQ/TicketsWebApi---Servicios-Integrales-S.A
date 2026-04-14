-- =============================================
-- PATCH 001: Creación de la base de datos y tablas principales
-- Fecha: 2026-04-13
-- =============================================

CREATE DATABASE SistemaTickets;
GO

USE SistemaTickets;
GO

-- Secuencia para numero legible del ticket
CREATE SEQUENCE seq_numero_ticket
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1
    NO CYCLE;
GO

-- =============================================
-- TABLA: Roles
-- =============================================
CREATE TABLE Roles (
    id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    nombre          VARCHAR(20)  NOT NULL,
    creado_en       DATETIME     NOT NULL DEFAULT GETDATE(),
    actualizado_en  DATETIME
);

-- =============================================
-- TABLA: Usuarios
-- =============================================
CREATE TABLE Usuarios (
    id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    nombre          VARCHAR(100) NOT NULL,
    apellido        VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password        VARCHAR(255) NOT NULL,
    telefono        VARCHAR(20),
    id_rol          UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Roles(id),
    activo          BIT          NOT NULL DEFAULT 1,
    creado_en       DATETIME     NOT NULL DEFAULT GETDATE(),
    creado_por      UNIQUEIDENTIFIER,
    actualizado_en  DATETIME,
    actualizado_por UNIQUEIDENTIFIER
);

-- =============================================
-- TABLA: Categorias
-- =============================================
CREATE TABLE Categorias (
    id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    nombre          VARCHAR(100) NOT NULL,
    descripcion     VARCHAR(255),
    activo          BIT          NOT NULL DEFAULT 1,
    creado_en       DATETIME     NOT NULL DEFAULT GETDATE(),
    creado_por      UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Usuarios(id),
    actualizado_en  DATETIME,
    actualizado_por UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Usuarios(id)
);

-- =============================================
-- TABLA: Tickets
-- =============================================
CREATE TABLE Tickets (
    id               UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    numero_ticket    INT          NOT NULL DEFAULT (NEXT VALUE FOR seq_numero_ticket),
    numero_legible   AS ('TKT-' + RIGHT('00000' + CAST(numero_ticket AS VARCHAR), 5)) PERSISTED,
    titulo           VARCHAR(200) NOT NULL,
    descripcion      TEXT         NOT NULL,
    canal            VARCHAR(20)  NOT NULL
                     CHECK (canal IN ('web', 'email', 'chat', 'telefono')),
    prioridad        VARCHAR(10)  NOT NULL
                     CHECK (prioridad IN ('critico', 'alto', 'medio', 'bajo')),
    estado           VARCHAR(20)  NOT NULL DEFAULT 'abierto'
                     CHECK (estado IN ('abierto', 'en_progreso', 'resuelto', 'cerrado')),
    id_categoria     UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Categorias(id),
    id_cliente       UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Usuarios(id),
    id_agente        UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Usuarios(id),
    fecha_cierre     DATETIME,
    creado_en        DATETIME     NOT NULL DEFAULT GETDATE(),
    creado_por       UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Usuarios(id),
    actualizado_en   DATETIME,
    actualizado_por  UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Usuarios(id)
);

-- =============================================
-- TABLA: Notas
-- =============================================
CREATE TABLE Notas (
    id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    id_ticket       UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Tickets(id),
    id_usuario      UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Usuarios(id),
    contenido       TEXT         NOT NULL,
    es_interna      BIT          NOT NULL DEFAULT 0,
    creado_en       DATETIME     NOT NULL DEFAULT GETDATE(),
    creado_por      UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Usuarios(id),
    actualizado_en  DATETIME,
    actualizado_por UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Usuarios(id)
);

-- =============================================
-- TABLA: Historial_Tickets
-- =============================================
CREATE TABLE Historial_Tickets (
    id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    id_ticket   UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Tickets(id),
    id_usuario  UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Usuarios(id),
    accion      VARCHAR(50)  NOT NULL
                CHECK (accion IN ('creacion', 'asignacion', 'cambio_estado', 'nota_agregada', 'cierre')),
    detalle     VARCHAR(255),
    creado_en   DATETIME     NOT NULL DEFAULT GETDATE()
);

-- =============================================
-- TABLA: Reglas_Asignacion
-- =============================================
CREATE TABLE Reglas_Asignacion (
    id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    id_categoria    UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Categorias(id),
    prioridad       VARCHAR(10)
                    CHECK (prioridad IN ('critico', 'alto', 'medio', 'bajo')),
    id_agente       UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Usuarios(id),
    activo          BIT          NOT NULL DEFAULT 1,
    creado_en       DATETIME     NOT NULL DEFAULT GETDATE(),
    creado_por      UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Usuarios(id),
    actualizado_en  DATETIME,
    actualizado_por UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Usuarios(id)
);
GO

-- =============================================
-- DATOS INICIALES
-- =============================================
INSERT INTO Roles (id, nombre) VALUES
    (NEWID(), 'admin'),
    (NEWID(), 'agente'),
    (NEWID(), 'cliente');

INSERT INTO Categorias (id, nombre, descripcion) VALUES
    (NEWID(), 'Soporte Tecnico', 'Problemas tecnicos y de sistema'),
    (NEWID(), 'Ventas',          'Consultas y reclamos sobre ventas'),
    (NEWID(), 'Facturacion',     'Problemas con facturas y cobros'),
    (NEWID(), 'General',         'Consultas generales');
GO
