-- =============================================
-- PATCH 003: Agregar canales presencial y forms
-- Fecha: 2026-04-14
-- Descripción: Amplía los valores permitidos del campo canal en Tickets
-- =============================================

USE SistemaTickets;
GO

DECLARE @constraint NVARCHAR(200);
SELECT @constraint = name FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID('Tickets') AND name LIKE '%canal%';

EXEC('ALTER TABLE Tickets DROP CONSTRAINT ' + @constraint);
GO

ALTER TABLE Tickets ADD CONSTRAINT CK_Tickets_canal
CHECK (canal IN ('web', 'email', 'chat', 'telefono', 'presencial', 'forms'));
GO
