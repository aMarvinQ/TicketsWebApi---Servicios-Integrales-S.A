-- =============================================
-- PATCH 004: Agregar prioridad_default a Categorias
-- Fecha: 2026-04-14
-- Descripción: Agrega campo prioridad_default a Categorias para que el
--              sistema asigne automáticamente la prioridad al crear un ticket
-- =============================================

USE SistemaTickets;
GO

ALTER TABLE Categorias
ADD prioridad_default VARCHAR(10) DEFAULT 'bajo'
CHECK (prioridad_default IN ('critico', 'alto', 'medio', 'bajo'));
GO

-- Valores predeterminados por categoría
UPDATE Categorias SET prioridad_default = 'critico' WHERE nombre = 'Soporte Tecnico';
UPDATE Categorias SET prioridad_default = 'alto'    WHERE nombre = 'Facturacion';
UPDATE Categorias SET prioridad_default = 'medio'   WHERE nombre = 'Ventas';
UPDATE Categorias SET prioridad_default = 'bajo'    WHERE nombre = 'General';
GO
