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

module.exports = { resetPasswordTemplate };
