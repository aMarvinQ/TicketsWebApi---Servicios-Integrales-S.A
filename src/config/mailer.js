const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

const enviarCorreo = async ({ para, asunto, html }) => {
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: para,
    subject: asunto,
    html,
  });
};

module.exports = { enviarCorreo };
