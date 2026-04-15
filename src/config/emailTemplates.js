const resetPasswordTemplate = ({ nombre, token }) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #1a73e8; padding: 30px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; }
    .body { padding: 30px; color: #333333; }
    .body p { line-height: 1.6; }
    .token-box { background: #f0f4ff; border: 1px dashed #1a73e8; border-radius: 6px; padding: 16px; text-align: center; margin: 24px 0; }
    .token-box span { font-size: 22px; font-weight: bold; letter-spacing: 4px; color: #1a73e8; }
    .footer { background: #f4f4f4; padding: 16px; text-align: center; font-size: 12px; color: #999999; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Servicios Integrales S.A.</h1>
    </div>
    <div class="body">
      <p>Hola, <strong>${nombre}</strong>.</p>
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta. Usa el siguiente código para continuar:</p>
      <div class="token-box">
        <span>${token}</span>
      </div>
      <p>Este código expira en <strong>30 minutos</strong>. Si no solicitaste este cambio, ignora este correo.</p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Servicios Integrales S.A. — Sistema de Tickets
    </div>
  </div>
</body>
</html>
`;

const bienvenidaClienteTemplate = ({ nombre, email, password, loginUrl = '#' }) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #1a73e8; padding: 30px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; }
    .body { padding: 30px; color: #333333; }
    .body p { line-height: 1.6; }
    .credentials-box { background: #f0f4ff; border: 1px solid #1a73e8; border-radius: 6px; padding: 20px; margin: 24px 0; }
    .credentials-box p { margin: 6px 0; font-size: 15px; }
    .credentials-box strong { color: #1a73e8; }
    .btn { display: inline-block; margin-top: 24px; padding: 12px 28px; background: #1a73e8; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 15px; }
    .footer { background: #f4f4f4; padding: 16px; text-align: center; font-size: 12px; color: #999999; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Servicios Integrales S.A.</h1>
    </div>
    <div class="body">
      <p>Hola, <strong>${nombre}</strong>.</p>
      <p>Tu cuenta ha sido creada en el <strong>Sistema de Tickets de Servicios Integrales S.A.</strong> Aquí están tus credenciales de acceso:</p>
      <div class="credentials-box">
        <p>Usuario (email): <strong>${email}</strong></p>
        <p>Contraseña temporal: <strong>${password}</strong></p>
      </div>
      <p>Puedes cambiar tu contraseña en cualquier momento desde tu perfil una vez que inicies sesión.</p>
      <a href="${loginUrl}" class="btn">Iniciar sesión</a>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Servicios Integrales S.A. — Sistema de Tickets
    </div>
  </div>
</body>
</html>
`;

const ticketCreadoTemplate = ({ nombre, numero_legible, titulo, descripcion, categoria, agente_asignado, canal_email = false, ticketUrl = '#' }) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #1a73e8; padding: 30px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; }
    .header p  { color: #d0e4ff; margin: 8px 0 0; font-size: 14px; }
    .body { padding: 30px; color: #333333; }
    .body p { line-height: 1.6; }
    .ticket-box { background: #f0f4ff; border: 1px solid #1a73e8; border-radius: 6px; padding: 20px; margin: 24px 0; }
    .ticket-box table { width: 100%; border-collapse: collapse; }
    .ticket-box td { padding: 6px 4px; font-size: 14px; vertical-align: top; }
    .ticket-box td:first-child { color: #666666; width: 130px; }
    .ticket-box td:last-child { color: #111111; font-weight: bold; }
    .btn { display: inline-block; margin-top: 24px; padding: 12px 28px; background: #1a73e8; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 15px; }
    .footer { background: #f4f4f4; padding: 16px; text-align: center; font-size: 12px; color: #999999; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Servicios Integrales S.A.</h1>
      <p>Confirmación de ticket de soporte</p>
    </div>
    <div class="body">
      <p>Hola, <strong>${nombre}</strong>.</p>
      <p>Tu solicitud de soporte ha sido registrada exitosamente. A continuación el detalle:</p>
      <div class="ticket-box">
        <table>
          <tr>
            <td>N° de ticket:</td>
            <td>${numero_legible}</td>
          </tr>
          <tr>
            <td>Título:</td>
            <td>${titulo}</td>
          </tr>
          <tr>
            <td>Descripción:</td>
            <td>${descripcion}</td>
          </tr>
          <tr>
            <td>Categoría:</td>
            <td>${categoria}</td>
          </tr>
          <tr>
            <td>Estado:</td>
            <td>${agente_asignado ? 'En proceso de atención' : 'Pendiente de asignación'}</td>
          </tr>
        </table>
      </div>
      ${canal_email
        ? `<p>Un agente revisará tu solicitud y se pondrá en contacto contigo a través de este correo electrónico a la brevedad posible.</p>
      <p>También puedes revisar el estado de tu ticket accediendo a tu cuenta en la sección <strong>Mis Solicitudes</strong>.</p>`
        : `<p>Nos pondremos en contacto contigo a la brevedad posible. Puedes revisar el estado de tu ticket en cualquier momento accediendo a tu cuenta en la sección <strong>Mis Solicitudes</strong>.</p>`
      }
      <a href="${ticketUrl}" class="btn">Ver mis solicitudes</a>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Servicios Integrales S.A. — Sistema de Tickets
    </div>
  </div>
</body>
</html>
`;

module.exports = { resetPasswordTemplate, bienvenidaClienteTemplate, ticketCreadoTemplate };
